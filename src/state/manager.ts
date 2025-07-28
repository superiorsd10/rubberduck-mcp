import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { MessageQueue } from './message-queue';
import { initializeLogger, logError, logInfo, logWarn } from '../utils/logger';
import { 
  RubberduckState, 
  ClarificationRequest, 
  YapMessage, 
  RubberduckSettings 
} from '../types/index';

const DEFAULT_SETTINGS: RubberduckSettings = {
  maxClarificationTimeout: 5 * 60 * 1000, // 5 minutes
  maxYapHistory: 100,
  defaultYapMode: 'concise',
  defaultYapCategory: 'neutral',
  cliRefreshRate: 500 // 500ms
};

export class StateManager extends EventEmitter {
  private state: RubberduckState;
  private messageQueue: MessageQueue;
  private isServer: boolean;
  private sessionId: string;

  constructor(isServer: boolean = false, sessionId?: string) {
    super();
    this.isServer = isServer;
    this.sessionId = sessionId || uuidv4();
    
    // Initialize logger for this session
    initializeLogger(this.sessionId);
    
    this.messageQueue = new MessageQueue(this.sessionId);
    this.state = {
      sessionId: this.sessionId,
      clarifications: {},
      yaps: [],
      settings: DEFAULT_SETTINGS
    };
  }

  async initialize(): Promise<void> {
    try {
      
      if (this.isServer) {
        await this.messageQueue.startServer();
        await logInfo('MCP server initialized successfully');
      } else {
        await this.messageQueue.startCLI();
        
        // Remove any existing listeners to prevent duplicates
        this.messageQueue.removeAllListeners('clarificationAdded');
        this.messageQueue.removeAllListeners('yapAdded');
        
        // Set up event forwarding from message queue
        this.messageQueue.on('clarificationAdded', (clarification) => {
          this.emit('clarificationAdded', clarification);
        });
        this.messageQueue.on('yapAdded', (yap) => {
          this.emit('yapAdded', yap);
        });
        
      }
    } catch (error) {
      await logError('Failed to initialize StateManager', error as Error, {
        sessionId: this.sessionId,
        isServer: this.isServer
      });
      throw error;
    }
  }

  // Clarification methods
  async addClarificationRequest(
    question: string, 
    context?: string, 
    urgency: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<string> {
    const id = uuidv4();
    const clarification: ClarificationRequest = {
      id,
      question,
      context,
      urgency,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.state.clarifications[id] = clarification;
    
    // Only emit events and send to queue if we're the server
    if (this.isServer) {
      this.emit('clarificationAdded', clarification);
      await this.messageQueue.addMessage('clarification', clarification);
    }
    
    return id;
  }

  getClarificationRequest(id: string): ClarificationRequest | null {
    return this.state.clarifications[id] || null;
  }

  getPendingClarifications(): ClarificationRequest[] {
    return Object.values(this.state.clarifications)
      .filter(c => c.status === 'pending')
      .sort((a, b) => {
        // Sort by urgency first, then by timestamp
        const urgencyOrder = { high: 3, medium: 2, low: 1 };
        const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        return urgencyDiff !== 0 ? urgencyDiff : a.timestamp - b.timestamp;
      });
  }

  async answerClarification(id: string, response: string): Promise<boolean> {
    const clarification = this.state.clarifications[id];
    if (!clarification || clarification.status !== 'pending') {
      return false;
    }

    clarification.response = response;
    clarification.status = 'answered';
    this.emit('clarificationAnswered', clarification);
    
    // Send response via message queue
    await this.messageQueue.sendClarificationResponse(id, response);
    return true;
  }

  async waitForClarificationResponse(id: string, timeoutMs?: number): Promise<string | null> {
    const timeout = timeoutMs || this.state.settings.maxClarificationTimeout;
    
    const response = await this.messageQueue.waitForResponse(id, timeout);
    
    if (!response) {
      // Mark as timeout
      const clarification = this.state.clarifications[id];
      if (clarification && clarification.status === 'pending') {
        clarification.status = 'timeout';
        this.emit('clarificationTimeout', clarification);
      }
    }
    
    return response;
  }

  // Yap methods
  async addYap(
    message: string,
    mode: YapMessage['mode'] = 'concise',
    category: YapMessage['category'] = 'neutral',
    task_context?: string
  ): Promise<string> {
    const id = uuidv4();
    const yap: YapMessage = {
      id,
      message,
      mode,
      category,
      task_context,
      timestamp: Date.now()
    };

    this.state.yaps.push(yap);

    // Keep only the most recent yaps
    if (this.state.yaps.length > this.state.settings.maxYapHistory) {
      this.state.yaps = this.state.yaps.slice(-this.state.settings.maxYapHistory);
    }

    // Only emit events and send to queue if we're the server
    if (this.isServer) {
      this.emit('yapAdded', yap);
      await this.messageQueue.addMessage('yap', yap);
    }
    
    return id;
  }

  getRecentYaps(count: number = 10): YapMessage[] {
    return this.state.yaps.slice(-count).reverse();
  }

  // Settings methods
  updateSettings(newSettings: Partial<RubberduckSettings>): void {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.emit('settingsUpdated', this.state.settings);
  }

  getSettings(): RubberduckSettings {
    return { ...this.state.settings };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async checkConnectionHealth(): Promise<{
    isConnected: boolean;
    lastSeen?: number;
  }> {
    const status = this.messageQueue.getConnectionStatus();
    return {
      isConnected: status.isConnected,
      lastSeen: Date.now() // Simplified - broker handles connection timing
    };
  }

  // Cleanup methods
  // CLI method to send response directly to message queue
  async sendClarificationResponse(id: string, response: string): Promise<void> {
    await this.messageQueue.sendClarificationResponse(id, response);
  }

  async cleanup(): Promise<void> {
    // Clean up message queue
    await this.messageQueue.cleanup();
    
    // Clear in-memory state
    this.state.clarifications = {};
    this.state.yaps = [];
    this.removeAllListeners();
  }

  clearOldClarifications(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    const clarificationsToKeep: Record<string, ClarificationRequest> = {};

    for (const [id, clarification] of Object.entries(this.state.clarifications)) {
      if (clarification.timestamp > cutoff || clarification.status === 'pending') {
        clarificationsToKeep[id] = clarification;
      }
    }

    this.state.clarifications = clarificationsToKeep;
    this.emit('clarificationsCleared');
  }
}