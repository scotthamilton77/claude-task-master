# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Testing
- `npm test` - Run all tests with experimental VM modules
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:fails` - Run only failing tests

### Development
- `npm run format` - Format code with Biome
- `npm run format-check` - Check code formatting
- `npm run inspector` - Run MCP inspector for debugging server
- `npm run mcp-server` - Start MCP server directly

### Single Test Execution
- `npm test -- --testNamePattern="test name"` - Run specific test by name
- `npm test -- tests/unit/specific-file.test.js` - Run specific test file

## Architecture Overview

### Core Components

**MCP Server** (`mcp-server/`):
- Main entry point: `server.js` - FastMCP server implementation
- Core logic: `src/core/task-master-core.js` - Central function registry
- Direct functions: `src/core/direct-functions/` - Individual MCP tool implementations  
- MCP tools: `src/tools/` - Tool wrappers that call direct functions

**CLI Scripts** (`scripts/`):
- `init.js` - Project initialization and profile setup
- `modules/task-manager.js` - Task management functions
- `modules/ai-services-unified.js` - AI provider abstraction layer
- `modules/config-manager.js` - Configuration management

**AI Providers** (`src/ai-providers/`):
- Base provider pattern with unified interface
- Support for Anthropic, OpenAI, Google, Azure, Bedrock, etc.
- Custom Claude Code SDK implementation

**Profile System** (`src/profiles/`):
- `base-profile.js` - Profile factory with rule transformation
- Editor-specific profiles (cursor, vscode, windsurf, etc.)
- Rule file transformation and MCP config generation

### Data Flow

1. **Task Data**: JSON files in `.taskmaster/` directory
2. **Configuration**: Environment variables + MCP config files
3. **Rule Files**: `.mdc` source files → editor-specific rule files
4. **AI Integration**: Unified provider interface → specific AI services

### Key Patterns

**Function Organization**:
- Direct functions in `mcp-server/src/core/direct-functions/` (pure business logic)
- MCP tool wrappers in `mcp-server/src/tools/` (protocol handling)
- CLI modules in `scripts/modules/` (command-line interface)

**Profile System**:
- `createProfile()` factory creates editor configurations
- Rule transformer handles `.mdc` → `.md` conversion with replacements
- MCP config generation for different editors

**Testing Strategy**:
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/` 
- E2E tests in `tests/e2e/`
- Mock fixtures in `tests/fixtures/`

## Configuration Files

- `biome.json` - Code formatting and linting configuration
- `jest.config.js` - Test configuration with coverage thresholds
- `package.json` - Scripts and dependencies
- `.taskmaster/` - Project task data and configuration

## Development Notes

- ESM modules throughout (use `import/export`)
- Biome for formatting (tabs, single quotes, 80 char line width)
- Jest for testing with experimental VM modules flag
- FastMCP for MCP server implementation
- AI SDK for provider abstraction