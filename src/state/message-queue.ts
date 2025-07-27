import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import { ClarificationRequest, YapMessage } from '../types/index';

interface QueueMessage {
  id: string;
  type: 'clarification' | 'yap';
  data: ClarificationRequest | YapMessage;
  timestamp: number;
}

export class MessageQueue extends EventEmitter {
  private queuePath: string;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastReadTimestamp: number = 0;
  private processedMessageIds: Set<string> = new Set();

  constructor() {
    super();
    this.queuePath = '/tmp/rubberduck-messages.json';
  }

  async startCLI(): Promise<void> {
    // Clear the queue when CLI starts (fresh session)
    await this.clearQueue();
    this.lastReadTimestamp = Date.now();
    this.processedMessageIds.clear();
    this.startPolling();
  }

  async startServer(): Promise<void> {
    // Server mode - don't clear queue, just ensure it exists
    await this.ensureQueueExists();
  }

  private async ensureQueueExists(): Promise<void> {
    try {
      await fs.access(this.queuePath);
    } catch {
      await fs.writeFile(this.queuePath, JSON.stringify([]));
    }
  }

  private async clearQueue(): Promise<void> {
    await fs.writeFile(this.queuePath, JSON.stringify([]));
  }

  async addMessage(type: 'clarification' | 'yap', data: ClarificationRequest | YapMessage): Promise<void> {
    await this.ensureQueueExists();
    
    try {
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const messages: QueueMessage[] = JSON.parse(queueData) || [];
      
      const message: QueueMessage = {
        id: data.id,
        type,
        data,
        timestamp: Date.now()
      };
      
      messages.push(message);
      
      // Keep only last 50 messages to prevent growth
      if (messages.length > 50) {
        messages.splice(0, messages.length - 50);
      }
      
      await fs.writeFile(this.queuePath, JSON.stringify(messages, null, 2));
    } catch (error) {
      console.error('Error adding message to queue:', error);
    }
  }

  private startPolling(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.pollInterval = setInterval(async () => {
      await this.checkForNewMessages();
    }, 200); // Poll every 200ms for responsiveness
  }

  private async checkForNewMessages(): Promise<void> {
    try {
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const messages: QueueMessage[] = JSON.parse(queueData) || [];
      
      // Get only new messages since last read AND not already processed
      const newMessages = messages.filter(msg => 
        msg.timestamp > this.lastReadTimestamp && 
        !this.processedMessageIds.has(msg.id)
      );
      
      if (newMessages.length > 0) {
        // Update last read timestamp
        this.lastReadTimestamp = Math.max(...newMessages.map(m => m.timestamp));
        
        // Emit events for new messages
        for (const message of newMessages) {
          // Mark as processed to prevent duplicates
          this.processedMessageIds.add(message.id);
          
          if (message.type === 'clarification') {
            this.emit('clarificationAdded', message.data);
          } else if (message.type === 'yap') {
            this.emit('yapAdded', message.data);
          }
        }
      }
    } catch (error) {
      // Queue file might not exist yet - ignore
    }
  }

  async sendClarificationResponse(id: string, response: string): Promise<void> {
    // Write response to a separate response file
    const responsePath = '/tmp/rubberduck-responses.json';
    
    try {
      let responses: Record<string, string> = {};
      try {
        const responseData = await fs.readFile(responsePath, 'utf-8');
        responses = JSON.parse(responseData) || {};
      } catch {
        // File doesn't exist yet
      }
      
      responses[id] = response;
      await fs.writeFile(responsePath, JSON.stringify(responses, null, 2));
    } catch (error) {
      console.error('Error sending clarification response:', error);
    }
  }

  async waitForResponse(id: string, timeoutMs: number): Promise<string | null> {
    const responsePath = '/tmp/rubberduck-responses.json';
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const responseData = await fs.readFile(responsePath, 'utf-8');
        const responses: Record<string, string> = JSON.parse(responseData) || {};
        
        if (responses[id]) {
          const response = responses[id];
          // Clean up the response
          delete responses[id];
          await fs.writeFile(responsePath, JSON.stringify(responses, null, 2));
          return response;
        }
      } catch {
        // File doesn't exist yet
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.processedMessageIds.clear();
    this.removeAllListeners();
  }

  async cleanup(): Promise<void> {
    this.stop();
    try {
      await fs.unlink(this.queuePath);
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink('/tmp/rubberduck-responses.json');
    } catch {
      // Ignore if file doesn't exist
    }
  }
}