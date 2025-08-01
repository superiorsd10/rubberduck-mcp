#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Command } from 'commander';
import { StateManager } from './state/manager';
import { CLIInterface } from './cli/interface';
import { ClarifyTool } from './tools/clarify';
import { YapTool } from './tools/yap';
import { ClarifyToolArgs, YapToolArgs } from './types/index';
import { BrokerManager } from './broker/broker-manager';
import { logError, logInfo } from './utils/logger';

class RubberduckServer {
  private server: Server;
  private stateManager: StateManager;
  private cliInterface: CLIInterface | null = null;
  private clarifyTool: ClarifyTool;
  private yapTool: YapTool;
  private startedBroker: boolean = false;
  private isCliMode: boolean = false;

  constructor(isServer: boolean = false) {
    this.server = new Server(
      {
        name: 'rubberduck',
        version: '1.1.1',
        description: 'MCP tool for LLM-human collaboration with clarification and yap features'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.stateManager = new StateManager(isServer);
    
    // Broker will be managed automatically
    this.clarifyTool = new ClarifyTool(this.stateManager);
    this.yapTool = new YapTool(this.stateManager);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          this.clarifyTool.getDefinition(),
          this.yapTool.getDefinition()
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'clarify':
            const clarifyResult = await this.clarifyTool.execute(args as ClarifyToolArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: clarifyResult
                }
              ]
            };

          case 'yap':
            const yapResult = await this.yapTool.execute(args as YapToolArgs);
            
            // Yap will be automatically displayed in CLI via event emission
            
            return {
              content: [
                {
                  type: 'text',
                  text: yapResult
                }
              ]
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        await logError('Error handling tool call', error as Error, {
          toolName: request.params.name,
          args: request.params.arguments
        });
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    });

    // Handle server errors
    this.server.onerror = async (error) => {
      await logError('Server error', error);
    };

    // Handle process signals
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  async start(options: { cli?: boolean, startBroker?: boolean } = {}): Promise<void> {
    this.isCliMode = options.cli || false;

    try {
      // Auto-start broker if needed (unless we're just starting a CLI)
      if (!this.isCliMode || options.startBroker) {
        this.startedBroker = await BrokerManager.ensureBrokerRunning();
        
        if (this.startedBroker) {
          // Small delay to ensure broker is fully ready
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        // For CLI mode, just wait for broker to be available
        const brokerAvailable = await BrokerManager.waitForBroker(8765, 5000);
        if (!brokerAvailable) {
          throw new Error(
            'No message broker found. Please start an MCP server first with: rubberduck-mcp start'
          );
        }
      }
      
      // Initialize state manager (will connect to existing broker)
      await this.stateManager.initialize();

      if (this.isCliMode) {
        // Start CLI interface
        this.cliInterface = new CLIInterface(this.stateManager);
        await this.cliInterface.start();
      } else {
        // Start MCP server with stdio transport for MCP clients
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        await logInfo('Rubberduck MCP server started and ready for connections');
      }

    } catch (error) {
      await logError('Failed to start server', error as Error);
      
      // Clean up broker if we started it
      if (this.startedBroker) {
        try {
          await BrokerManager.stopBroker();
        } catch (cleanupError) {
          await logError('Error stopping message broker during cleanup', cleanupError as Error);
        }
      }
      
      process.exit(1);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.cliInterface) {
      this.cliInterface.stop();
    }
    
    // Clean up state manager
    try {
      await this.stateManager.cleanup();
    } catch (error) {
      await logError('Error cleaning up state manager', error as Error);
    }
    
    // Clean up broker only if we started it
    if (this.startedBroker) {
      try {
        await BrokerManager.stopBroker();
        await logInfo('Message broker stopped');
      } catch (error) {
        await logError('Error stopping message broker', error as Error);
      }
    }
  }
}

// CLI setup
async function main() {
  const program = new Command();

  program
    .name('rubberduck')
    .description('MCP tool for LLM-human collaboration')
    .version('1.1.1');

  // Add usage information
  program.addHelpText('before', `
🦆 rubberduck-mcp - Make AI coding feel human

Quick Start:
  1. Start MCP server: rubberduck-mcp start    (auto-starts broker)
  2. Start CLI:        rubberduck-mcp cli
  3. Add more servers: rubberduck-mcp start    (connects to existing broker)

Your AI can now ask for help and share thoughts while coding!
`);

  program
    .command('broker')
    .description('Start standalone message broker (advanced usage)')
    .action(async () => {
      const server = new RubberduckServer();
      await server.start({ startBroker: true });
      
      // Keep the process alive
      console.log('\n🔗 Message broker is running on port 8765');
      console.log('📡 MCP servers and CLIs can now connect');
      console.log('Press Ctrl+C to stop');
      
      // Prevent process from exiting
      process.stdin.resume();
    });

  program
    .command('start')
    .description('Start MCP server (auto-starts broker if needed)')
    .action(async () => {
      const server = new RubberduckServer(true); // Mark as server mode
      await server.start();
    });

  program
    .command('cli')
    .alias('ui')
    .description('Start CLI interface (requires MCP server running)')
    .action(async () => {
      const server = new RubberduckServer();
      await server.start({ cli: true });
    });

  program
    .command('serve')
    .description('Start MCP server and CLI together (dev mode)')
    .action(async () => {
      console.log('🦆 Starting Rubberduck with MCP server and CLI interface...');
      
      // Fork process for MCP server (will auto-start broker)
      const { spawn } = await import('child_process');
      const serverProcess = spawn('rubberduck-mcp', ['start'], {
        stdio: ['pipe', 'pipe', 'inherit']
      });
      
      // Wait a bit for broker to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start CLI in main process
      const server = new RubberduckServer();
      await server.start({ cli: true });
    });

  // If no command specified, show help
  if (process.argv.length <= 2) {
    program.help();
    return;
  }

  await program.parseAsync();
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(async (error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { RubberduckServer };