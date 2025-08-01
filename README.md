# 🦆 rubberduck-mcp

**Make AI coding feel human**

Transform your AI coding sessions into natural, engaging conversations. Your AI can ask for help when confused and share its thoughts while working - just like a real coding buddy!

## What makes it special

### 🤔 Smart Clarification
**AI asks when confused**

Your AI can ask you for help when it's confused, making coding collaboration more productive and accurate.

- AI asks you questions when uncertain
- Get help exactly when you need it  
- Avoid costly mistakes and rework

### 💭 AI Yapping
**Watch AI think out loud**

Experience your AI sharing its thoughts and emotions while coding - it's like having a chatty coding buddy who never stops talking about what they're doing.

- AI shares thoughts in real-time
- See reasoning behind decisions
- Feel more connected to your AI

### 🤝 Natural Collaboration
**Smoother conversations**

Transform your coding sessions into natural, flowing conversations with your AI assistant using these two powerful features.

- More human-like AI interactions
- Better understanding of AI decisions
- Smoother development workflow

## Get Started in 60 Seconds

Ready to code differently? Join developers who are already experiencing more engaging and productive AI collaboration.

### 1. Install rubberduck-mcp
No downloads needed - use NPM to run instantly

```bash
npm install -g rubberduck-mcp
```

### 2. Configure your IDE
Add rubberduck-mcp to your MCP-compatible IDE

```json
{
  "mcpServers": {
    "rubberduck-mcp": {
      "command": "rubberduck-mcp",
      "args": ["start"]
    }
  }
}
```

**Important**: Make sure to start the MCP server through your IDE first before proceeding to the next step.

### 3. Start the CLI interface  
Open a new terminal to see AI conversations

```bash
rubberduck-mcp cli
```

### 4. Add AI Instructions
Add this prompt to your coding tool's instructions file (feel free to customize it)

```
You have access to two Rubberduck MCP tools: clarify() and yap().

Use clarify() when you're confused, need human input for ambiguous requirements, or aren't 100% confident about changes you're making - it will pause your work until you get a response.

Use yap() to share your thoughts, emotions, feelings, progress updates, and insights while working for an engaging experience with the human - it's non-blocking and keeps humans informed of your thinking process.

Use both tools proactively for better collaboration.
```

**💡 Pro Tip**: In your MCP client settings, you can auto-approve both the `clarify` and `yap` tools so you don't have to manually approve them every time they're used. This creates a smoother, more natural conversation flow with your AI.

## Experience the Magic

These are real CLI outputs showing how rubberduck-mcp transforms AI collaboration. Watch conversations come alive with colors, context, and clarity.

### Scenario 1: AI Asks for Help
Your AI seeks clarification on ambiguous decisions

```
═══════════════════════════════════════════════════════════
❓ CLARIFICATION NEEDED [14:15:10]
═══════════════════════════════════════════════════════════
Question: Should I center this div with flexbox or CSS Grid? I know there are like 47 different ways to center a div, but what's your preference here?

Context: You want the login form centered both horizontally and vertically. I could use flexbox, grid, absolute positioning, or even CSS transforms...

Urgency: LOW
───────────────────────────────────────────────────────────
Please type your response and press Enter:
> flexbox
✅ Response sent: "flexbox"
```

### Scenario 2: AI Yapping While Coding  
Experience your AI's emotional journey through debugging

```
───────────────────────────────────────────────────────────
💭 LLM YAP [14:23:15]
Hmm, this user authentication endpoint is returning 500... Let me check the database connection first.

💭 LLM YAP [14:24:32]
Database is fine... Wait, I bet it's the password hashing. Let me check if bcrypt is working properly.

💭 LLM YAP [14:26:08]
ARGH! 😤 The salt rounds were set to 'undefined' instead of 10. Classic JavaScript strikes again!

💭 LLM YAP [14:27:41]
Phew! 😌 Fixed it. Users can log in again. Note to self: always validate environment variables!
```

## Requirements

- ✅ Node.js 18+ (most developers already have this)
- ✅ Any MCP-compatible IDE or client  
- ✅ 2 minutes of your time

## Troubleshooting

**Getting started issues?**
- Make sure Node.js 18+ is installed
- Ensure the MCP server is running in your IDE first, then run `rubberduck-mcp cli` in a new terminal
- Check that your IDE's MCP configuration matches the JSON example above

**Need help?** Open an issue on [GitHub](https://github.com/superiorsd10/rubberduck-mcp/issues) - we're here to help!

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Complete guide for contributors, development setup, and coding standards
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system architecture, internal workings, and design decisions
- **[CLAUDE.md](CLAUDE.md)** - Development commands and project guidance for Claude Code

## 🤝 Contributing

**Open source contributions are most welcome!** Whether you want to:
- 🐛 Report bugs or issues
- ✨ Request new features  
- 📝 Improve documentation
- 🔧 Submit code improvements
- 🧪 Help with testing

Every contribution, big or small, is valued and appreciated. Check out our [Contributing Guide](CONTRIBUTING.md) to get started!

## License

MIT License - feel free to use and modify as needed!