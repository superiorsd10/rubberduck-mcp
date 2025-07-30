import { promises as fs } from 'fs';
import { join } from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: string;
  stack?: string;
}

export class Logger {
  private sessionId: string;
  private logPath: string;
  private currentLevel: LogLevel;
  private maxLogSize: number = 1024 * 1024; // 1MB
  private maxLogFiles: number = 3;
  private isCliMode: boolean;

  constructor(sessionId: string, level: LogLevel = LogLevel.INFO, isCliMode: boolean = false) {
    this.sessionId = sessionId;
    this.currentLevel = level;
    this.logPath = `/tmp/rubberduck-${sessionId}.log`;
    this.isCliMode = isCliMode;
  }

  async error(message: string, error?: Error, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.ERROR, message, context, error);
  }

  async warn(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.WARN, message, context);
  }

  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.INFO, message, context);
  }

  async debug(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.DEBUG, message, context);
  }

  private async log(
    level: LogLevel, 
    message: string, 
    context?: Record<string, any>, 
    error?: Error
  ): Promise<void> {
    if (level > this.currentLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      error: error?.message,
      stack: error?.stack
    };

    // Always output to console for immediate feedback
    this.outputToConsole(entry);

    // Also log to file for persistence
    try {
      await this.writeToFile(entry);
    } catch (logError) {
      // If logging fails, at least output to console
      console.error('Failed to write log to file:', logError);
    }
  }

  private outputToConsole(entry: LogEntry): void {
    // In CLI mode, suppress INFO and DEBUG logs to avoid cluttering user experience
    // Only show ERROR and WARN levels for important messages
    if (this.isCliMode && (entry.level === LogLevel.INFO || entry.level === LogLevel.DEBUG)) {
      return;
    }

    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] ${levelName}:`;

    let output = `${prefix} ${entry.message}`;
    
    if (entry.context) {
      output += ` | Context: ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      output += ` | Error: ${entry.error}`;
    }

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(output);
        if (entry.stack) {
          console.error('Stack trace:', entry.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.DEBUG:
        console.debug(output);
        break;
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\\n';
    
    try {
      // Check if we need to rotate the log
      await this.rotateIfNeeded();
      
      // Append to log file
      await fs.appendFile(this.logPath, logLine);
    } catch (error) {
      // Fail silently for file operations to avoid recursive logging
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logPath);
      
      if (stats.size > this.maxLogSize) {
        // Rotate logs
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
          const oldPath = `${this.logPath}.${i}`;
          const newPath = `${this.logPath}.${i + 1}`;
          
          try {
            await fs.rename(oldPath, newPath);
          } catch {
            // Ignore if file doesn't exist
          }
        }
        
        // Move current log to .1
        await fs.rename(this.logPath, `${this.logPath}.1`);
      }
    } catch {
      // If rotation fails, continue - we'll just have a larger log file
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up log files
      await fs.unlink(this.logPath);
      
      for (let i = 1; i <= this.maxLogFiles; i++) {
        try {
          await fs.unlink(`${this.logPath}.${i}`);
        } catch {
          // Ignore if file doesn't exist
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function initializeLogger(sessionId: string, level: LogLevel = LogLevel.INFO, isCliMode: boolean = false): Logger {
  globalLogger = new Logger(sessionId, level, isCliMode);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
}

// Convenience functions for global logger
export async function logError(message: string, error?: Error, context?: Record<string, any>): Promise<void> {
  await getLogger().error(message, error, context);
}

export async function logWarn(message: string, context?: Record<string, any>): Promise<void> {
  await getLogger().warn(message, context);
}

export async function logInfo(message: string, context?: Record<string, any>): Promise<void> {
  await getLogger().info(message, context);
}

export async function logDebug(message: string, context?: Record<string, any>): Promise<void> {
  await getLogger().debug(message, context);
}