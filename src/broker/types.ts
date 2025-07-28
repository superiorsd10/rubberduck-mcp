import { ClarificationRequest, YapMessage } from '../types/index';

export interface BrokerMessage {
  id: string;
  type: 'clarification' | 'yap' | 'response' | 'heartbeat' | 'register' | 'sync' | 'error';
  clientId: string;
  clientType: 'mcp-server' | 'cli';
  timestamp: number;
  sequence?: number;
  data: any;
}

export interface ClarificationResponse {
  requestId: string;
  response: string;
  cliId: string;
}

export interface ClientInfo {
  id: string;
  type: 'mcp-server' | 'cli';
  socket: any;
  lastSeen: number;
  clarificationQueue?: ClarificationRequest[];
}

export interface YapBuffer {
  messages: YapMessage[];
  lastFlush: number;
}

export interface BrokerConfig {
  port: number;
  yapBufferMs: number;
  maxClarificationQueue: number;
  heartbeatInterval: number;
  clientTimeout: number;
}