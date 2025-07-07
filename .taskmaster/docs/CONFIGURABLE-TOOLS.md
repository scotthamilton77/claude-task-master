# Configurable Tools Implementation Plan

## Overview

This document outlines the implementation plan for adding selective tool enabling/disabling functionality to the Task Master MCP server through command-line switches.

## Requirements

### Command Line Interface
- `--enableTools tool1,tool2,tool3` - Only enable specified tools (whitelist)
- `--disableTools tool1,tool2,tool3` - Disable specified tools (blacklist)  
- If both are specified, `--enableTools` takes precedence
- Tool names should be CLI-friendly (kebab-case)

### Behavior
- Default: All tools enabled
- Enable mode: Only specified tools are registered
- Disable mode: All tools except specified ones are registered
- Invalid tool names should log warnings but not fail startup

## Current Architecture Analysis

### Tool Registration Flow
1. `mcp-server/server.js` - Entry point, starts TaskMasterMCPServer
2. `mcp-server/src/index.js` - TaskMasterMCPServer class calls registerTaskMasterTools()
3. `mcp-server/src/tools/index.js` - registerTaskMasterTools() registers all tools

### Available Tools

#### Core Task Management
- `add-task` - Add new task
- `add-subtask` - Add subtask to existing task
- `remove-task` - Remove task completely
- `remove-subtask` - Remove specific subtask
- `list-tasks` - List all tasks
- `show-task` - Show specific task details
- `next-task` - Get next task to work on
- `move-task` - Move task between projects
- `update-task` - Update task properties
- `update-subtask` - Update subtask properties
- `set-task-status` - Change task status
- `clear-subtasks` - Remove all subtasks from task

#### Task Analysis & Expansion
- `analyze` - Analyze project complexity
- `expand-task` - Expand task into subtasks
- `expand-all` - Expand all tasks
- `complexity-report` - Generate complexity report

#### Dependency Management
- `add-dependency` - Add task dependency
- `remove-dependency` - Remove task dependency
- `validate-dependencies` - Check dependency validity
- `fix-dependencies` - Auto-fix dependency issues

#### Tag Management
- `add-tag` - Create new tag
- `delete-tag` - Delete existing tag
- `list-tags` - List all tags
- `use-tag` - Apply tag to task
- `rename-tag` - Rename existing tag
- `copy-tag` - Copy tag configuration

#### Project & Configuration
- `initialize-project` - Initialize new project
- `models` - Manage AI models
- `rules` - Manage project rules
- `parse-prd` - Parse Product Requirements Document
- `generate` - Generate task files
- `research` - Research functionality

## Implementation Plan

### Phase 1: Command Line Argument Parsing

**File: `mcp-server/server.js`**
- Add argument parsing using Node.js built-in process.argv
- Parse `--enableTools` and `--disableTools` arguments
- Handle comma-separated tool lists
- Pass parsed options to TaskMasterMCPServer constructor

```javascript
// Example usage:
// node server.js --enableTools add-task,list-tasks
// node server.js --disableTools research,parse-prd
```

### Phase 2: Tool Filtering Logic

**File: `mcp-server/src/index.js`**
- Add toolConfig parameter to TaskMasterMCPServer constructor
- Store tool filtering configuration
- Pass tool configuration to registerTaskMasterTools()

**File: `mcp-server/src/tools/index.js`**
- Create tool name mapping (CLI name → register function)
- Add filtering logic to registerTaskMasterTools()
- Implement shouldRegisterTool() helper function
- Add validation for tool names

### Phase 3: Tool Registration Mapping

**Tool Name → Register Function Mapping:**
```javascript
const TOOL_REGISTRY = {
  'add-task': registerAddTaskTool,
  'add-subtask': registerAddSubtaskTool,
  'remove-task': registerRemoveTaskTool,
  'remove-subtask': registerRemoveSubtaskTool,
  'list-tasks': registerListTasksTool,
  'show-task': registerShowTaskTool,
  'next-task': registerNextTaskTool,
  'move-task': registerMoveTaskTool,
  'update-task': registerUpdateTaskTool,
  'update-subtask': registerUpdateSubtaskTool,
  'set-task-status': registerSetTaskStatusTool,
  'clear-subtasks': registerClearSubtasksTool,
  'analyze': registerAnalyzeProjectComplexityTool,
  'expand-task': registerExpandTaskTool,
  'expand-all': registerExpandAllTool,
  'complexity-report': registerComplexityReportTool,
  'add-dependency': registerAddDependencyTool,
  'remove-dependency': registerRemoveDependencyTool,
  'validate-dependencies': registerValidateDependenciesTool,
  'fix-dependencies': registerFixDependenciesTool,
  'add-tag': registerAddTagTool,
  'delete-tag': registerDeleteTagTool,
  'list-tags': registerListTagsTool,
  'use-tag': registerUseTagTool,
  'rename-tag': registerRenameTagTool,
  'copy-tag': registerCopyTagTool,
  'initialize-project': registerInitializeProjectTool,
  'models': registerModelsTool,
  'rules': registerRulesTool,
  'parse-prd': registerParsePRDTool,
  'generate': registerGenerateTool,
  'research': registerResearchTool
};
```

## Implementation Details

### 1. Argument Parsing (server.js)
```javascript
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const config = { enableTools: null, disableTools: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--enableTools' && i + 1 < args.length) {
      config.enableTools = args[i + 1].split(',').map(t => t.trim());
      i++; // Skip next argument
    } else if (args[i] === '--disableTools' && i + 1 < args.length) {
      config.disableTools = args[i + 1].split(',').map(t => t.trim());
      i++; // Skip next argument
    }
  }
  
  return config;
}
```

### 2. Tool Filtering Logic (tools/index.js)
```javascript
function shouldRegisterTool(toolName, config) {
  // If enableTools is specified, only register those tools
  if (config.enableTools && config.enableTools.length > 0) {
    return config.enableTools.includes(toolName);
  }
  
  // If disableTools is specified, register all except those
  if (config.disableTools && config.disableTools.length > 0) {
    return !config.disableTools.includes(toolName);
  }
  
  // Default: register all tools
  return true;
}
```

### 3. Modified Registration Function
```javascript
export function registerTaskMasterTools(server, toolConfig = {}) {
  const registeredTools = [];
  const skippedTools = [];
  
  for (const [toolName, registerFunction] of Object.entries(TOOL_REGISTRY)) {
    if (shouldRegisterTool(toolName, toolConfig)) {
      try {
        registerFunction(server);
        registeredTools.push(toolName);
      } catch (error) {
        logger.error(`Failed to register tool ${toolName}: ${error.message}`);
      }
    } else {
      skippedTools.push(toolName);
    }
  }
  
  logger.info(`Registered ${registeredTools.length} tools: ${registeredTools.join(', ')}`);
  if (skippedTools.length > 0) {
    logger.info(`Skipped ${skippedTools.length} tools: ${skippedTools.join(', ')}`);
  }
}
```

## Testing Strategy

### Unit Tests
- Test argument parsing with various input combinations
- Test tool filtering logic with different configurations
- Test invalid tool name handling

### Integration Tests
- Test server startup with different tool configurations
- Verify only specified tools are available via MCP protocol
- Test error handling for invalid configurations

### Manual Testing Scenarios
1. `node server.js --enableTools add-task,list-tasks` - Only basic task tools
2. `node server.js --disableTools research,parse-prd` - All tools except research
3. `node server.js --enableTools invalid-tool` - Invalid tool name handling
4. `node server.js --enableTools add-task --disableTools list-tasks` - Conflicting args

## Error Handling

### Invalid Tool Names
- Log warning for unrecognized tool names
- Continue startup (don't fail)
- Provide suggestion for similar tool names

### Configuration Conflicts
- `--enableTools` takes precedence over `--disableTools`
- Log information about precedence decision

### Startup Failures
- If no tools are registered, log error but continue startup
- Individual tool registration failures should not stop server

## Documentation Updates

### CLI Help
- Add help text for new command line options
- Include examples of common usage patterns

### Configuration Examples
- Provide example configurations for different use cases
- Document performance implications of tool filtering

## Future Enhancements

### Configuration File Support
- Support for JSON/YAML configuration files
- Environment variable configuration
- Runtime tool enabling/disabling

### Tool Grouping
- Predefined tool groups (e.g., --enableGroups core,analysis)
- Custom tool group definitions

### Dynamic Tool Loading
- Hot-swapping of tool configurations
- MCP protocol extensions for tool management

## Success Criteria

1. Server starts successfully with tool filtering options
2. Only specified tools are registered and available
3. Invalid tool names are handled gracefully
4. Performance impact is minimal
5. Existing functionality is preserved when no options are specified
6. Clear logging of tool registration decisions