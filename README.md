# 🦆 Rubberduck

An MCP (Model Context Protocol) tool that enables bidirectional communication between LLMs and humans through clarification requests and real-time thought sharing.

## Features

### 🤔 Clarification Tool
- LLMs can ask for human clarification when confused
- Questions appear in a beautiful CLI interface
- Humans respond directly, and LLMs get the answers
- Urgency levels: low, medium, high
- Timeout handling for unanswered questions

### 💭 Yap Tool  
- LLMs can share their thoughts while coding (like humans do!)
- Configurable modes: concise, verbose, detailed
- Personality categories: funny, roasty, happy, neutral, excited
- Real-time display in CLI interface

## Installation

```bash
# Clone or navigate to the rubberduck directory
cd rubberduck

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### 1. Start CLI Interface (Human Side)
```bash
# Start the CLI interface for human interaction
./bin/rubberduck cli
```

### 2. Configure MCP Client
Add rubberduck to your MCP client configuration:

**For Claude Desktop** (`claude_desktop_config.json`):
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

### 3. Use from LLM/Coding Agent

**Clarification Tool:**
```typescript
clarify({
  question: "What specific error handling approach do you prefer for this API?",
  context: "I'm implementing user authentication and there are multiple ways to handle validation errors",
  urgency: "medium"
})
```

**Yap Tool:**
```typescript
yap({
  message: "This recursive function is getting complex, might need to refactor",
  mode: "verbose",
  category: "neutral",
  task_context: "Implementing tree traversal algorithm"
})
```

## Development Commands

```bash
npm run build      # Build TypeScript to JavaScript
npm run dev        # Development mode with tsx
npm start          # Start built MCP server 
npm run clean      # Clean build artifacts

./bin/rubberduck cli    # Start CLI interface for human interaction
./bin/rubberduck start  # Start MCP server for client connections
./bin/rubberduck serve  # Start both server and CLI (experimental)
```

## Project Structure

```
rubberduck/
├── src/
│   ├── server.ts          # Main MCP server
│   ├── cli/
│   │   ├── interface.ts   # CLI interface
│   │   └── ascii-art.ts   # ASCII art and visuals
│   ├── tools/
│   │   ├── clarify.ts     # Clarification tool
│   │   └── yap.ts         # Yap tool
│   ├── state/
│   │   └── manager.ts     # State management
│   └── types/
│       └── index.ts       # TypeScript interfaces
├── bin/
│   └── rubberduck         # Executable entry point
└── dist/                  # Compiled JavaScript
```

## Architecture

### Core Components
- **MCP Server Layer** (`src/server.ts`): Implements MCP protocol, registers tools, handles JSON-RPC requests
- **State Management Layer** (`src/state/manager.ts`): In-memory state management with EventEmitter for real-time communication
- **CLI Interface Layer** (`src/cli/interface.ts`): Human-facing terminal UI with colored output and event-driven updates
- **Tools** (`src/tools/`): Implementation of clarify and yap tools

### Communication Flow
1. LLM calls tool → Server processes → StateManager updates in-memory state
2. StateManager emits events → CLI receives events and displays in real-time
3. Human responds → StateManager updates state → Server returns response to LLM

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

### CLI Not Showing Messages
- Make sure the CLI is running (`./bin/rubberduck cli`)
- Check that state files are being created in `/tmp/rubberduck-state.json`
- Verify MCP server is properly configured in your client

### MCP Client Connection Issues
- Ensure the path to `dist/server.js` is correct in your MCP client config
- Check that the server starts without errors: `npm start`
- Look for error messages in your MCP client logs

## Contributing

This is a simple, first-principles implementation. Feel free to enhance with:
- Better error handling
- WebSocket support for real-time communication
- Multiple LLM session support
- Advanced CLI features
- Configuration file support

## License

MIT License - feel free to use and modify as needed!