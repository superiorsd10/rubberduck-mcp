import { createServer, Server, Socket } from 'net';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ClarificationRequest, YapMessage } from '../types/index';
import { BrokerMessage, ClientInfo, BrokerConfig } from './types';
import { MessageRouter } from './message-router';
import { logError, logInfo, logWarn } from '../utils/logger';

const DEFAULT_CONFIG: BrokerConfig = {
  port: 8765,
  yapBufferMs: 200,
  maxClarificationQueue: 10,
  heartbeatInterval: 5000,
  clientTimeout: 15000
};

export class MessageBroker extends EventEmitter {
  private server: Server;
  private clients: Map<string, ClientInfo> = new Map();
  private messageRouter: MessageRouter;
  private config: BrokerConfig;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BrokerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.server = createServer();
    this.messageRouter = new MessageRouter(
      this.config.yapBufferMs,
      this.config.maxClarificationQueue
    );
    
    this.setupMessageRouterEvents();
    this.setupServerEvents();
  }

  private setupMessageRouterEvents(): void {
    this.messageRouter.on('processClarificationQueue', (cliId: string) => {
      this.processNextClarificationForCli(cliId);
    });

    this.messageRouter.on('clarificationActive', async (cliId: string, clarification: ClarificationRequest) => {
      await this.sendToCli(cliId, {
        id: uuidv4(),
        type: 'clarification',
        clientId: 'broker',
        clientType: 'mcp-server',
        timestamp: Date.now(),
        data: clarification
      });
    });

    this.messageRouter.on('flushYaps', async (cliId: string, yaps: YapMessage[]) => {
      for (const yap of yaps) {
        await this.sendToCli(cliId, {
          id: uuidv4(),
          type: 'yap',
          clientId: 'broker',
          clientType: 'mcp-server',
          timestamp: Date.now(),
          data: yap
        });
      }
    });

    this.messageRouter.on('clarificationResponse', async (requestId: string, response: string, cliId: string) => {
      // Find the MCP server waiting for this response
      await this.broadcastToMcpServers({
        id: uuidv4(),
        type: 'response',
        clientId: cliId,
        clientType: 'cli',
        timestamp: Date.now(),
        data: {
          requestId,
          response,
          cliId
        }
      });
    });

    this.messageRouter.on('clarificationsTimeout', async (cliId: string, clarifications: ClarificationRequest[]) => {
      // Notify CLI about timed out clarifications
      for (const clarification of clarifications) {
        await this.sendToCli(cliId, {
          id: uuidv4(),
          type: 'clarification',
          clientId: 'broker',
          clientType: 'mcp-server',
          timestamp: Date.now(),
          data: {
            ...clarification,
            status: 'timeout'
          }
        });
      }
    });
  }

  private setupServerEvents(): void {
    this.server.on('connection', async (socket: Socket) => {
      await this.handleNewConnection(socket);
    });

    this.server.on('error', async (error: Error) => {
      await logError('Message broker server error', error);
      this.emit('error', error);
    });

    this.server.on('close', () => {
      this.isRunning = false;
      this.emit('close');
    });
  }

  private async handleNewConnection(socket: Socket): Promise<void> {
    const connectionId = uuidv4();
    
    socket.on('data', async (data: Buffer) => {
      try {
        const message: BrokerMessage = JSON.parse(data.toString());
        await this.handleMessage(connectionId, socket, message);
      } catch (error) {
        await logError('Error parsing message from client', error as Error, {
          connectionId,
          rawData: data.toString()
        });
        this.sendError(socket, 'Invalid message format');
      }
    });

    socket.on('close', async () => {
      await this.handleClientDisconnect(connectionId);
    });

    socket.on('error', async (error: Error) => {
      await logError('Client socket error', error, { connectionId });
      await this.handleClientDisconnect(connectionId);
    });

    await logInfo('New client connection', { connectionId });
  }

  private async handleMessage(connectionId: string, socket: Socket, message: BrokerMessage): Promise<void> {
    switch (message.type) {
      case 'register':
        await this.handleClientRegistration(connectionId, socket, message);
        break;
        
      case 'clarification':
        await this.handleClarificationMessage(message);
        break;
        
      case 'yap':
        await this.handleYapMessage(message);
        break;
        
      case 'response':
        await this.handleResponseMessage(message);
        break;
        
      case 'heartbeat':
        await this.handleHeartbeat(message);
        break;
        
      default:
        await logWarn('Unknown message type', { 
          type: message.type, 
          clientId: message.clientId 
        });
    }
  }

  private async handleClientRegistration(connectionId: string, socket: Socket, message: BrokerMessage): Promise<void> {
    const clientInfo: ClientInfo = {
      id: message.clientId,
      type: message.clientType,
      socket: socket,
      lastSeen: Date.now()
    };

    this.clients.set(message.clientId, clientInfo);

    await logInfo('Client registered', {
      clientId: message.clientId,
      clientType: message.clientType,
      connectionId
    });

    // Send registration confirmation
    await this.sendToClient(message.clientId, {
      id: uuidv4(),
      type: 'sync',
      clientId: 'broker',
      clientType: 'mcp-server',
      timestamp: Date.now(),
      data: { status: 'registered' }
    });

    // If this is a CLI, process any pending clarifications
    if (message.clientType === 'cli') {
      this.processNextClarificationForCli(message.clientId);
    }
  }

  private async handleClarificationMessage(message: BrokerMessage): Promise<void> {
    const clarification = message.data as ClarificationRequest;
    
    const targetCliId = await this.messageRouter.routeClarification(
      clarification,
      message.clientId,
      this.clients
    );

    if (!targetCliId) {
      // No CLI available, send error back to MCP server
      await this.sendToClient(message.clientId, {
        id: uuidv4(),
        type: 'response',
        clientId: 'broker',
        clientType: 'mcp-server',
        timestamp: Date.now(),
        data: {
          requestId: clarification.id,
          response: null,
          error: 'No CLI clients available'
        }
      });
    }
  }

  private async handleYapMessage(message: BrokerMessage): Promise<void> {
    const yap = message.data as YapMessage;
    
    await this.messageRouter.routeYap(
      yap,
      message.clientId,
      this.clients
    );
  }

  private async handleResponseMessage(message: BrokerMessage): Promise<void> {
    const { requestId, response } = message.data;
    
    this.messageRouter.handleClarificationResponse(
      requestId,
      response,
      message.clientId
    );
  }

  private async handleHeartbeat(message: BrokerMessage): Promise<void> {
    const client = this.clients.get(message.clientId);
    if (client) {
      client.lastSeen = Date.now();
    }
  }

  private processNextClarificationForCli(cliId: string): void {
    const nextClarification = this.messageRouter.processNextClarification(cliId);
    // The MessageRouter will emit 'clarificationActive' event which we handle above
  }

  private async sendToClient(clientId: string, message: BrokerMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (client && client.socket && !client.socket.destroyed) {
      try {
        const data = JSON.stringify(message) + '\n';
        client.socket.write(data);
      } catch (error) {
        await logError('Error sending message to client', error as Error, { clientId });
        await this.handleClientDisconnect(clientId);
      }
    }
  }

  private async sendToCli(cliId: string, message: BrokerMessage): Promise<void> {
    const client = this.clients.get(cliId);
    if (client && client.type === 'cli') {
      await this.sendToClient(cliId, message);
    }
  }

  private async broadcastToMcpServers(message: BrokerMessage): Promise<void> {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.type === 'mcp-server') {
        await this.sendToClient(clientId, message);
      }
    }
  }

  private sendError(socket: Socket, error: string): void {
    try {
      const errorMessage = JSON.stringify({
        id: uuidv4(),
        type: 'error',
        clientId: 'broker',
        clientType: 'mcp-server',
        timestamp: Date.now(),
        data: { error }
      }) + '\n';
      
      socket.write(errorMessage);
    } catch (err) {
      // Ignore send errors
    }
  }

  private async handleClientDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      await logInfo('Client disconnected', { 
        clientId, 
        clientType: client.type 
      });
      
      this.clients.delete(clientId);
      this.messageRouter.removeClient(clientId);
      this.emit('clientDisconnected', clientId, client.type);
    }
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastSeen > this.config.clientTimeout) {
          staleClients.push(clientId);
        }
      }

      for (const clientId of staleClients) {
        logWarn('Client timed out', { clientId });
        this.handleClientDisconnect(clientId);
      }
    }, this.config.heartbeatInterval);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, () => {
        this.isRunning = true;
        this.startHeartbeatMonitoring();
        
        logInfo('Message broker started', { 
          port: this.config.port,
          config: this.config 
        });
        
        this.emit('started');
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isRunning = false;

      // Stop heartbeat monitoring
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      for (const [clientId, client] of this.clients.entries()) {
        if (client.socket && !client.socket.destroyed) {
          client.socket.end();
        }
      }

      this.clients.clear();
      this.messageRouter.cleanup();

      // Close server
      this.server.close(() => {
        logInfo('Message broker stopped');
        this.emit('stopped');
        resolve();
      });
    });
  }

  getStatus(): {
    isRunning: boolean;
    clientCount: number;
    clients: Array<{ id: string; type: string; lastSeen: number }>;
    config: BrokerConfig;
  } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      clients: Array.from(this.clients.entries()).map(([id, client]) => ({
        id,
        type: client.type,
        lastSeen: client.lastSeen
      })),
      config: this.config
    };
  }
}