/**
 * tools/add-task.js
 * Tool to add a new task using AI
 */

import { z } from 'zod';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';
import { addTaskDirect } from '../core/task-master-core.js';
import { findTasksPath } from '../core/utils/path-utils.js';

/**
 * Register the addTask tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerAddTaskTool(server) {
	server.addTool({
		name: 'add_task',
		description:
			'Add a new task using AI with optional custom fields for project-specific metadata (epic, component, assignee, etc.)',
		parameters: z
			.object({
				prompt: z
					.string()
					.optional()
					.describe(
						'Description of the task to add (required if not using manual fields)'
					),
				title: z
					.string()
					.optional()
					.describe('Task title (for manual task creation)'),
				description: z
					.string()
					.optional()
					.describe('Task description (for manual task creation)'),
				details: z
					.string()
					.optional()
					.describe('Implementation details (for manual task creation)'),
				testStrategy: z
					.string()
					.optional()
					.describe('Test strategy (for manual task creation)'),
				dependencies: z
					.string()
					.optional()
					.describe('Comma-separated list of task IDs this task depends on'),
				priority: z
					.string()
					.optional()
					.describe('Task priority (high, medium, low)'),
				file: z
					.string()
					.optional()
					.describe('Path to the tasks file (default: tasks/tasks.json)'),
				projectRoot: z
					.string()
					.describe('The directory of the project. Must be an absolute path.'),
				research: z
					.boolean()
					.optional()
					.describe('Whether to use research capabilities for task creation'),
				// Custom field examples - these demonstrate the pattern
				epic: z
					.string()
					.optional()
					.describe('Epic identifier (custom field example: EPIC-1234)'),
				component: z
					.string()
					.optional()
					.describe('Component name (custom field example: auth, ui, api)'),
				assignee: z
					.string()
					.optional()
					.describe('Assigned developer (custom field example: john.doe)'),
				sprint: z
					.string()
					.optional()
					.describe('Sprint identifier (custom field example: sprint-24)'),
				team: z
					.string()
					.optional()
					.describe('Team name (custom field example: frontend, backend)'),
				labels: z
					.string()
					.optional()
					.describe('Comma-separated labels (custom field example: bug,urgent)')
			})
			.passthrough(), // Allow additional custom field parameters
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info(`Starting add-task with args: ${JSON.stringify(args)}`);

				// Use args.projectRoot directly (guaranteed by withNormalizedProjectRoot)
				let tasksJsonPath;
				try {
					tasksJsonPath = findTasksPath(
						{ projectRoot: args.projectRoot, file: args.file },
						log
					);
				} catch (error) {
					log.error(`Error finding tasks.json: ${error.message}`);
					return createErrorResponse(
						`Failed to find tasks.json: ${error.message}`
					);
				}

				// Extract custom fields from args (any parameter not in core parameters)
				const coreParameters = new Set([
					'prompt',
					'title',
					'description',
					'details',
					'testStrategy',
					'dependencies',
					'priority',
					'file',
					'projectRoot',
					'research'
				]);
				const customFields = {};
				Object.entries(args).forEach(([key, value]) => {
					if (!coreParameters.has(key) && value !== undefined) {
						customFields[key] = value;
					}
				});

				// Call the direct function
				const result = await addTaskDirect(
					{
						tasksJsonPath: tasksJsonPath,
						prompt: args.prompt,
						title: args.title,
						description: args.description,
						details: args.details,
						testStrategy: args.testStrategy,
						dependencies: args.dependencies,
						priority: args.priority,
						research: args.research,
						projectRoot: args.projectRoot,
						customFields: customFields
					},
					log,
					{ session }
				);

				return handleApiResult(
					result,
					log,
					'Error adding task',
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(`Error in add-task tool: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}
