# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Prepare for distribution (runs build)
npm run prepare

# Prepare for npm publishing (clean + build)
npm run prepublishOnly

# Start MCP server (auto-starts broker if needed)
npx rubberduck-mcp start
# OR: ./bin/rubberduck start (local dev)

# Start CLI interface for human interaction
npx rubberduck-mcp cli
# OR: ./bin/rubberduck cli (local dev)

# Start MCP server and CLI together (dev mode)
npx rubberduck-mcp serve
# OR: ./bin/rubberduck serve (local dev)

# Start standalone broker (advanced usage)
npx rubberduck-mcp broker
# OR: ./bin/rubberduck broker (local dev)
```

## Architecture Overview

This is an MCP (Model Context Protocol) tool that enables bidirectional communication between LLMs and humans through two main tools: clarification and yapping. **The system has been refactored from file-based IPC to a TCP-based message broker architecture for better performance and multi-client support.**

### Core Architecture Components

**TCP Message Broker System:**
1. **Message Broker** (`src/broker/message-broker.ts`): Central TCP server on port 8765 that routes messages between MCP servers and CLIs
2. **Broker Manager** (`src/broker/broker-manager.ts`): Handles automatic broker lifecycle - detects existing brokers and starts new ones when needed
3. **Broker Client** (`src/broker/broker-client.ts`): TCP client that connects MCP servers and CLIs to the central broker
4. **Message Router** (`src/broker/message-router.ts`): Implements clarification queuing and yap message ordering logic

**MCP Integration Layer:**
1. **MCP Server** (`src/server.ts`): Implements MCP protocol, registers tools, handles JSON-RPC requests
2. **State Manager** (`src/state/manager.ts`): Connects to broker via MessageQueue, manages local state
3. **Message Queue** (`src/state/message-queue.ts`): Wrapper around BrokerClient for backward compatibility
4. **CLI Interface** (`src/cli/interface.ts`): Human-facing terminal UI with clarification queuing and client ID display

### Communication Flow (TCP-Based)

**Multi-Agent Clarification Flow:**
- Agent A calls `clarify()` → MCP Server A → Broker → CLI (shows as active)
- Agent B calls `clarify()` → MCP Server B → Broker → CLI (queues behind Agent A)
- Human answers Agent A → CLI → Broker → MCP Server A gets response
- Agent A clarification complete → CLI automatically shows Agent B's clarification

**Yap Message Ordering:**
- Multiple agents send yaps → Broker buffers by timestamp → CLI displays in chronological order with client IDs
- Example: `[MCP-Server-abc123] Starting task X` followed by `[MCP-Server-def456] Working on Y`

### Critical TCP Broker Concepts

**Automatic Broker Management:**
- First `npx rubberduck-mcp start` command automatically starts broker on port 8765
- Subsequent `start` commands detect existing broker and connect as clients
- Race condition safe - multiple simultaneous starts won't conflict
- Broker shuts down when the process that started it exits

**Multi-Client Concurrency:**
- **Clarification Queuing**: CLI processes one clarification at a time, queues others with "X more queued" display
- **Yap Ordering**: 200ms timestamp-based buffering ensures chronological display across multiple agents
- **Load Balancing**: Clarifications distribute across multiple CLIs based on queue length
- **Client Identification**: All messages show source client ID for traceability

**Connection Management:**
- Auto-reconnection with exponential backoff for network failures
- Heartbeat monitoring (5s intervals) with 15s timeout for stale clients
- Graceful handling of client disconnections and message redistribution

### Tool Implementation Pattern

Each tool (`src/tools/clarify.ts`, `src/tools/yap.ts`) implements:
- `getDefinition()`: Returns MCP tool schema
- `execute(args)`: Processes tool calls, sends to broker via StateManager

**Clarify Tool Concurrency:**
- Multiple agents can call simultaneously
- Each call gets unique ID and waits via `waitForClarificationResponse()`
- CLI shows one at a time with queue status
- Responses route back to specific waiting agent

### TypeScript Configuration

**Import Requirements:**
- All MCP SDK imports must use `.js` extensions: `import { Tool } from '@modelcontextprotocol/sdk/types.js'`
- CommonJS module system with ES2022 target
- TCP broker uses Node.js `net` module for socket communication

**Build Process:**
- TypeScript compiles `src/` to `dist/`
- Binary wrapper (`bin/rubberduck`) auto-detects dev vs built mode
- MCP clients connect to built server: `node dist/server.js start`

### Broker Message Protocol

**Core Message Types:**
```typescript
interface BrokerMessage {
  id: string;
  type: 'clarification' | 'yap' | 'response' | 'heartbeat' | 'register' | 'sync' | 'error';
  clientId: string;  // Source MCP server/CLI session ID
  clientType: 'mcp-server' | 'cli';
  timestamp: number;
  data: ClarificationRequest | YapMessage | string;
}
```

**Client Registration Flow:**
1. Client connects to broker on port 8765
2. Sends `register` message with clientId and clientType
3. Broker confirms with `sync` message
4. Client begins sending/receiving messages

**Message Routing Rules:**
- Clarifications: Round-robin to available CLIs (load balancing)  
- Yaps: Broadcast to all CLIs with timestamp ordering
- Responses: Route back to specific MCP server waiting for that requestId

### CLI Interface Design

**Clarification Queue Display:**
```
═══════════════════════════════════════════════════════════
❓ CLARIFICATION NEEDED (2 more queued)
Client: MCP-Server-abc123
═══════════════════════════════════════════════════════════
Question: Should I use async/await or promises?
Context: Implementing database queries
Urgency: MEDIUM
───────────────────────────────────────────────────────────
```

**Yap Message Display with Client IDs (Simplified):**
```
💭 LLM YAP [10:30:01] [MCP-Server-abc123]
Starting authentication implementation!

💭 LLM YAP [10:30:02] [MCP-Server-def456]
Analyzing package.json structure
```

### MCP Client Configuration

**Claude Desktop Integration:**
```json
{
  "mcpServers": {
    "rubberduck-mcp": {
      "command": "npx",
      "args": ["rubberduck-mcp", "start"]
    }
  }
}
```

**Multiple IDE Support:**
Each IDE can start its own MCP server instance with `npx rubberduck-mcp start`. The first instance auto-starts the broker; subsequent instances connect to the existing broker.

### Key Dependencies

- `@modelcontextprotocol/sdk`: Core MCP implementation
- `chalk`: Terminal colors and formatting for CLI
- `commander`: CLI argument parsing
- `figlet`: ASCII art for CLI welcome display
- `uuid`: Unique ID generation for requests/messages/sessions
- `net` (Node.js built-in): TCP socket communication for broker
- Node.js 18+ required for MCP SDK compatibility

### Tool Schemas

**Clarify Tool:**
```typescript
{
  name: "clarify",
  inputSchema: {
    question: string,      // Required: The question to ask
    context?: string,      // Optional: Context about the confusion
    urgency?: "low" | "medium" | "high"  // Optional: Priority level
  }
}
```

**Yap Tool:**
```typescript
{
  name: "yap", 
  inputSchema: {
    message: string,       // Required: The thought to share
    mode?: "concise" | "verbose" | "detailed",
    category?: "funny" | "roasty" | "happy" | "neutral" | "excited",
    task_context?: string  // Optional: What you're working on
  }
}
```

### Error Handling Patterns

**Broker Connection Failures:**
- Clear error messages: "Cannot connect to message broker on port 8765. Please start the broker first with: npx rubberduck-mcp broker"
- Auto-retry with exponential backoff for temporary network issues
- Graceful degradation when broker becomes unavailable

**Concurrency Edge Cases:**
- CLI disconnection during active clarification: Redistributes to other CLIs
- MCP server crash during clarification: Marks as "client disconnected" 
- Multiple CLIs: Load balances new clarifications, broadcasts yaps to all

## Package Configuration

The package is configured as **"rubberduck-mcp"** for npm distribution:
- Binary name: `rubberduck-mcp`
- NPX usage: `npx rubberduck-mcp start`
- Global install: `npm install -g rubberduck-mcp`
- Repository: `https://github.com/superiorsd10/rubberduck-mcp.git`

## Important Implementation Notes

**CLI Yap Display Changes:**
- The CLI interface (`src/cli/interface.ts`) displays simplified yap messages
- No category emojis or mode text shown to users
- Format: `💭 LLM YAP [timestamp] [clientId] message`
- The `getCategoryEmoji()` method has been removed

**Publish Preparation:**
- Use `npm run prepublishOnly` before publishing
- Files included in package: `dist/`, `bin/`, `README.md`, `LICENSE`
- Repository links point to superiorsd10/rubberduck-mcp

## AI Agent Integration

The system is designed for use with MCP-compatible AI coding tools. The recommended prompt for AI agents is:

```
You have access to two Rubberduck MCP tools: clarify() and yap(). Use clarify() when you're confused, need human input for ambiguous requirements, or aren't 100% confident about changes you're making - it will pause your work until you get a response. Use yap() to share your thoughts, emotions, feelings, progress updates, and insights while working for an engaging experience with the human - it's non-blocking and keeps humans informed of your thinking process. Use both tools proactively for better collaboration.
```