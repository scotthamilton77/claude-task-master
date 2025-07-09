# Custom Fields Enhancement Requirements

## Overview

This document outlines the requirements for enhancing the custom fields system to provide safer, more intuitive field specification while preventing conflicts with functional switches.

## Current Problems

1. **Naming Conflicts**: Custom fields using `--field-name` syntax can conflict with 40+ functional switches (e.g., `--prompt`, `--file`, `--id`)
2. **Ambiguous Interface**: No clear distinction between functional parameters and custom fields
3. **Incomplete Implementation**: Update commands don't properly handle custom fields
4. **No Validation**: No fail-fast detection of potential conflicts

## Solution: Project-Specific Allow-Listed Custom Fields

### Core Concept

- **Allow-listed fields** appear as first-class CLI options and MCP parameters
- **Ad-hoc fields** use `--custom:fieldname` syntax with optional project-level enablement
- **Fail-fast validation** at project load detects conflicts and provides clear error messages
- **Configuration-driven** field definitions via separate `custom-fields.json` file

## Configuration File: `.taskmaster/custom-fields.json`

### File Location
- **Path**: `.taskmaster/custom-fields.json` (separate from config.json for reusability)
- **Scope**: Project-specific, can be copied/shared across projects
- **Optional**: Projects without this file have no custom fields support

### Schema Structure

```json
{
  "version": "1.0",
  "allowList": [
    "epic",
    "component", 
    "assignee",
    "sprint",
    "priority-level",
    "review-board"
  ],
  "allowAdhoc": false,
  "blockList": [
    "password",
    "secret",
    "token",
    "key"
  ],
  "description": "Custom fields configuration for project"
}
```

### Configuration Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `version` | string | "1.0" | Schema version for future compatibility |
| `allowList` | string[] | [] | Field names allowed as first-class CLI options |
| `allowAdhoc` | boolean | false | Enable `--custom:*` syntax for non-allow-listed fields |
| `blockList` | string[] | [] | Field names prohibited even with `--custom:*` syntax |
| `description` | string | "" | Human-readable description of the configuration |

## Behavior Matrix

| Scenario | Allow-listed Field | Ad-hoc Field | Behavior |
|----------|-------------------|--------------|----------|
| No custom-fields.json | N/A | N/A | No custom fields allowed (legacy read-only) |
| allowAdhoc = false | ✅ `--epic` | ❌ | Only allow-listed fields permitted |
| allowAdhoc = true | ✅ `--epic` | ✅ `--custom:field` | Both syntaxes available |
| Conflicting allow-list | ⚠️ → `--custom:epic` | N/A | Conflicts demoted to custom: syntax with warning |
| Block-listed field | ❌ | ❌ | Completely prohibited |

## Future Enhancements

### Template System (Future)
A template system could be added in a future release to provide common `allowList` configurations:
- "agile" - Scrum/Kanban workflow fields
- "enterprise" - Corporate development fields
- "minimal" - Basic project fields

## Implementation Requirements

### 1. Startup Validation

```javascript
function validateCustomFieldConfig(allowList, coreParameters) {
  const conflicts = allowList.filter(field => 
    coreParameters.has(field) || coreParameters.has(kebabToCamel(field))
  );
  
  if (conflicts.length > 0) {
    console.warn(`⚠️  Custom fields conflict with core parameters: ${conflicts.join(', ')}`);
    console.warn(`   These fields will only be accessible via --custom:* syntax`);
    // Validation is now dynamic and configurable via constructor parameters
    return allowList.filter(field => !conflicts.includes(field));
  }
  return allowList;
}
```

### 2. Dynamic CLI Generation

**For each command (add-task, add-subtask, update-task, update-subtask):**

```javascript
// Add allow-listed fields as native options
validCustomFields.forEach(field => {
  command.option(`--${field} <value>`, `Set ${field} custom field`);
});

// Add ad-hoc syntax if enabled
if (config.allowAdhoc) {
  // Note: Actual implementation uses dynamic parsing of --custom:fieldname <value> format
  // This is handled in the argument parsing logic rather than as a single option
}
```

### 3. Dynamic MCP Schema Generation

```javascript
// Add allow-listed fields to Zod schema
const customFieldSchema = {};
validCustomFields.forEach(field => {
  customFieldSchema[field] = z.string().optional().describe(`${field} custom field`);
});

// Extend base schema
const toolSchema = baseSchema.extend(customFieldSchema).passthrough();
```

### 4. Field Parsing Logic

```javascript
function parseCustomFields(args, config) {
  const customFields = {};
  
  // Extract allow-listed fields
  config.allowList.forEach(field => {
    if (args[field] !== undefined) {
      customFields[field] = args[field];
    }
  });
  
  // Extract ad-hoc fields if enabled (--custom:fieldname format)
  if (config.allowAdhoc) {
    for (const [key, value] of Object.entries(args)) {
      if (key.startsWith('custom:')) {
        const fieldName = key.substring(7); // Remove 'custom:' prefix
        
        // Check if field is blocked
        if (config.blockList.includes(fieldName)) {
          throw new Error(`Custom field '${fieldName}' is blocked by project configuration`);
        }
        
        customFields[fieldName] = value;
      }
    }
  }
  
  return customFields;
}
```

### 5. Help Text Generation

With the instance-based approach, help text generation requires loading the project-specific configuration:

```javascript
function generateCustomFieldHelp(projectRoot) {
  // Create configuration instance and load project-specific config
  const config = new CustomFieldsConfig();
  const loadedConfig = config.loadConfig(projectRoot);
  
  let help = '';
  
  if (loadedConfig.allowList.length > 0) {
    help += '\nCustom Fields (allow-listed):\n';
    loadedConfig.allowList.forEach(field => {
      help += `  --${field} <value>    Set ${field} field\n`;
    });
  }
  
  if (loadedConfig.allowAdhoc) {
    help += '\nAd-hoc Custom Fields:\n';
    help += '  --custom:fieldname <value>    Set arbitrary custom field\n';
    help += '                                Example: --custom:priority-level P1\n';
  }
  
  return help;
}
```

## Implementation Architecture

### Higher-Order Function Pattern
The system uses a `withCustomFields` HOF that wraps MCP tool functions:

```javascript
// In mcp-server/src/tools/utils.js
function withCustomFields(executeFn) {
  return async (args, context) => {
    // Create new instances instead of using singleton
    const config = new CustomFieldsConfig();
    const parser = new CustomFieldsParser(config);
    
    // Load configuration and parse custom fields
    config.loadConfig(args.projectRoot);
    const customFields = parser.parseCustomFields(args);
    
    // Call wrapped function with custom fields added to args
    return executeFn({ ...args, customFields }, context);
  };
}
```

### Configuration Service
- **Instance-Based Pattern**: Each operation creates its own configuration instance
- **Caching**: Per-instance configuration caching for performance  
- **Conflict Detection**: Automatic filtering of conflicting field names
- **Dynamic Schema Generation**: Creates Zod schemas for MCP validation

### Data Flow
1. **Configuration Loading**: Configuration loaded per project root and cached per instance
2. **Conflict Resolution**: Field names validated against core parameters
3. **Argument Parsing**: Custom fields extracted from CLI arguments or MCP parameters
4. **Validation**: Fields validated against allow/block lists
5. **Task Storage**: Custom fields stored in the `customFields` property of task objects

## Migration Strategy

### Phase 1: Core Implementation
1. Create custom-fields.json schema and validation
2. Implement dynamic CLI option generation  
3. Implement dynamic MCP schema generation
4. Update all four commands (add-task, add-subtask, update-task, update-subtask)

### Phase 2: Legacy Compatibility  
1. Add migration warnings for current predefined fields
2. Provide auto-migration tool to generate custom-fields.json from current usage
3. Maintain backward compatibility for existing custom field access

### Phase 3: Deprecation (Future Release)
1. Remove hardcoded predefined custom fields
2. Require explicit configuration for all custom field usage

## Error Messages

### Conflict Detection
```
⚠️  Custom field conflicts detected:
   - 'prompt' conflicts with core parameter, use --custom:prompt instead
   - 'file' conflicts with core parameter, use --custom:file instead

✅ Valid custom fields: epic, component, assignee
```

### Missing Configuration
```
❌ Custom fields not configured. 
   Create .taskmaster/custom-fields.json to enable custom fields.
```

### Block-list Violation
```
❌ Field 'password' is not allowed.
   Blocked fields: password, secret, token, key
```

## Benefits

1. **Safety**: Eliminates all naming conflicts through fail-fast validation
2. **Usability**: Allow-listed fields feel native while preserving flexibility
3. **Reusability**: Configuration files can be shared across projects
4. **Clarity**: Clear distinction between project-defined and ad-hoc fields
5. **Contextual Help**: CLI help shows only relevant fields for each project
6. **Future-proof**: Configuration-driven approach supports evolving requirements
7. **Project Isolation**: Each project can have its own custom field configuration
8. **Configuration Caching**: Performance optimization through intelligent caching
9. **Conflict Prevention**: Automatic detection and handling of core parameter conflicts

## Files to Modify

### Core Implementation
- `scripts/modules/utils/customFieldsConfig.js` - Configuration loading and validation  
- `mcp-server/src/tools/utils.js` - Higher-order function for custom fields integration
- `mcp-server/src/tools/*.js` - All MCP tools updated with custom fields support
- `mcp-server/src/core/direct-functions/*.js` - All direct functions updated for custom fields

### New Files
- `scripts/modules/utils/customFieldsConfig.js` - Configuration loading and validation
- `.taskmaster/custom-fields.json` - Example configuration file

### Documentation
- Update CLI help text generators
- Update MCP tool descriptions
- Add migration guide