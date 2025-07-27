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

class RubberduckServer {
  private server: Server;
  private stateManager: StateManager;
  private cliInterface: CLIInterface | null = null;
  private clarifyTool: ClarifyTool;
  private yapTool: YapTool;
  private isCliMode: boolean = false;

  constructor() {
    this.server = new Server(
      {
        name: 'rubberduck',
        version: '1.0.0',
        description: 'MCP tool for LLM-human collaboration with clarification and yap features'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.stateManager = new StateManager();
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
            
            // If CLI is running, also display the yap there
            if (this.cliInterface && args) {
              const yapArgs = args as YapToolArgs;
              const yap = {
                id: Math.random().toString(36).substring(7),
                message: yapArgs.message,
                mode: yapArgs.mode || 'concise',
                category: yapArgs.category || 'neutral',
                task_context: yapArgs.task_context,
                timestamp: Date.now()
              };
              // Display yap in CLI interface
              this.cliInterface.displayYap(yap);
            }
            
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
        console.error('Error handling tool call:', error);
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
    this.server.onerror = (error) => {
      console.error('Server error:', error);
    };

    // Handle process signals
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  async start(options: { cli?: boolean } = {}): Promise<void> {
    this.isCliMode = options.cli || false;

    try {
      // Initialize state manager
      await this.stateManager.initialize();

      if (this.isCliMode) {
        // Start CLI interface
        this.cliInterface = new CLIInterface(this.stateManager);
        await this.cliInterface.start();
      } else {
        // Start MCP server with stdio transport for MCP clients
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Rubberduck MCP server started and ready for connections');
      }

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private cleanup(): void {
    if (this.cliInterface) {
      this.cliInterface.stop();
    }
    
    // Clean up state manager
    this.stateManager.cleanup().catch(console.error);
  }
}

// CLI setup
async function main() {
  const program = new Command();

  program
    .name('rubberduck')
    .description('MCP tool for LLM-human collaboration')
    .version('1.0.0');

  program
    .command('start')
    .description('Start the MCP server')
    .action(async () => {
      const server = new RubberduckServer();
      await server.start();
    });

  program
    .command('cli')
    .alias('ui')
    .description('Start with CLI interface for human interaction')
    .action(async () => {
      const server = new RubberduckServer();
      await server.start({ cli: true });
    });

  program
    .command('serve')
    .description('Start the MCP server and CLI interface together')
    .action(async () => {
      // Start both server and CLI
      console.log('🦆 Starting Rubberduck with both MCP server and CLI interface...');
      
      // Fork process for MCP server
      const { spawn } = await import('child_process');
      const serverProcess = spawn(process.execPath, [__filename, 'start'], {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      // Start CLI in main process
      const server = new RubberduckServer();
      await server.start({ cli: true });
    });

  // If no command specified, show help
  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync();
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { RubberduckServer };