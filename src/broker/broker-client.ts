import { EventEmitter } from 'events';
import { Socket } from 'net';
import { v4 as uuidv4 } from 'uuid';
import { BrokerMessage } from './types';
import { logError, logInfo, logWarn } from '../utils/logger';

export interface BrokerClientConfig {
  host: string;
  port: number;
  clientId: string;
  clientType: 'mcp-server' | 'cli';
  reconnectDelay: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

const DEFAULT_CONFIG: Partial<BrokerClientConfig> = {
  host: 'localhost',
  port: 8765,
  reconnectDelay: 1000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 5000
};

export class BrokerClient extends EventEmitter {
  private config: BrokerClientConfig;
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private buffer: string = '';
  private pendingResponses: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

  constructor(config: Partial<BrokerClientConfig> & { clientId: string; clientType: 'mcp-server' | 'cli' }) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as BrokerClientConfig;
  }

  async connect(): Promise<void> {
    if (this.isConnected || this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = new Socket();

      this.socket.on('connect', async () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        

        // Register with broker
        await this.register();
        
        // Start heartbeat
        this.startHeartbeat();
        
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.handleDisconnect();
      });

      this.socket.on('error', async (error: Error) => {
        const isConnectionRefused = (error as any).code === 'ECONNREFUSED';
        
        if (isConnectionRefused && !this.isConnected) {
          // Provide helpful error message for connection refused
          const brokerError = new Error(
            `Cannot connect to message broker on port ${this.config.port}. ` +
            `Please start the broker first with: ./bin/rubberduck broker`
          );
          reject(brokerError);
        } else {
          await logError('Broker client socket error', error, { 
            clientId: this.config.clientId 
          });
            
          if (!this.isConnected) {
            reject(error);
          } else {
            this.handleDisconnect();
          }
        }
      });

      // Attempt connection
      this.socket.connect(this.config.port, this.config.host);
      
      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.socket?.destroy();
          reject(new Error(
            `Connection timeout to message broker on port ${this.config.port}. ` +
            `Please ensure the broker is running: ./bin/rubberduck broker`
          ));
        }
      }, 5000);

      this.once('connected', () => {
        clearTimeout(connectionTimeout);
      });
    });
  }

  private async register(): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to broker');
    }

    const message: BrokerMessage = {
      id: uuidv4(),
      type: 'register',
      clientId: this.config.clientId,
      clientType: this.config.clientType,
      timestamp: Date.now(),
      data: {}
    };

    await this.sendMessage(message);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    
    // Process complete messages (separated by newlines)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: BrokerMessage = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          logError('Error parsing message from broker', error as Error, {
            clientId: this.config.clientId,
            rawLine: line
          });
        }
      }
    }
  }

  private async handleMessage(message: BrokerMessage): Promise<void> {
    switch (message.type) {
      case 'sync':
        // Registration confirmation or sync message
        this.emit('sync', message.data);
        break;
        
      case 'clarification':
        this.emit('clarification', message.data);
        break;
        
      case 'yap':
        this.emit('yap', message.data);
        break;
        
      case 'response':
        this.handleResponse(message);
        break;
        
      case 'error':
        await logError('Broker error message', new Error(message.data.error), {
          clientId: this.config.clientId
        });
        this.emit('error', message.data.error);
        break;
        
      default:
        await logWarn('Unknown message type from broker', { 
          type: message.type,
          clientId: this.config.clientId
        });
    }
  }

  private handleResponse(message: BrokerMessage): void {
    const { requestId, response, error } = message.data;
    
    const pending = this.pendingResponses.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingResponses.delete(requestId);
      
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(response);
      }
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket = null;
    }

    // Reject all pending responses
    for (const [requestId, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection lost'));
    }
    this.pendingResponses.clear();

    if (wasConnected) {
      logWarn('Disconnected from message broker', { 
        clientId: this.config.clientId 
      });
      
      this.emit('disconnected');
      
      // Attempt reconnection
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logError('Max reconnection attempts reached', new Error('Max reconnection attempts exceeded'), {
        clientId: this.config.clientId,
        attempts: this.reconnectAttempts
      });
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logInfo('Scheduling reconnection attempt', {
      clientId: this.config.clientId,
      attempt: this.reconnectAttempts,
      delay
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Connection failed, will schedule another attempt
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.sendMessage({
            id: uuidv4(),
            type: 'heartbeat',
            clientId: this.config.clientId,
            clientType: this.config.clientType,
            timestamp: Date.now(),
            data: {}
          });
        } catch (error) {
          // Heartbeat failed, connection will be handled by error event
        }
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async sendMessage(message: BrokerMessage): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to broker');
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message) + '\n';
      
      this.socket!.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async sendClarification(clarification: any): Promise<void> {
    await this.sendMessage({
      id: uuidv4(),
      type: 'clarification',
      clientId: this.config.clientId,
      clientType: this.config.clientType,
      timestamp: Date.now(),
      data: clarification
    });
  }

  async sendYap(yap: any): Promise<void> {
    await this.sendMessage({
      id: uuidv4(),
      type: 'yap',
      clientId: this.config.clientId,
      clientType: this.config.clientType,
      timestamp: Date.now(),
      data: yap
    });
  }

  async sendResponse(requestId: string, response: string): Promise<void> {
    await this.sendMessage({
      id: uuidv4(),
      type: 'response',
      clientId: this.config.clientId,
      clientType: this.config.clientType,
      timestamp: Date.now(),
      data: { requestId, response }
    });
  }

  async waitForResponse(requestId: string, timeoutMs: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        reject(new Error('Response timeout'));
      }, timeoutMs);

      this.pendingResponses.set(requestId, {
        resolve,
        reject,
        timeout
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.socket && this.isConnected) {
      this.socket.end();
      // Wait for close event
      await new Promise<void>((resolve) => {
        if (this.socket) {
          this.socket.once('close', resolve);
        } else {
          resolve();
        }
      });
    }

    this.isConnected = false;
    this.socket = null;
  }

  getConnectionStatus(): {
    isConnected: boolean;
    reconnectAttempts: number;
    clientId: string;
    clientType: string;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      clientId: this.config.clientId,
      clientType: this.config.clientType
    };
  }
}