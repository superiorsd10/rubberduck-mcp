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
  private seenYapIds: Set<string> = new Set();

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
    
    // Set up input handling
    this.setupInputHandler();
    
    // Start the main loop
    this.startMainLoop();
    
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

  private startMainLoop(): void {
    const checkForUpdates = async () => {
      if (!this.isRunning) return;

      try {
        // Check for pending clarifications
        await this.checkPendingClarifications();
        
        // Check for new yaps
        await this.checkNewYaps();
        
      } catch (error) {
        console.error(chalk.red('Error:'), error);
      }

      // Schedule next check
      if (this.isRunning) {
        setTimeout(checkForUpdates, this.stateManager.getSettings().cliRefreshRate);
      }
    };

    // Start the loop
    setTimeout(checkForUpdates, 500);
  }

  private async checkPendingClarifications(): Promise<void> {
    const pending = await this.stateManager.getPendingClarifications();
    
    if (pending.length > 0 && !this.currentClarification) {
      // Show the highest priority clarification
      const clarification = pending[0];
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
  }

  private async checkNewYaps(): Promise<void> {
    const recentYaps = await this.stateManager.getRecentYaps(50); // Check more yaps to catch any we missed
    
    // Filter out yaps we've already seen
    const newYaps = recentYaps.filter(yap => !this.seenYapIds.has(yap.id));
    
    if (newYaps.length > 0) {
      // Sort by timestamp to show in correct order
      newYaps.sort((a, b) => a.timestamp - b.timestamp);
      
      for (const yap of newYaps) {
        this.displayYap(yap);
        this.seenYapIds.add(yap.id);
      }
    }
  }

  displayYap(yap: YapMessage): void {
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
    const success = await this.stateManager.answerClarification(requestId, response);
    
    if (success) {
      console.log(chalk.green(`✅ Response sent: "${response}"`));
      console.log('─'.repeat(60));
      console.log(chalk.gray('Waiting for more interactions...'));
    } else {
      console.log(chalk.red('❌ Failed to send response (clarification may have timed out)'));
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