import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Utility functions for the rubberduck project
 */

export function formatTimestamp(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return date.toLocaleString();
}

export function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const duration = end - startTime;
  
  if (duration < 1000) {
    return `${duration}ms`;
  } else if (duration < 60000) {
    return `${(duration / 1000).toFixed(1)}s`;
  } else {
    return `${(duration / 60000).toFixed(1)}m`;
  }
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

export function sanitizeInput(input: string): string {
  return input.replace(/[\\x00-\\x1f\\x7f]/g, '').trim();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export function getConfigPath(filename: string = 'config.json'): string {
  const configDir = path.join(os.homedir(), '.rubberduck');
  return path.join(configDir, filename);
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

export function colorizeText(text: string, color: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta'): string {
  const colors = {
    red: '\\x1b[31m',
    green: '\\x1b[32m',
    yellow: '\\x1b[33m',
    blue: '\\x1b[34m',
    cyan: '\\x1b[36m',
    magenta: '\\x1b[35m'
  };
  const reset = '\\x1b[0m';
  return `${colors[color]}${text}${reset}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}