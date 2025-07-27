export interface ClarificationRequest {
  id: string;
  question: string;
  context?: string;
  urgency: 'low' | 'medium' | 'high';
  timestamp: number;
  status: 'pending' | 'answered' | 'timeout';
  response?: string;
}

export interface YapMessage {
  id: string;
  message: string;
  mode: 'concise' | 'verbose' | 'detailed';
  category: 'funny' | 'roasty' | 'happy' | 'neutral' | 'excited';
  task_context?: string;
  timestamp: number;
}

export interface RubberduckState {
  clarifications: Record<string, ClarificationRequest>;
  yaps: YapMessage[];
  settings: RubberduckSettings;
}

export interface RubberduckSettings {
  maxClarificationTimeout: number; // milliseconds
  maxYapHistory: number;
  defaultYapMode: YapMessage['mode'];
  defaultYapCategory: YapMessage['category'];
  cliRefreshRate: number; // milliseconds
}

export interface ToolCallArgs {
  [key: string]: any;
}

export interface ClarifyToolArgs extends ToolCallArgs {
  question: string;
  context?: string;
  urgency?: 'low' | 'medium' | 'high';
}

export interface YapToolArgs extends ToolCallArgs {
  message: string;
  mode?: 'concise' | 'verbose' | 'detailed';
  category?: 'funny' | 'roasty' | 'happy' | 'neutral' | 'excited';
  task_context?: string;
}

export interface CLIMessage {
  type: 'clarification' | 'yap' | 'system';
  content: string;
  timestamp: number;
  id?: string;
  metadata?: Record<string, any>;
}