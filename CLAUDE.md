# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plan & Review

### Before starting work
- Always in plan mode to make a plan
- After get the plan, make sure you Write the plan to .claude/tasks/TASK_NAME.md
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down.
- If the task require external knowledge or certain package, also research to get latest knowledge (Use Task tool for research)
- Don't over plan it, always think MVP.
- Once you write the plan, firstly ask me to review it. Do not continue until I approve the plan.

### While implementing
- You should update the plan as you work.
- After you complete tasks in the plan, you should update and append detailed descriptions of the changes you made, so following tasks can be easily hand over to other engineers.

## Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Development mode with tsx
npm run dev

# Start built MCP server 
npm start

# Clean build artifacts
npm run clean

# Run CLI interface for human interaction
./bin/rubberduck cli

# Start MCP server for client connections
./bin/rubberduck start

# Start both server and CLI (experimental)
./bin/rubberduck serve
```

## Architecture Overview

This is an MCP (Model Context Protocol) tool that enables bidirectional communication between LLMs and humans through two main tools: clarification and yapping.

### Core Components Architecture

**Three-Layer Communication Pattern:**
1. **MCP Server Layer** (`src/server.ts`): Implements MCP protocol, registers tools, handles JSON-RPC requests
2. **State Management Layer** (`src/state/manager.ts`): File-based persistence using `/tmp/rubberduck-state.json` for cross-process communication
3. **CLI Interface Layer** (`src/cli/interface.ts`): Human-facing terminal UI using blessed library

**Tool Implementation Pattern:**
- Each tool (`src/tools/clarify.ts`, `src/tools/yap.ts`) implements:
  - `getDefinition()`: Returns MCP tool schema
  - `execute(args)`: Processes tool calls and manages state

**State Communication Flow:**
- LLM calls tool → Server processes → StateManager persists to temp file → CLI polls and displays → Human responds → StateManager updates → Server returns response

### Critical TypeScript Configuration

**Import Requirements:**
- All MCP SDK imports must use `.js` extensions: `import { Tool } from '@modelcontextprotocol/sdk/types.js'`
- CommonJS module system with ES2022 target
- Blessed library requires `any` type casting due to incomplete type definitions

**Build Process:**
- TypeScript compiles `src/` to `dist/` 
- Binary wrapper (`bin/rubberduck`) auto-detects dev vs built mode
- MCP clients connect to built server: `node dist/server.js start`

### State Management System

**File-Based IPC:**
- Uses `/tmp/rubberduck-state.json` for inter-process communication
- StateManager handles atomic read/write operations with JSON serialization
- Supports clarification request/response cycles with timeout handling
- Maintains yap message history with configurable limits

**Async Communication Patterns:**
- `waitForClarificationResponse()`: Polling loop with 100ms intervals
- Timeout handling marks requests as expired
- Priority sorting by urgency (high/medium/low) then timestamp

### CLI Interface Design

**blessed Library Integration:**
- Real-time message display with scrollable history
- ASCII art header and visual formatting
- Input handling for clarification responses
- Status updates and emoji formatting based on message categories

**Display Modes:**
- Clarification requests: Show question, context, urgency with response input
- Yap messages: Real-time thought display with mode/category formatting
- System messages: Status updates and connection info

### MCP Client Configuration

**Claude Desktop integration:**
```json
{
  "mcpServers": {
    "rubberduck": {
      "command": "node",
      "args": ["/absolute/path/to/rubberduck/dist/server.js", "start"]
    }
  }
}
```

**Execution Modes:**
- `start`: Pure MCP server (no CLI)
- `cli`: CLI interface only (for human interaction)
- `serve`: Experimental dual mode (both server and CLI)

### Type System

**Core Interfaces:**
- `ClarificationRequest`: id, question, context, urgency, status, response
- `YapMessage`: id, message, mode, category, task_context, timestamp
- `RubberduckState`: centralized state structure with settings
- Tool args extend base `ToolCallArgs` interface

### Key Dependencies

- `@modelcontextprotocol/sdk`: Core MCP implementation
- `blessed`: Terminal UI library (requires type workarounds)
- `commander`: CLI argument parsing
- `uuid`: Unique ID generation for requests/messages
- Node.js 18+ required for MCP SDK compatibility

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.