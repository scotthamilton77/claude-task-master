/**
 * tools/add-task.js
 * Tool to add a new task using AI
 */

import { z } from 'zod';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot,
	withCustomFields
} from './utils.js';
import { addTaskDirect } from '../core/task-master-core.js';
import { findTasksPath } from '../core/utils/path-utils.js';

/**
 * Create base schema for add-task parameters (without custom fields)
 */
function createBaseAddTaskSchema() {
	return z.object({
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
			.describe('Whether to use research capabilities for task creation')
	});
}

/**
 * Register the addTask tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerAddTaskTool(server) {
	// Create a schema factory that generates schemas based on the request context
	const createDynamicSchema = () => {
		// We can't load config here as we don't have projectRoot yet
		// So we use passthrough to allow any fields and validate in the execute function
		return createBaseAddTaskSchema().passthrough();
	};

	server.addTool({
		name: 'add_task',
		description:
			'Add a new task using AI with optional custom fields for project-specific metadata. Custom fields are dynamically configured per project via .taskmaster/custom-fields.json',
		parameters: createDynamicSchema(), // Dynamic schema will be validated per request
		execute: withNormalizedProjectRoot(
			withCustomFields(async (args, { log, session }) => {
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

					// Custom fields are now provided by withCustomFields wrapper
					const { customFields } = args;

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
		)
	});
}
