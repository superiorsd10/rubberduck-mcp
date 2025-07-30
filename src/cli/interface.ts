import chalk from 'chalk';
import readline from 'readline';
import { StateManager } from '../state/manager';
import { getWelcomeMessage, RUBBERDUCK_SIMPLE } from './ascii-art';
import { ClarificationRequest, YapMessage } from '../types/index';

interface ExtendedClarificationRequest extends ClarificationRequest {
  sourceClientId?: string;
}

interface ExtendedYapMessage extends YapMessage {
  sourceClientId?: string;
}

export class CLIInterface {
  private stateManager: StateManager;
  private isRunning: boolean = false;
  private rl: readline.Interface;
  private clarificationQueue: ExtendedClarificationRequest[] = [];
  private currentClarification: ExtendedClarificationRequest | null = null;
  private displayedYapIds: Set<string> = new Set();
  private connectionCheckInterval: NodeJS.Timeout | null = null;

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
    console.log(chalk.dim(`Session ID: ${this.stateManager.getSessionId()}`));
    console.log(chalk.dim('Press Ctrl+C to exit'));
    console.log('─'.repeat(60));
    
    // Initialize state manager for CLI mode
    await this.stateManager.initialize();
    
    // Set up input handling
    this.setupInputHandler();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start connection monitoring
    this.startConnectionMonitoring();
    
    console.log(chalk.green('🦆 Rubberduck started! Waiting for LLM interactions...'));
  }

  private setupInputHandler(): void {
    this.rl.on('line', async (input) => {
      const response = input.trim();
      if (response && this.currentClarification) {
        await this.handleClarificationResponse(this.currentClarification.id, response);
      }
    });

    this.rl.on('SIGINT', () => {
      this.stop();
    });
  }

  private setupEventListeners(): void {
    // Listen for events from message queue (cross-process)
    this.stateManager.on('clarificationAdded', (clarification: ExtendedClarificationRequest) => {
      this.enqueueClarification(clarification);
    });

    this.stateManager.on('yapAdded', (yap: ExtendedYapMessage) => {
      this.displayYap(yap);
    });
  }

  private enqueueClarification(clarification: ExtendedClarificationRequest): void {
    // Add to queue if not already processing one
    if (!this.currentClarification) {
      this.currentClarification = clarification;
      this.showCurrentClarification();
    } else {
      this.clarificationQueue.push(clarification);
      this.showClarificationQueueStatus();
    }
  }

  private processNextClarification(): void {
    if (this.clarificationQueue.length > 0) {
      this.currentClarification = this.clarificationQueue.shift()!;
      this.showCurrentClarification();
    } else {
      this.currentClarification = null;
      console.log(chalk.gray('Waiting for more interactions...'));
    }
  }

  private showClarificationQueueStatus(): void {
    if (this.clarificationQueue.length > 0) {
      console.log(chalk.yellow(`📋 ${this.clarificationQueue.length} clarification(s) queued`));
    }
  }

  private showCurrentClarification(): void {
    if (!this.currentClarification) return;
    
    const clarification = this.currentClarification;
    const queueInfo = this.clarificationQueue.length > 0 ? 
      ` (${this.clarificationQueue.length} more queued)` : '';
    const timestamp = new Date(clarification.timestamp).toLocaleTimeString();
    
    console.log('\n' + '═'.repeat(70));
    console.log(chalk.yellow.bold(`❓ CLARIFICATION NEEDED [${timestamp}]${queueInfo}`));
    console.log('═'.repeat(70));
    console.log(chalk.bold('Question:'), clarification.question);
    
    if (clarification.context) {
      console.log(chalk.bold('Context:'), clarification.context);
    }
    
    const urgencyColor = clarification.urgency === 'high' ? 'red' : 
                        clarification.urgency === 'medium' ? 'yellow' : 'green';
    console.log(chalk.bold('Urgency:'), chalk[urgencyColor](clarification.urgency.toUpperCase()));
    console.log('─'.repeat(70));
    console.log(chalk.green('Please type your response and press Enter:'));
    this.rl.setPrompt(chalk.cyan('> '));
    this.rl.prompt();
  }

  displayYap(yap: ExtendedYapMessage): void {
    // Deduplicate - only show each yap ID once
    if (this.displayedYapIds.has(yap.id)) {
      return;
    }
    
    this.displayedYapIds.add(yap.id);
    
    const timestamp = new Date(yap.timestamp).toLocaleTimeString();
    
    console.log('\n' + '─'.repeat(50));
    console.log(chalk.blue.bold(`💭 LLM YAP [${timestamp}]`));
    console.log(yap.message);
    
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
      console.log('─'.repeat(70));
      
      // Process next clarification in queue
      this.processNextClarification();
      
    } catch (error) {
      console.log(chalk.red(`❌ Error sending response: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.yellow('💡 Make sure the MCP server is running: ') + chalk.bold('rubberduck-mcp start'));
    }
  }


  private startConnectionMonitoring(): void {
    // Check connection status every 10 seconds
    this.connectionCheckInterval = setInterval(async () => {
      await this.checkBrokerConnection();
    }, 10000);
    
    // Initial check
    setTimeout(async () => {
      await this.checkBrokerConnection();
    }, 2000); // Wait 2 seconds for broker to start
  }

  private lastConnectionStatus: boolean = false; // Start pessimistic
  
  private async checkBrokerConnection(): Promise<void> {
    try {
      const connectionStatus = await this.stateManager.checkConnectionHealth();
      
      // Only show messages when status changes to avoid spam
      if (!connectionStatus.isConnected && this.lastConnectionStatus) {
        console.log('\n' + chalk.red('⚠️  No MCP server detected.'));
        console.log(chalk.yellow('💡 Start the server with: ') + chalk.bold('rubberduck-mcp start'));
        if (this.currentClarification) {
          this.rl.setPrompt(chalk.cyan('> '));
          this.rl.prompt();
        }
      } else if (connectionStatus.isConnected && !this.lastConnectionStatus) {
        console.log('\n' + chalk.green('✅ MCP server connected! Ready for interactions.'));
        if (this.currentClarification) {
          this.rl.setPrompt(chalk.cyan('> '));
          this.rl.prompt();
        }
      }
      
      this.lastConnectionStatus = connectionStatus.isConnected;
    } catch (error) {
      // Ignore connection check errors to avoid spam
    }
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    console.log('\n' + chalk.yellow('👋 Goodbye!'));
    this.rl.close();
    process.exit(0);
  }
}