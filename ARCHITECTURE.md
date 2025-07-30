# Rubberduck MCP Architecture

This document provides a comprehensive overview of the Rubberduck MCP system architecture, internal workings, and design decisions.

## 🏗️ High-Level System Overview

Rubberduck MCP is a bidirectional communication bridge between Large Language Models (LLMs) and humans, enabling two core interactions:

1. **Clarification Requests** - LLMs can ask humans for guidance when uncertain
2. **Yap Messages** - LLMs can share thoughts and progress updates in real-time

The system follows a distributed architecture with TCP-based message routing for scalability and multi-client support.

## 🔧 Core Architecture Components

### System Topology

```
          ┌─────────────────┐
          │   MCP Client    │
          │  (Claude Code)  │
          └─────────┬───────┘
                    │
                    │ JSON-RPC over stdio
                    │
          ┌─────────▼───────┐
          │   MCP Server    │
          │   (Process)     │
          └─────────┬───────┘
                    │
                    │ TCP Socket
                    │ (Port 8765)
                    │
          ┌─────────▼───────┐
          │ Message Broker  │
          │  (TCP Server)   │
          │   Port 8765     │
          └─────────┬───────┘
                    │
          ┌─────────▼───────┐
          │ CLI Interface   │
          │ (Human Terminal)│
          └─────────────────┘
```

### Component Breakdown

#### 1. Message Broker (`src/broker/`)
**Central TCP server managing all communication routing**

- **Message Broker** (`message-broker.ts`) - Core TCP server on port 8765
- **Broker Manager** (`broker-manager.ts`) - Lifecycle management and connection detection
- **Broker Client** (`broker-client.ts`) - TCP client wrapper for MCP servers and CLIs
- **Message Router** (`message-router.ts`) - Implements routing logic and message queuing

#### 2. MCP Server (`src/server.ts`)
**Implements Model Context Protocol specification**

- Registers `clarify()` and `yap()` tools with MCP clients
- Handles JSON-RPC requests from LLM clients
- Manages tool execution and response routing
- Connects to message broker for cross-process communication

#### 3. State Management (`src/state/`)
**Local state management and message queue abstraction**

- **State Manager** (`manager.ts`) - Centralized state and event management
- **Message Queue** (`message-queue.ts`) - Abstraction layer over broker client

#### 4. CLI Interface (`src/cli/`)
**Human-facing terminal interface**

- **Interface** (`interface.ts`) - Terminal UI with readline integration
- **ASCII Art** (`ascii-art.ts`) - Welcome messages and branding
- Real-time clarification queue and yap message display

#### 5. Tool Implementations (`src/tools/`)
**MCP tool definitions and execution logic**

- **Clarify Tool** (`clarify.ts`) - Handles clarification requests
- **Yap Tool** (`yap.ts`) - Handles thought sharing messages

## 🌊 Data Flow and Message Routing

### Clarification Request Flow

```
1. LLM Client → MCP Server A: clarify({question: "Should I use async/await?"})
2. MCP Server A → Message Broker: ClarificationRequest
3. Message Broker → CLI: Display question with queue position
4. Human → CLI: Types response "Yes, use async/await"
5. CLI → Message Broker: ClarificationResponse
6. Message Broker → MCP Server A: Route response by requestId
7. MCP Server A → LLM Client: Return response
```

### Yap Message Flow

```
1. LLM Client → MCP Server B: yap({message: "Starting authentication..."})
2. MCP Server B → Message Broker: YapMessage with timestamp
3. Message Broker → All CLIs: Broadcast yap (with 200ms buffering)
4. CLI: Display yap in chronological order with client ID
```

### Multi-Client Concurrency Handling

#### Clarification Queuing
- **Single Active Clarification** - CLI processes one at a time
- **Round-Robin Distribution** - New clarifications distributed across available CLIs
- **Queue Status Display** - Shows "X more queued" to humans
- **Load Balancing** - Distributes based on queue length

#### Yap Message Ordering
- **Timestamp Buffering** - 200ms buffer to ensure chronological order
- **Cross-Client Ordering** - Messages from different servers displayed in time order
- **Client ID Attribution** - Each yap shows source client ID

## 🔌 TCP Message Protocol

### Message Structure

```typescript
interface BrokerMessage {
  id: string;              // Unique message identifier
  type: 'clarification' | 'yap' | 'response' | 'heartbeat' | 'register' | 'sync' | 'error';
  clientId: string;        // Source client session ID
  clientType: 'mcp-server' | 'cli';
  timestamp: number;       // Unix timestamp
  data: any;              // Message-specific payload
}
```

### Connection Lifecycle

#### Client Registration
```typescript
// 1. Client connects to broker TCP socket
// 2. Send registration message
{
  type: 'register',
  clientId: 'MCP-Server-abc123',
  clientType: 'mcp-server',
  timestamp: Date.now()
}

// 3. Broker responds with sync
{
  type: 'sync',
  data: { status: 'connected', connectedClients: 3 }
}
```

#### Heartbeat Monitoring
- **5-second intervals** - Clients send heartbeat messages
- **15-second timeout** - Broker marks clients as stale
- **Auto-reconnection** - Clients retry with exponential backoff

#### Message Routing Rules
- **Clarifications** → Round-robin to available CLIs
- **Yaps** → Broadcast to all CLIs with timestamp ordering
- **Responses** → Route to specific MCP server by requestId
- **Heartbeats** → Acknowledge to maintain connection

## 🏃‍♂️ Performance Considerations

### Connection Management
- **Connection Pooling** - Single TCP connection per client
- **Auto-Reconnection** - Exponential backoff on network failures
- **Resource Cleanup** - Graceful connection cleanup on exit

### Message Buffering
- **Yap Buffering** - 200ms timestamp-based buffering for ordering
- **Memory Management** - Limited in-memory message history
- **Backpressure Handling** - Prevents message queue overflow

### Scalability Features
- **Multi-CLI Support** - Unlimited CLI instances can connect
- **Load Distribution** - Clarifications balanced across CLIs
- **Client Isolation** - Each MCP server runs in isolated process

## 🛡️ Error Handling and Resilience

### Network Failures
```typescript
// Broker connection lost
try {
  await brokerClient.send(message);
} catch (error) {
  // Exponential backoff retry
  await this.reconnectWithBackoff();
}
```

### Client Disconnections
- **Graceful Degradation** - Continue operation with remaining clients
- **Message Redistribution** - Redistribute queued clarifications
- **State Recovery** - Maintain message history across reconnections

### Race Conditions
- **Broker Startup Race** - Multiple `start` commands handled safely
- **Message Ordering** - Timestamp-based ordering prevents race conditions
- **Client ID Conflicts** - UUID-based client IDs prevent conflicts

## 🎯 Design Decisions and Trade-offs

### TCP vs File-Based IPC
**Decision**: TCP-based message broker
**Rationale**: 
- Better scalability for multiple clients
- Network-transparent (future remote support)
- More robust connection management
- Standard protocols for monitoring

### Centralized vs Peer-to-Peer
**Decision**: Centralized message broker
**Rationale**:
- Simpler message routing logic
- Better debugging and monitoring
- Centralized state management
- Easier to implement features like message ordering

### Event-Driven vs Request-Response
**Decision**: Hybrid approach
**Rationale**:
- Event-driven for real-time yaps (non-blocking)
- Request-response for clarifications (blocking)
- Matches user interaction patterns

## 🔍 Monitoring and Debugging

### Logging Strategy
```typescript
// Multi-level logging with session tracking
logger.info('Clarification requested', { 
  sessionId: 'abc123',
  questionLength: 45,
  urgency: 'medium'
});
```

### Debug Information
- **Session IDs** - Track messages across components
- **Client IDs** - Identify message sources in multi-client scenarios
- **Timestamps** - Trace message ordering and timing
- **Connection Status** - Monitor broker and client health

### Log Locations
- **Server Logs** - `/tmp/rubberduck-{sessionId}.log`
- **CLI Mode** - Suppressed logs (errors only)
- **Console Output** - Real-time status and errors

## 🚀 Future Architecture Considerations

### Horizontal Scaling
- **Multiple Brokers** - Broker clustering for high availability
- **Message Persistence** - Redis/database for message durability
- **Load Balancing** - Distribute clients across broker instances

### Remote Deployment
- **Network Configuration** - Configurable broker host/port
- **Authentication** - Client authentication for remote brokers
- **Encryption** - TLS for secure remote connections

### Plugin Architecture
- **Custom Tools** - Pluggable MCP tool system
- **Middleware** - Message transformation and filtering
- **Webhooks** - External service integrations

## 📚 Key Dependencies and Technologies

### Core Dependencies
- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **Node.js `net` module** - TCP socket communication
- **EventEmitter** - Event-driven architecture
- **UUID** - Unique identifier generation

### Development Tools
- **TypeScript** - Type safety and modern JavaScript features
- **TSC** - TypeScript compilation to CommonJS
- **Commander.js** - CLI argument parsing
- **Chalk** - Terminal colors and formatting

### Runtime Requirements
- **Node.js 18+** - Modern JavaScript features and MCP SDK compatibility
- **TCP Port 8765** - Message broker communication port
- **File System Access** - Logging and temporary file management

---

This architecture enables scalable, real-time bidirectional communication between LLMs and humans while maintaining simplicity and reliability. The TCP-based design provides a solid foundation for future enhancements and enterprise deployment scenarios.