import chalk from 'chalk';
import readline from 'readline';
import { StateManager } from '../state/manager';
import { getWelcomeMessage, RUBBERDUCK_SIMPLE } from './ascii-art';
import { ClarificationRequest, YapMessage } from '../types/index';

export class CLIInterface {
  private stateManager: StateManager;
  private isRunning: boolean = false;
  private rl: readline.Interface;
  private currentClarification: ClarificationRequest | null = null;
  private displayedYapIds: Set<string> = new Set();

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    // Clear screen and show welcome
    console.clear();
    console.log(chalk.yellow(RUBBERDUCK_SIMPLE));
    console.log(chalk.cyan('🤖 MCP Tool for LLM-Human Collaboration'));
    console.log(chalk.gray('Ready to help with clarifications and yapping!'));
    console.log(chalk.dim('Press Ctrl+C to exit'));
    console.log('─'.repeat(60));
    
    // Initialize state manager for CLI mode
    await this.stateManager.initialize();
    
    // Set up input handling
    this.setupInputHandler();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log(chalk.green('🦆 Rubberduck started! Waiting for LLM interactions...'));
  }

  private setupInputHandler(): void {
    this.rl.on('line', async (input) => {
      const response = input.trim();
      if (response && this.currentClarification) {
        await this.handleClarificationResponse(this.currentClarification.id, response);
        this.currentClarification = null;
      }
    });

    this.rl.on('SIGINT', () => {
      this.stop();
    });
  }

  // Message queue handles cross-process communication

  private setupEventListeners(): void {
    // Listen for events from message queue (cross-process)
    this.stateManager.on('clarificationAdded', (clarification: ClarificationRequest) => {
      this.showClarification(clarification);
    });

    this.stateManager.on('yapAdded', (yap: YapMessage) => {
      this.displayYap(yap);
    });
  }

  private checkExistingPendingClarifications(): void {
    const pending = this.stateManager.getPendingClarifications();
    
    if (pending.length > 0 && !this.currentClarification) {
      // Show the highest priority clarification
      this.showClarification(pending[0]);
    }
  }

  private showClarification(clarification: ClarificationRequest): void {
    if (this.currentClarification) {
      return; // Already showing a clarification
    }

    this.currentClarification = clarification;
    
    console.log('\\n' + '═'.repeat(60));
    console.log(chalk.yellow.bold('❓ CLARIFICATION NEEDED'));
    console.log('═'.repeat(60));
    console.log(chalk.bold('Question:'), clarification.question);
    
    if (clarification.context) {
      console.log(chalk.bold('Context:'), clarification.context);
    }
    
    const urgencyColor = clarification.urgency === 'high' ? 'red' : 
                        clarification.urgency === 'medium' ? 'yellow' : 'green';
    console.log(chalk.bold('Urgency:'), chalk[urgencyColor](clarification.urgency.toUpperCase()));
    console.log('─'.repeat(60));
    console.log(chalk.green('Please type your response and press Enter:'));
    this.rl.setPrompt(chalk.cyan('> '));
    this.rl.prompt();
  }

  // Event-driven yap display - no need to check for new yaps

  displayYap(yap: YapMessage): void {
    // Deduplicate - only show each yap ID once
    if (this.displayedYapIds.has(yap.id)) {
      return;
    }
    
    this.displayedYapIds.add(yap.id);
    
    const categoryEmoji = this.getCategoryEmoji(yap.category);
    const timestamp = new Date(yap.timestamp).toLocaleTimeString();
    
    console.log('\\n' + '─'.repeat(40));
    console.log(chalk.blue.bold(`💭 LLM YAP [${timestamp}]`));
    console.log(`${categoryEmoji} ${chalk.dim(yap.mode.toUpperCase())}: ${yap.message}`);
    
    if (yap.task_context) {
      console.log(chalk.dim(`Context: ${yap.task_context}`));
    }
    
    if (this.currentClarification) {
      this.rl.setPrompt(chalk.cyan('> '));
      this.rl.prompt();
    }
  }

  private async handleClarificationResponse(requestId: string, response: string): Promise<void> {
    try {
      // Send response directly to message queue (CLI doesn't manage clarifications locally)
      await this.stateManager.sendClarificationResponse(requestId, response);
      
      console.log(chalk.green(`✅ Response sent: "${response}"`));
      console.log('─'.repeat(60));
      console.log(chalk.gray('Waiting for more interactions...'));
    } catch (error) {
      console.log(chalk.red(`❌ Error sending response: ${error}`));
    }
  }

  private getCategoryEmoji(category: YapMessage['category']): string {
    switch (category) {
      case 'funny': return '😄';
      case 'roasty': return '🔥';
      case 'happy': return '😊';
      case 'excited': return '🚀';
      case 'neutral': return '💭';
      default: return '💭';
    }
  }

  stop(): void {
    this.isRunning = false;
    
    console.log('\\n' + chalk.yellow('👋 Goodbye!'));
    this.rl.close();
    process.exit(0);
  }
}