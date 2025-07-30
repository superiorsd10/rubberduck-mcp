# Contributing to Rubberduck MCP

Thank you for your interest in contributing to Rubberduck MCP! This document provides guidelines and information for contributors.

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - Required for development and testing
- **npm** - Package manager (comes with Node.js)
- **Git** - Version control system
- **TypeScript knowledge** - Project is written in TypeScript
- **MCP-compatible IDE** - Claude Code, Cursor, or similar for testing

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/superiorsd10/rubberduck-mcp.git
   cd rubberduck-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Test locally**
   ```bash
   # Start MCP server in development mode
   npm run dev
   
   # Or test the built version
   npm start
   
   # Test CLI interface in another terminal
   ./bin/rubberduck cli
   # Alternative: rubberduck-mcp cli (if globally installed)
   ```

## 🏗️ Development Workflow

### Branch Strategy

- **main** - Production-ready code, protected branch
- **feature/your-feature-name** - New features and enhancements
- **fix/issue-description** - Bug fixes
- **docs/documentation-updates** - Documentation improvements

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Test thoroughly**
   ```bash
   # Build and check for TypeScript errors
   npm run build
   
   # Test with a real MCP client
   npm start
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add new clarification timeout feature"
   ```

### Pull Request Process

1. **Push your branch** to your fork
2. **Create a Pull Request** with:
   - Clear title describing the change
   - Detailed description of what was changed and why
   - Steps to test the changes
   - Screenshots/examples if applicable
3. **Address review feedback** promptly
4. **Ensure build passes** (TypeScript compilation, no errors)

## 📝 Coding Standards

### TypeScript Guidelines

- **Strict typing** - Use explicit types, avoid `any`
- **ES2022 features** - Modern JavaScript/TypeScript features are encouraged
- **Interface definitions** - Use interfaces for object structures
- **Error handling** - Always handle errors gracefully

### Code Style

- **2 spaces** for indentation
- **Semicolons** required
- **Single quotes** for strings
- **Trailing commas** in multi-line objects/arrays
- **Descriptive variable names** - `clarificationRequest` not `cr`

### Architecture Patterns

- **Event-driven design** - Use EventEmitter for component communication
- **Separation of concerns** - Keep CLI, broker, and MCP server separate
- **TCP-based messaging** - All cross-process communication through message broker
- **Graceful error handling** - Always provide user-friendly error messages

### File Organization

```
src/
├── broker/          # TCP message broker system
├── cli/            # Command-line interface
├── state/          # State management and message queuing
├── tools/          # MCP tool implementations
├── types/          # TypeScript type definitions
├── utils/          # Shared utilities (keep minimal)
└── server.ts       # Main MCP server entry point
```

## 🧪 Testing Guidelines

### Manual Testing

1. **MCP Server Testing**
   - Start server with `npm start`
   - Connect from Claude Code, Cursor or similar MCP client
   - Test both `clarify()` and `yap()` tools
   - Verify message routing works correctly

2. **CLI Interface Testing**
   - Start CLI with `./bin/rubberduck cli` or `rubberduck-mcp cli` (if globally installed)
   - Test clarification queue handling
   - Verify yap message display
   - Test connection status monitoring

## 🐛 Bug Reports

### Before Reporting

1. **Check existing issues** - Your bug might already be reported
2. **Test with latest version** - `npm update -g rubberduck-mcp`
3. **Reproduce consistently** - Document exact steps to reproduce

### Bug Report Template

```markdown
**Bug Description**
Clear description of what went wrong

**Steps to Reproduce**
1. Start rubberduck-mcp with `npm start`
2. Connect from Claude Desktop
3. Call clarify() tool with message "test"
4. ...

**Expected Behavior**
What should have happened

**Actual Behavior**
What actually happened

**Environment**
- OS: macOS 14.0
- Node.js: 18.17.0
- rubberduck-mcp: 1.0.1
- MCP Client: Claude Code 1.2.0
```

## ✨ Feature Requests

### Before Requesting

1. **Search existing issues** - Feature might already be planned
2. **Consider scope** - Does it fit the project's core mission?
3. **Think about implementation** - How would it work technically?

### Feature Request Template

```markdown
**Feature Description**
Clear description of the proposed feature

**Use Case**
Why is this feature needed? What problem does it solve?

**Proposed Implementation**
How could this be implemented? (optional but helpful)

**Alternatives Considered**
Other ways to solve the same problem
```

## 🎯 Good First Issues

Looking for ways to contribute? Here are some beginner-friendly areas:

- **Documentation improvements** - README updates, code comments
- **Error message enhancements** - More helpful error messages
- **CLI UX improvements** - Better colors, formatting, help text
- **Configuration options** - Add user-configurable settings
- **Platform compatibility** - Windows-specific improvements

## 📋 Types of Contributions

### Code Contributions
- **Bug fixes** - Always welcome
- **Feature implementations** - Discuss in issues first
- **Performance improvements** - Benchmark before/after
- **Security enhancements** - Follow responsible disclosure

### Non-Code Contributions
- **Documentation** - README, code comments, examples
- **Testing** - Manual testing, edge case discovery
- **Issue triage** - Help organize and respond to issues
- **Community support** - Answer questions, help users

## 🤝 Community Guidelines

### Be Respectful
- Use inclusive language
- Respect different viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what's best for the community

### Be Collaborative
- Ask questions when unsure
- Provide helpful feedback on PRs
- Share knowledge and learnings
- Help newcomers get started

### Be Patient
- Maintainers are volunteers with limited time
- Complex features take time to review
- Some PRs may need multiple rounds of feedback

## 📞 Getting Help

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and general discussion
- **Pull Request Comments** - For specific code questions

## 🙏 Recognition

All contributors will be recognized in our README and release notes. We appreciate every contribution, no matter how small!

---

Thank you for contributing to Rubberduck MCP! Together we're making AI collaboration more human and engaging. 🦆