# Enhancement: Custom Fields for Tasks and Subtasks

## Overview

This enhancement adds support for custom fields in the form of name/value pairs to tasks and subtasks, enabling flexible organization and advanced querying capabilities. Custom fields are treated as first-class fields in the data structure for search and filtering operations.

## Current State Analysis

### Task Data Structure
Tasks currently have these core fields:
- `id`, `title`, `description`, `details`, `testStrategy`
- `status`, `dependencies`, `priority`, `subtasks`

### Existing Query Capabilities
- Status-based filtering with comma-separated values
- Fuzzy search across title, description, details fields
- Tag-based context switching
- Individual task retrieval by ID

### Limitations
- No field-specific custom data storage
- No complex query syntax beyond status filtering
- No support for custom organizational schemes (epics, sprints, components)

## Proposed Enhancement

### 1. Data Schema Extensions

Add custom fields in a separate `customFields` object while providing first-class query experience:
```javascript
{
  "id": 1,
  "title": "Implement user authentication",
  "description": "Add login/logout functionality",
  "details": "...",
  "status": "pending",
  "priority": "high",
  "customFields": {
    "epic": "EPIC-1234",
    "taskType": "story",
    "component": "auth",
    "sprint": "2024-Q1-S3",
    "riskLevel": "high",
    "estimatedHours": "16",
    "assignee": "john.doe"
  },
  "subtasks": [...]
}
```

**Hybrid Approach Benefits:**
- Clean separation between system and user-defined fields
- First-class query experience (`--epic EPIC-1234` works like `--status pending`)
- No namespace pollution with core TaskMaster fields
- Easy validation and conflict prevention

### 2. Core Function Modifications

#### Files to Update:
- `scripts/modules/task-manager/add-task.js` - Add metadata parameter
- `scripts/modules/task-manager/expand-task.js` - Add metadata to subtask schema
- `scripts/modules/task-manager/list-tasks.js` - Add metadata filtering logic
- `mcp-server/src/tools/get-tasks.js` - Add metadata query parameters
- `mcp-server/src/tools/add-task.js` - Support metadata in task creation
- `mcp-server/src/tools/add-subtask.js` - Support metadata in subtask creation

#### Schema Updates:
```javascript
// In add-task.js - extend AiTaskDataSchema
const AiTaskDataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  details: z.string().min(1),
  testStrategy: z.string().min(1)
  // Custom fields are not included in AI generation schema
  // but are added separately via customFields parameter
});

// New parameter for explicit custom fields
const customFields = z.record(z.string()).optional().default({});
```

### 3. Enhanced Query Parameters

#### Enhanced get_tasks Function:
```javascript
// Custom fields feel first-class but are internally translated
{
  status: "pending,in-progress",     // Core field
  epic: "EPIC-1234",                 // Translates to customFields.epic
  component: "auth",                 // Translates to customFields.component
  sprint: "2024-Q1-S3",              // Translates to customFields.sprint
  taskType: "story",                 // Translates to customFields.taskType
  riskLevel: "high"                  // Translates to customFields.riskLevel
}
```

#### Query Translation Logic:
1. Check if parameter is a core field (`status`, `priority`, `id`, etc.)
2. If not core field, look for it in `customFields`
3. Provide helpful error messages for unknown fields

#### Query Examples:
- `get_tasks --epic EPIC-1234` - All tasks for specific epic
- `get_tasks --component auth --sprint 2024-Q1-S3` - Multiple custom field filters
- `get_tasks --status pending --assignee john.doe` - Core + custom field combination
- `get_tasks --taskType story --riskLevel high` - Custom field filtering

### 4. Enhanced Search Integration

#### FuzzyTaskSearch Updates:
```javascript
// In scripts/modules/utils/fuzzyTaskSearch.js
const searchOptions = {
  keys: [
    { name: 'title', weight: 2.0 },
    { name: 'description', weight: 1.5 },
    { name: 'details', weight: 1.0 },
    { name: 'customFields.epic', weight: 1.8 },        // Custom field search
    { name: 'customFields.component', weight: 1.5 },   // Custom field search
    { name: 'customFields.assignee', weight: 1.2 },    // Custom field search
    { name: 'customFields.taskType', weight: 1.6 }     // Custom field search
  ]
};

// Dynamic search key generation based on discovered custom fields
function generateSearchKeys(tasks) {
  const coreFields = ['title', 'description', 'details'];
  const customFields = getCustomFieldNames(tasks);
  
  return [
    ...coreFields.map(field => ({ name: field, weight: getWeightForField(field) })),
    ...customFields.map(field => ({ 
      name: `customFields.${field}`, 
      weight: getWeightForField(field) 
    }))
  ];
}

// Helper to extract all custom field names from tasks
function getCustomFieldNames(tasks) {
  const fieldNames = new Set();
  tasks.forEach(task => {
    if (task.customFields) {
      Object.keys(task.customFields).forEach(field => fieldNames.add(field));
    }
  });
  return Array.from(fieldNames);
}
```

### 5. New MCP Tools

#### set_task_custom_fields Tool:
```javascript
// mcp-server/src/tools/set-task-custom-fields.js
{
  id: "15", // or "15.2" for subtasks
  customFields: {
    "epic": "EPIC-1234",
    "component": "auth"
  },
  operation: "set" // or "merge", "unset"
}
```

#### get_custom_field_names Tool:
```javascript
// List all custom field names used across tasks
{
  projectRoot: "/path/to/project",
  tag: "master" // optional
}
```

#### Enhanced add_task Tool:
```javascript
// mcp-server/src/tools/add-task.js
{
  prompt: "Implement user authentication",
  customFields: {
    "epic": "EPIC-1234",
    "component": "auth",
    "assignee": "john.doe"
  },
  // ... other existing parameters
}
```

### 6. CLI Interface Updates

#### New Commands:
```bash
# Add custom fields during task creation
task-master add-task --custom-fields epic=EPIC-1234,component=auth "Implement login"

# Update custom fields on existing tasks
task-master set-custom-fields 15 epic=EPIC-1234 component=auth

# List tasks with custom field filtering (first-class parameters)
task-master list --epic EPIC-1234
task-master list --component auth --sprint 2024-Q1-S3
task-master list --status pending --assignee john.doe

# Show all custom field names in use
task-master custom-field-names

# Remove custom fields
task-master unset-custom-fields 15 epic component
```

#### Enhanced List Output:
```
Task 15: Implement user authentication [pending]
├─ Task Type: story
├─ Epic: EPIC-1234
├─ Component: auth
├─ Risk Level: high
├─ Sprint: 2024-Q1-S3
└─ Assignee: john.doe
```

## Implementation Plan

### Phase 0: Test-Driven Development Foundation

#### Test Strategy Overview
All implementation phases must follow a strict test-driven development (TDD) methodology:
1. Write failing tests first (red phase)
2. Implement minimal code to pass tests (green phase)
3. Refactor for clarity and performance (refactor phase)
4. Maintain 100% test coverage for all new code

#### Test Categories & Scope

##### Unit Tests (`tests/unit/`)
- **Schema Validation Tests** (`tests/unit/custom-fields-schema.test.js`)
  - Valid customFields object structures
  - Invalid field names (reserved words, special characters)
  - Type validation for field values
  - Backward compatibility with tasks missing customFields
  
- **Query Translation Tests** (`tests/unit/custom-fields-query.test.js`)
  - Core field vs custom field detection
  - Query parameter translation accuracy
  - Invalid field name handling and suggestions
  - Complex multi-field query combinations
  
- **Search Integration Tests** (`tests/unit/custom-fields-search.test.js`)
  - Dynamic search key generation
  - Custom field weight calculation
  - Fuzzy search accuracy with custom fields
  - Performance benchmarks for large datasets

##### Integration Tests (`tests/integration/`)
- **Task Creation Tests** (`tests/integration/custom-fields-create.test.js`)
  - Add tasks with custom fields via MCP tools
  - Add subtasks with inherited custom fields
  - Validation error handling and messaging
  - File format preservation and migration
  
- **Task Query Tests** (`tests/integration/custom-fields-query.test.js`)
  - Single custom field filtering
  - Multiple custom field combinations
  - Mixed core and custom field queries
  - Empty result handling
  
- **Task Update Tests** (`tests/integration/custom-fields-update.test.js`)
  - Set custom fields on existing tasks
  - Merge custom fields (partial updates)
  - Unset/remove custom fields
  - Bulk custom field operations

##### End-to-End Tests (`tests/e2e/`)
- **CLI Workflow Tests** (`tests/e2e/custom-fields-cli.test.js`)
  - Complete task creation with custom fields
  - Query and filter workflows
  - Custom field management commands
  - Error scenarios and recovery
  
- **MCP Server Tests** (`tests/e2e/custom-fields-mcp.test.js`)
  - Full MCP tool invocation cycles
  - Multi-step workflows with custom fields
  - Performance under load
  - Concurrent operation handling

#### Test Data & Fixtures
- **Mock Task Data** (`tests/fixtures/custom-fields/`)
  - Tasks with various custom field combinations
  - Legacy tasks without custom fields
  - Edge cases (empty, null, undefined values)
  - Large datasets for performance testing

#### Test Implementation Order
1. **Schema validation tests first** - Define the data contract
2. **Query translation tests** - Establish query semantics
3. **Core function unit tests** - Test individual components
4. **Integration tests** - Verify component interactions
5. **End-to-end tests** - Validate complete workflows

### Phase 1: Schema & Core Support
1. Write comprehensive schema validation tests
2. Add `customFields` object to task and subtask schemas
3. Update Zod validation in task creation functions
4. Implement backward compatibility handling
5. Add customFields parameter to add-task and add-subtask functions

### Phase 2: Query & Filter Integration
1. Write query translation and filtering tests
2. Implement query translation logic (core fields vs customFields)
3. Add reserved field names validation to prevent conflicts
4. Extend listTasks function with custom field filtering logic
5. Add dynamic custom field search capabilities to FuzzyTaskSearch
6. Update get_tasks MCP tool with hybrid query parameters

### Phase 3: CLI & UX Enhancements
1. Write CLI command and output formatting tests
2. Add CLI commands for custom field management
3. Update help documentation and examples
4. Add custom field display in task listings
5. Implement custom field validation and suggestions

### Phase 4: Advanced Features
1. Write tests for advanced feature scenarios
2. Custom field templates for common use cases
3. Custom field inheritance from parent tasks to subtasks
4. Custom field-based task grouping and reporting
5. Integration with complexity analysis

## Benefits

### Flexible Organization
- **Task Types**: `--taskType epic`, `--taskType story`, `--taskType bug`, `--taskType feature`
- **Risk Management**: `--riskLevel high`, `--riskLevel medium`, `--riskLevel low`
- **Epic Tracking**: `--epic EPIC-1234` to group tasks by business initiative
- **Sprint Management**: `--sprint 2024-Q1-S3` to organize by development cycles
- **Component Tagging**: `--component auth`, `--component database` to filter by system area
- **Team Assignment**: `--assignee john.doe`, `--team backend` for workload management
- **Any Future Needs**: Just add custom fields, no TaskMaster code changes needed

### Enhanced Queries
- **Multi-dimensional filtering**: `--epic EPIC-1234 --priority high --status pending --riskLevel high`
- **Task type workflows**: `--taskType story --status pending` or `--taskType bug --assignee john.doe`
- **Complex combinations**: Mix core fields and custom fields seamlessly
- **Presence-based queries**: Find tasks missing required custom fields
- **Fuzzy search**: Search across all custom field values
- **First-class experience**: Custom fields work exactly like core fields from user perspective

### Backward Compatibility
- Existing tasks continue working unchanged
- Optional custom fields with sensible defaults
- Graceful handling of missing custom fields during queries

### Extensibility
- **Zero-code custom fields**: Add any field without TaskMaster updates
- **Clean data model**: Clear separation between system and user concerns
- **Dynamic discovery**: Search and filtering automatically adapt to new fields
- **Integration ready**: Works with existing tag and complexity systems
- **Schema evolution**: Easy to extend without breaking changes

## Technical Considerations

### Performance
- Index custom field names for faster filtering
- Optimize fuzzy search with dynamic custom field inclusion
- Consider pagination for large result sets
- Efficient custom field discovery and caching
- Query translation caching for frequently used custom fields

### Validation
- Maintain reserved field names list (id, title, status, priority, etc.)
- Custom field naming conventions (no spaces, alphanumeric + underscore)
- Value type validation (strings, numbers, dates)
- Required vs optional custom fields
- Field name collision detection with core fields
- Helpful error messages for unknown fields

### Query Translation
- Priority order: core fields checked first, then customFields
- Case-insensitive field name matching
- Fuzzy field name suggestions for typos
- Clear error messages when fields don't exist

### Migration
- Automatic migration of existing task files
- Preserve all existing functionality
- Clear upgrade path for users

## Success Metrics

- Zero breaking changes to existing functionality
- Support for complex custom field queries
- Intuitive CLI interface for custom field management
- Performance maintains current standards
- Documentation and examples for common use cases
- First-class treatment of custom fields identical to core fields

## Future / Next Enhancements

- project-level custom field definitions to be enforced (e.g. prevent addition of custom fields to a task that aren't already pre-defined for the project)
  - allow for these to be custom-weighted for the fuzzy search
