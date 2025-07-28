import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ClarificationRequest, YapMessage } from '../types/index';
import { BrokerClient } from '../broker/broker-client';
import { logError, logInfo, logWarn } from '../utils/logger';

export class MessageQueue extends EventEmitter {
  private brokerClient: BrokerClient;
  private sessionId: string;
  private isRunning: boolean = false;
  private pendingResponses: Map<string, {
    resolve: (response: string | null) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    
    // Create broker client with session-based client ID
    this.brokerClient = new BrokerClient({
      clientId: sessionId,
      clientType: 'mcp-server',
      host: 'localhost',
      port: 8765
    });
    
    this.setupBrokerEvents();
  }

  private setupBrokerEvents(): void {
    this.brokerClient.on('connected', () => {
      this.isRunning = true;
      this.emit('connected');
    });

    this.brokerClient.on('disconnected', () => {
      this.isRunning = false;
      this.emit('disconnected');
    });

    this.brokerClient.on('clarification', (clarification: ClarificationRequest) => {
      this.emit('clarificationAdded', clarification);
    });

    this.brokerClient.on('yap', (yap: YapMessage) => {
      this.emit('yapAdded', yap);
    });

    this.brokerClient.on('error', async (error: string) => {
      await logError('Broker client error', new Error(error), {
        sessionId: this.sessionId
      });
    });
  }

  async startCLI(): Promise<void> {
    // CLI mode - reconfigure broker client as CLI type
    this.brokerClient = new BrokerClient({
      clientId: this.sessionId,
      clientType: 'cli',
      host: 'localhost',
      port: 8765
    });
    
    this.setupBrokerEvents();
    await this.brokerClient.connect();
  }

  async startServer(): Promise<void> {
    // Server mode - keep as MCP server type
    await this.brokerClient.connect();
  }

  async addMessage(type: 'clarification' | 'yap', data: ClarificationRequest | YapMessage): Promise<void> {
    try {
      if (type === 'clarification') {
        await this.brokerClient.sendClarification(data);
      } else if (type === 'yap') {
        await this.brokerClient.sendYap(data);
      }
    } catch (error) {
      await logError('Error sending message to broker', error as Error, {
        sessionId: this.sessionId,
        messageType: type,
        messageId: data.id
      });
      throw error;
    }
  }

  async sendClarificationResponse(id: string, response: string): Promise<void> {
    try {
      await this.brokerClient.sendResponse(id, response);
    } catch (error) {
      await logError('Error sending clarification response to broker', error as Error, {
        sessionId: this.sessionId,
        clarificationId: id
      });
      throw error;
    }
  }

  async waitForResponse(id: string, timeoutMs: number): Promise<string | null> {
    try {
      const response = await this.brokerClient.waitForResponse(id, timeoutMs);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message === 'Response timeout') {
        return null;
      }
      
      await logError('Error waiting for response from broker', error as Error, {
        sessionId: this.sessionId,
        clarificationId: id
      });
      return null;
    }
  }

  stop(): void {
    this.isRunning = false;
    
    // Clear pending responses
    for (const [id, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pendingResponses.clear();
    
    this.removeAllListeners();
  }

  async cleanup(): Promise<void> {
    this.stop();
    
    try {
      await this.brokerClient.disconnect();
    } catch (error) {
      await logError('Error disconnecting from broker during cleanup', error as Error, {
        sessionId: this.sessionId
      });
    }
  }

  getConnectionStatus(): {
    isConnected: boolean;
    clientId: string;
    clientType: string;
  } {
    return this.brokerClient.getConnectionStatus();
  }
}