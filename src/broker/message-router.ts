import { EventEmitter } from 'events';
import { ClarificationRequest, YapMessage } from '../types/index';
import { BrokerMessage, ClientInfo, YapBuffer } from './types';
import { logError, logInfo, logWarn } from '../utils/logger';

export class MessageRouter extends EventEmitter {
  private clarificationQueues: Map<string, ClarificationRequest[]> = new Map();
  private yapBuffers: Map<string, YapBuffer> = new Map();
  private yapFlushTimers: Map<string, NodeJS.Timeout> = new Map();
  private yapBufferMs: number;
  private maxClarificationQueue: number;

  constructor(yapBufferMs: number = 200, maxClarificationQueue: number = 10) {
    super();
    this.yapBufferMs = yapBufferMs;
    this.maxClarificationQueue = maxClarificationQueue;
  }

  async routeClarification(
    clarification: ClarificationRequest, 
    sourceClientId: string,
    availableClients: Map<string, ClientInfo>
  ): Promise<string | null> {
    // Find best CLI to handle this clarification
    const targetCliId = this.selectTargetCli(availableClients);
    
    if (!targetCliId) {
      await logWarn('No available CLI clients for clarification', {
        clarificationId: clarification.id,
        sourceClientId
      });
      return null;
    }

    // Add to CLI's clarification queue
    if (!this.clarificationQueues.has(targetCliId)) {
      this.clarificationQueues.set(targetCliId, []);
    }

    const queue = this.clarificationQueues.get(targetCliId)!;
    
    // Check queue size limit
    if (queue.length >= this.maxClarificationQueue) {
      await logWarn('Clarification queue full for CLI', {
        cliId: targetCliId,
        queueSize: queue.length
      });
      return null;
    }

    // Add clarification with source client info
    const enrichedClarification = {
      ...clarification,
      sourceClientId
    };

    queue.push(enrichedClarification);

    await logInfo('Clarification queued', {
      clarificationId: clarification.id,
      cliId: targetCliId,
      queuePosition: queue.length,
      sourceClientId
    });

    // Emit event to process queue
    this.emit('processClarificationQueue', targetCliId);
    
    return targetCliId;
  }

  processNextClarification(cliId: string): ClarificationRequest | null {
    const queue = this.clarificationQueues.get(cliId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const clarification = queue.shift()!;
    
    // Emit event that clarification is now active
    this.emit('clarificationActive', cliId, clarification);
    
    return clarification;
  }

  getClarificationQueueStatus(cliId: string): { current: ClarificationRequest | null, pending: number } {
    const queue = this.clarificationQueues.get(cliId) || [];
    return {
      current: queue.length > 0 ? queue[0] : null,
      pending: Math.max(0, queue.length - 1)
    };
  }

  async routeYap(yap: YapMessage, sourceClientId: string, availableClients: Map<string, ClientInfo>): Promise<void> {
    // Add source client info to yap
    const enrichedYap = {
      ...yap,
      sourceClientId
    };

    // Broadcast to all CLI clients with buffering
    const cliClients = Array.from(availableClients.entries())
      .filter(([_, client]) => client.type === 'cli');

    for (const [cliId, _] of cliClients) {
      await this.bufferYap(cliId, enrichedYap);
    }
  }

  private async bufferYap(cliId: string, yap: YapMessage & { sourceClientId: string }): Promise<void> {
    // Initialize buffer if doesn't exist
    if (!this.yapBuffers.has(cliId)) {
      this.yapBuffers.set(cliId, {
        messages: [],
        lastFlush: Date.now()
      });
    }

    const buffer = this.yapBuffers.get(cliId)!;
    buffer.messages.push(yap);

    // Sort by timestamp to maintain order
    buffer.messages.sort((a, b) => a.timestamp - b.timestamp);

    // Keep only recent messages (prevent memory leak)
    if (buffer.messages.length > 50) {
      buffer.messages = buffer.messages.slice(-50);
    }

    // Set/reset flush timer
    if (this.yapFlushTimers.has(cliId)) {
      clearTimeout(this.yapFlushTimers.get(cliId)!);
    }

    const timer = setTimeout(() => {
      this.flushYapBuffer(cliId);
    }, this.yapBufferMs);

    this.yapFlushTimers.set(cliId, timer);
  }

  private flushYapBuffer(cliId: string): void {
    const buffer = this.yapBuffers.get(cliId);
    if (!buffer || buffer.messages.length === 0) {
      return;
    }

    // Emit all buffered yaps in timestamp order
    const messagesToFlush = [...buffer.messages];
    buffer.messages = [];
    buffer.lastFlush = Date.now();

    this.emit('flushYaps', cliId, messagesToFlush);

    // Clean up timer
    if (this.yapFlushTimers.has(cliId)) {
      clearTimeout(this.yapFlushTimers.get(cliId)!);
      this.yapFlushTimers.delete(cliId);
    }
  }

  handleClarificationResponse(requestId: string, response: string, cliId: string): void {
    // Remove from any remaining queues (cleanup)
    for (const [clientId, queue] of this.clarificationQueues.entries()) {
      const index = queue.findIndex(c => c.id === requestId);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }

    // Emit response event
    this.emit('clarificationResponse', requestId, response, cliId);

    // Process next clarification in queue
    this.emit('processClarificationQueue', cliId);
  }

  private selectTargetCli(availableClients: Map<string, ClientInfo>): string | null {
    const cliClients = Array.from(availableClients.entries())
      .filter(([_, client]) => client.type === 'cli');

    if (cliClients.length === 0) {
      return null;
    }

    // Load balancing: prefer CLI with shortest queue
    let bestCli: string | null = null;
    let shortestQueue = Infinity;

    for (const [cliId, _] of cliClients) {
      const queueLength = this.clarificationQueues.get(cliId)?.length || 0;
      if (queueLength < shortestQueue) {
        shortestQueue = queueLength;
        bestCli = cliId;
      }
    }

    return bestCli;
  }

  removeClient(clientId: string): void {
    // Clean up clarification queues
    this.clarificationQueues.delete(clientId);

    // Clean up yap buffers
    if (this.yapBuffers.has(clientId)) {
      this.yapBuffers.delete(clientId);
    }

    // Clean up timers
    if (this.yapFlushTimers.has(clientId)) {
      clearTimeout(this.yapFlushTimers.get(clientId)!);
      this.yapFlushTimers.delete(clientId);
    }

    // If this was an MCP server, redistribute its pending clarifications
    this.redistributeClarifications(clientId);
  }

  private redistributeClarifications(disconnectedClientId: string): void {
    // Find clarifications from this client in all queues and mark them
    for (const [cliId, queue] of this.clarificationQueues.entries()) {
      const affectedClarifications = queue.filter(
        (c: any) => c.sourceClientId === disconnectedClientId
      );
      
      if (affectedClarifications.length > 0) {
        // Mark these clarifications as "client disconnected"
        affectedClarifications.forEach(clarification => {
          clarification.status = 'timeout';
          clarification.response = 'Source client disconnected';
        });

        this.emit('clarificationsTimeout', cliId, affectedClarifications);
      }
    }
  }

  cleanup(): void {
    // Clear all timers
    for (const timer of this.yapFlushTimers.values()) {
      clearTimeout(timer);
    }
    
    this.yapFlushTimers.clear();
    this.yapBuffers.clear();
    this.clarificationQueues.clear();
    this.removeAllListeners();
  }
}