import { createConnection } from 'net';
import { MessageBroker } from './message-broker';
import { logInfo, logWarn, logError } from '../utils/logger';

export class BrokerManager {
  private static broker: MessageBroker | null = null;
  private static isStarting: boolean = false;

  /**
   * Checks if a broker is already running on the specified port
   */
  static async isBrokerRunning(port: number = 8765): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(port, 'localhost');
      
      socket.on('connect', () => {
        socket.end();
        resolve(true);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      // Timeout after 1 second
      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
    });
  }

  /**
   * Ensures a broker is running - starts one if needed
   * Returns true if broker was started by this call, false if already running
   */
  static async ensureBrokerRunning(port: number = 8765): Promise<boolean> {
    // Check if already running
    const isRunning = await this.isBrokerRunning(port);
    if (isRunning) {
      await logInfo('Message broker already running', { port });
      return false;
    }

    // Prevent multiple simultaneous startup attempts
    if (this.isStarting) {
      await logInfo('Broker startup in progress, waiting...');
      // Wait for startup to complete
      while (this.isStarting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return false;
    }

    try {
      this.isStarting = true;
      await logInfo('Starting message broker', { port });
      
      this.broker = new MessageBroker({ port });
      await this.broker.start();
      
      await logInfo('Message broker started successfully', { 
        port,
        status: 'ready_for_connections' 
      });
      
      // Setup cleanup handlers
      this.setupCleanupHandlers();
      
      return true;
    } catch (error) {
      await logError('Failed to start message broker', error as Error, { port });
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stops the broker if it's running
   */
  static async stopBroker(): Promise<void> {
    if (this.broker) {
      try {
        await this.broker.stop();
        await logInfo('Message broker stopped');
      } catch (error) {
        await logError('Error stopping message broker', error as Error);
      } finally {
        this.broker = null;
      }
    }
  }

  /**
   * Gets the broker status
   */
  static getBrokerStatus(): {
    isRunning: boolean;
    hasLocalInstance: boolean;
  } {
    return {
      isRunning: this.broker !== null,
      hasLocalInstance: this.broker !== null
    };
  }

  /**
   * Setup cleanup handlers to stop broker on process exit
   */
  private static setupCleanupHandlers(): void {
    const cleanup = async (signal: string) => {
      await logInfo(`Received ${signal}, stopping message broker...`);
      await this.stopBroker();
      process.exit(0);
    };

    // Only setup handlers once
    if (!this.broker) return;

    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('beforeExit', () => {
      if (this.broker) {
        // Synchronous cleanup for beforeExit
        this.broker.stop().catch(() => {});
      }
    });
  }

  /**
   * Wait for broker to become available
   */
  static async waitForBroker(port: number = 8765, timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await this.isBrokerRunning(port)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }
}