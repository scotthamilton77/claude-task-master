/**
 * tools/update-task.js
 * Tool to update a single task by ID with new information
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse,
	withNormalizedProjectRoot
} from './utils.js';
import { updateTaskByIdDirect } from '../core/task-master-core.js';
import { findTasksPath } from '../core/utils/path-utils.js';

/**
 * Register the update-task tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateTaskTool(server) {
	server.addTool({
		name: 'update_task',
		description:
			'Updates a single task by ID with new information, context, or custom fields. Use specific custom field parameters to update task metadata.',
		parameters: z
			.object({
				id: z
					.string() // ID can be number or string like "1.2"
					.describe(
						"ID of the task (e.g., '15') to update. Subtasks are supported using the update-subtask tool."
					),
				prompt: z
					.string()
					.describe('New information or context to incorporate into the task'),
				research: z
					.boolean()
					.optional()
					.describe('Use Perplexity AI for research-backed updates'),
				append: z
					.boolean()
					.optional()
					.describe(
						'Append timestamped information to task details instead of full update'
					),
				file: z.string().optional().describe('Absolute path to the tasks file'),
				projectRoot: z
					.string()
					.describe('The directory of the project. Must be an absolute path.'),
				// Custom field examples for updates
				epic: z
					.string()
					.optional()
					.describe('Update epic identifier (custom field example: EPIC-1234)'),
				component: z
					.string()
					.optional()
					.describe(
						'Update component name (custom field example: auth, ui, api)'
					),
				assignee: z
					.string()
					.optional()
					.describe(
						'Update assigned developer (custom field example: john.doe)'
					),
				status_notes: z
					.string()
					.optional()
					.describe(
						'Update status notes (custom field example: blocked by external API)'
					),
				priority_reason: z
					.string()
					.optional()
					.describe(
						'Update priority justification (custom field example: customer request)'
					)
			})
			.passthrough(), // Allow additional custom field parameters
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			const toolName = 'update_task';
			try {
				log.info(
					`Executing ${toolName} tool with args: ${JSON.stringify(args)}`
				);

				let tasksJsonPath;
				try {
					tasksJsonPath = findTasksPath(
						{ projectRoot: args.projectRoot, file: args.file },
						log
					);
					log.info(`${toolName}: Resolved tasks path: ${tasksJsonPath}`);
				} catch (error) {
					log.error(`${toolName}: Error finding tasks.json: ${error.message}`);
					return createErrorResponse(
						`Failed to find tasks.json: ${error.message}`
					);
				}

				// Extract custom fields from args (any parameter not in core parameters)
				const coreParameters = new Set([
					'id',
					'prompt',
					'research',
					'append',
					'file',
					'projectRoot'
				]);
				const customFields = {};
				Object.entries(args).forEach(([key, value]) => {
					if (!coreParameters.has(key) && value !== undefined) {
						customFields[key] = value;
					}
				});

				// 3. Call Direct Function - Include projectRoot and custom fields
				const result = await updateTaskByIdDirect(
					{
						tasksJsonPath: tasksJsonPath,
						id: args.id,
						prompt: args.prompt,
						research: args.research,
						append: args.append,
						projectRoot: args.projectRoot,
						customFields: customFields
					},
					log,
					{ session }
				);

				// 4. Handle Result
				log.info(
					`${toolName}: Direct function result: success=${result.success}`
				);
				return handleApiResult(
					result,
					log,
					'Error updating task',
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(
					`Critical error in ${toolName} tool execute: ${error.message}`
				);
				return createErrorResponse(
					`Internal tool error (${toolName}): ${error.message}`
				);
			}
		})
	});
}
