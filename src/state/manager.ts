import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
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

export class StateManager {
  private statePath: string;
  private state: RubberduckState;

  constructor() {
    // Use a consistent absolute path instead of os.tmpdir() which can vary
    this.statePath = '/tmp/rubberduck-state.json';
    this.state = {
      clarifications: {},
      yaps: [],
      settings: DEFAULT_SETTINGS
    };
  }

  async initialize(): Promise<void> {
    try {
      const stateData = await fs.readFile(this.statePath, 'utf-8');
      this.state = { ...this.state, ...JSON.parse(stateData) };
    } catch (error) {
      // State file doesn't exist, create initial state
      await this.saveState();
    }
  }

  private async saveState(): Promise<void> {
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  private async reloadState(): Promise<void> {
    try {
      const stateData = await fs.readFile(this.statePath, 'utf-8');
      const fileState = JSON.parse(stateData);
      // Merge file state with current state, preferring file state for data
      this.state = {
        ...this.state,
        ...fileState,
        settings: { ...this.state.settings, ...fileState.settings }
      };
    } catch (error) {
      // If file doesn't exist or can't be read, keep current state
      console.warn('Could not reload state from file:', error);
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
    await this.saveState();
    return id;
  }

  async getClarificationRequest(id: string): Promise<ClarificationRequest | null> {
    return this.state.clarifications[id] || null;
  }

  async getPendingClarifications(): Promise<ClarificationRequest[]> {
    // Reload state from file to get latest updates from other processes
    await this.reloadState();
    
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
    // Reload state to get latest updates
    await this.reloadState();
    
    const clarification = this.state.clarifications[id];
    if (!clarification || clarification.status !== 'pending') {
      return false;
    }

    clarification.response = response;
    clarification.status = 'answered';
    await this.saveState();
    return true;
  }

  async waitForClarificationResponse(id: string, timeoutMs?: number): Promise<string | null> {
    const timeout = timeoutMs || this.state.settings.maxClarificationTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Reload state to check for updates from CLI process
      await this.reloadState();
      const clarification = this.state.clarifications[id];
      if (clarification?.status === 'answered' && clarification.response) {
        return clarification.response;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mark as timeout
    const clarification = this.state.clarifications[id];
    if (clarification && clarification.status === 'pending') {
      clarification.status = 'timeout';
      await this.saveState();
    }

    return null;
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

    await this.saveState();
    return id;
  }

  async getRecentYaps(count: number = 10): Promise<YapMessage[]> {
    // Reload state from file to get latest updates from other processes
    await this.reloadState();
    return this.state.yaps.slice(-count).reverse();
  }

  // Settings methods
  async updateSettings(newSettings: Partial<RubberduckSettings>): Promise<void> {
    this.state.settings = { ...this.state.settings, ...newSettings };
    await this.saveState();
  }

  getSettings(): RubberduckSettings {
    return { ...this.state.settings };
  }

  // Cleanup methods
  async cleanup(): Promise<void> {
    try {
      await fs.unlink(this.statePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  }

  async clearOldClarifications(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - maxAge;
    const clarificationsToKeep: Record<string, ClarificationRequest> = {};

    for (const [id, clarification] of Object.entries(this.state.clarifications)) {
      if (clarification.timestamp > cutoff || clarification.status === 'pending') {
        clarificationsToKeep[id] = clarification;
      }
    }

    this.state.clarifications = clarificationsToKeep;
    await this.saveState();
  }
}