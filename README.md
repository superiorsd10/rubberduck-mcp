# 🦆 Rubberduck MCP

An MCP (Model Context Protocol) tool that enables bidirectional communication between LLMs and humans through clarification requests and real-time thought sharing. **Features a high-performance TCP-based message broker architecture for multi-agent collaboration.**

## Features

### 🤔 Clarification Tool
- LLMs can ask for human clarification when confused
- Questions appear in a beautiful CLI interface with queuing support
- Multiple agents can send clarifications simultaneously (processed sequentially)
- Humans respond directly, and LLMs get the answers
- Urgency levels: low, medium, high
- Timeout handling for unanswered questions
- Client ID display shows which agent sent each question

### 💭 Yap Tool  
- LLMs can share their thoughts while coding (like humans do!)
- Configurable modes: concise, verbose, detailed
- Personality categories: funny, roasty, happy, neutral, excited
- Real-time display in CLI interface with timestamp ordering
- Multi-agent support with client identification
- Messages displayed in chronological order across all agents

### 🚀 Multi-Agent Architecture
- **TCP Message Broker**: High-performance real-time communication (no file polling)
- **Automatic Broker Management**: First MCP server starts broker, others connect seamlessly
- **Clarification Queuing**: Sequential processing with "X more queued" status
- **Message Ordering**: Timestamp-based yap ordering across multiple agents
- **Load Balancing**: Distributes clarifications across multiple CLIs
- **Client Identification**: Every message shows source agent ID

## Installation

### Option 1: NPX (Recommended - No Installation Required)
```bash
# Use directly with npx (no installation needed)
npx rubberduck-mcp start
```

### Option 2: Global Installation
```bash
# Install globally for system-wide access
npm install -g rubberduck-mcp

# Then use anywhere
rubberduck-mcp start
```

### Option 3: Local Development Setup
```bash
# Clone or navigate to the rubberduck directory
cd rubberduck-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Quick Start

### Simple Setup
```bash
# Terminal 1: Start MCP server (auto-starts broker)
npx rubberduck-mcp start
# OR: rubberduck-mcp start (if globally installed)

# Terminal 2: Start CLI interface
npx rubberduck-mcp cli
# OR: rubberduck-mcp cli (if globally installed)

# Configure your MCP client (see MCP Client Configuration below)
```

### Development Mode
```bash
# Start MCP server and CLI together
npx rubberduck-mcp serve
# OR: rubberduck-mcp serve (if globally installed)
```

## MCP Client Configuration

Add rubberduck-mcp to your MCP client configuration. The npx approach works across all platforms:

### Claude Desktop
**File Location:** 
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

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

### Cursor IDE
**File Location:** `.cursor/mcp.json` (project-specific) or `~/.cursor/mcp.json` (global)

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

### VS Code + GitHub Copilot
**Configuration:** Workspace settings or user settings

```json
{
  "chat.mcp.servers": {
    "rubberduck-mcp": {
      "command": "npx",
      "args": ["rubberduck-mcp", "start"]
    }
  }
}
```

### Windsurf IDE
**File Location:** `~/.codeium/windsurf/mcp_config.json`

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

### Claude Code (CLI)
Claude Code can use rubberduck-mcp directly via npx when configured in any IDE that supports MCP.

**For Multiple IDEs:**
Each IDE can use the same npx configuration. The first IDE to start will launch the broker automatically; subsequent IDEs will connect to the existing broker.

## AI Agent Instructions

Add this prompt to your coding tool's instructions file (`.cursorrules`, `.claude_code`, etc.) to enable proper usage:

```
You have access to two Rubberduck MCP tools: clarify() and yap(). Use clarify() when you're confused, need human input for ambiguous requirements, or aren't 100% confident about changes you're making - it will pause your work until you get a response. Use yap() to share your thoughts, emotions, feelings, progress updates, and insights while working for an engaging experience with the human - it's non-blocking and keeps humans informed of your thinking process. Use both tools proactively for better collaboration.
```

## Usage Examples

### Clarification Tool
```typescript
clarify({
  question: "What specific error handling approach do you prefer for this API?",
  context: "I'm implementing user authentication and there are multiple ways to handle validation errors",
  urgency: "medium"
})
```

**Multi-Agent Scenario:**
- Agent A asks clarification → Shows immediately in CLI
- Agent B asks clarification → Queues with "1 more queued" status  
- Human answers Agent A → CLI automatically shows Agent B's question
- Agent B gets response → Queue empty

### Yap Tool
```typescript
yap({
  message: "This recursive function is getting complex, might need to refactor",
  mode: "verbose", 
  category: "neutral",
  task_context: "Implementing tree traversal algorithm"
})
```

**Multi-Agent Display:**
```
💭 LLM YAP [10:30:01] [MCP-Server-abc123]
Starting authentication implementation!

💭 LLM YAP [10:30:02] [MCP-Server-def456] 
Analyzing package.json structure

💭 LLM YAP [10:30:03] [MCP-Server-abc123]
Authentication flow looks good, moving to testing
```

## Architecture

### High-Level Overview
```
Multiple IDEs/Agents → Multiple MCP Servers → TCP Message Broker → CLI(s)
                                                     ↓
                              Real-time message routing with queuing & ordering
```

### Core Components
- **TCP Message Broker** (`src/broker/`): Central communication hub on port 8765
- **MCP Server Layer** (`src/server.ts`): Implements MCP protocol, registers tools
- **State Management** (`src/state/`): Connects to broker, manages local state
- **CLI Interface** (`src/cli/`): Human-facing terminal UI with multi-client support
- **Tools** (`src/tools/`): Implementation of clarify and yap tools

### Communication Flow
1. **Multiple Agents** → Send clarifications/yaps to their MCP servers
2. **MCP Servers** → Forward messages to shared TCP broker
3. **Message Broker** → Routes messages with proper queuing/ordering
4. **CLI(s)** → Display messages with client identification
5. **Human Responses** → Route back to specific waiting agent

### TCP Broker Features
- **Auto-Start**: First `./bin/rubberduck start` launches broker automatically
- **Race-Safe**: Multiple simultaneous starts won't conflict
- **Load Balancing**: Distributes clarifications across multiple CLIs
- **Message Ordering**: 200ms timestamp buffering for chronological yap display
- **Reconnection**: Auto-retry with exponential backoff for network failures
- **Health Monitoring**: Heartbeat system with graceful client disconnect handling

## Development Commands

```bash
npm run build      # Build TypeScript to JavaScript
npm run dev        # Development mode with tsx
npm start          # Start built MCP server 
npm run clean      # Clean build artifacts
npm run prepublishOnly # Clean, build and prepare for publishing

# NPX/Global commands (after installation)
npx rubberduck-mcp start  # Start MCP server (auto-starts broker if needed)
npx rubberduck-mcp cli    # Start CLI interface for human interaction
npx rubberduck-mcp serve  # Start MCP server and CLI together (dev mode)
npx rubberduck-mcp broker # Start standalone broker (advanced usage)

# Local development (from project directory)
./bin/rubberduck start  # Start MCP server (auto-starts broker if needed)
./bin/rubberduck cli    # Start CLI interface for human interaction
./bin/rubberduck serve  # Start MCP server and CLI together (dev mode)
./bin/rubberduck broker # Start standalone broker (advanced usage)
```

## Tool Schemas

### Clarify Tool
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

### Yap Tool
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

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0+
- MCP-compatible client (Claude Desktop, Cursor, etc.)

## Troubleshooting

### Build Issues
- Ensure you have Node.js 18+ installed
- Run `npm install` to install dependencies
- Check TypeScript compilation with `npm run build`

### Broker Connection Issues
- **Error: "Cannot connect to message broker"**: Start an MCP server first with `npx rubberduck-mcp start`
- **Port already in use**: Another broker is running; use existing one or restart
- **Connection timeout**: Check if port 8765 is blocked by firewall

### CLI Not Showing Messages
- Make sure an MCP server is running first (`npx rubberduck-mcp start`)
- Start CLI after MCP server (`npx rubberduck-mcp cli`)
- Check broker connection status in CLI

### Multi-Agent Issues
- **Messages out of order**: System uses 200ms buffering - slight delays are normal
- **Clarifications not queuing**: Only one clarification shown at a time by design
- **Missing client IDs**: Ensure each MCP server has unique session ID

### MCP Client Configuration Issues
- Ensure you're using the correct npx command: `"command": "npx", "args": ["rubberduck-mcp", "start"]`
- Check that the server starts without errors: `npx rubberduck-mcp start`
- Look for error messages in your MCP client logs
- For multiple IDEs, each should use the same npx configuration
- If npx fails, try global installation: `npm install -g rubberduck-mcp`

## Contributing

This project implements a sophisticated multi-agent communication system. Areas for enhancement:
- WebSocket support for even lower latency
- Message persistence across broker restarts  
- Advanced CLI features (filtering, search, history)
- Configuration file support
- Metrics and monitoring
- Authentication and authorization

## License

MIT License - feel free to use and modify as needed!