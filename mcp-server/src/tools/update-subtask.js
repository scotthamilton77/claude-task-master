/**
 * tools/update-subtask.js
 * Tool to append additional information to a specific subtask
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse,
	withNormalizedProjectRoot,
	withCustomFields
} from './utils.js';
import { updateSubtaskByIdDirect } from '../core/task-master-core.js';
import { findTasksPath } from '../core/utils/path-utils.js';

/**
 * Create base schema for update-subtask parameters (without custom fields)
 */
function createBaseUpdateSubtaskSchema() {
	return z.object({
		id: z
			.string()
			.describe(
				'ID of the subtask to update in format "parentId.subtaskId" (e.g., "5.2"). Parent ID is the ID of the task that contains the subtask.'
			),
		prompt: z.string().describe('Information to add to the subtask'),
		research: z
			.boolean()
			.optional()
			.describe('Use Perplexity AI for research-backed updates'),
		file: z.string().optional().describe('Absolute path to the tasks file'),
		projectRoot: z
			.string()
			.describe('The directory of the project. Must be an absolute path.')
	});
}

/**
 * Register the update-subtask tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerUpdateSubtaskTool(server) {
	server.addTool({
		name: 'update_subtask',
		description:
			'Appends timestamped information to a specific subtask and can update custom fields. Custom fields are dynamically configured per project via .taskmaster/custom-fields.json. If you just want to update the subtask status, use set_task_status instead.',
		parameters: createBaseUpdateSubtaskSchema().passthrough(), // Use base schema with passthrough
		execute: withNormalizedProjectRoot(
			withCustomFields(async (args, { log, session }) => {
				const toolName = 'update_subtask';
				try {
					log.info(`Updating subtask with args: ${JSON.stringify(args)}`);

					let tasksJsonPath;
					try {
						tasksJsonPath = findTasksPath(
							{ projectRoot: args.projectRoot, file: args.file },
							log
						);
					} catch (error) {
						log.error(
							`${toolName}: Error finding tasks.json: ${error.message}`
						);
						return createErrorResponse(
							`Failed to find tasks.json: ${error.message}`
						);
					}

					// Custom fields are now provided by withCustomFields wrapper
					const { customFields } = args;

					const result = await updateSubtaskByIdDirect(
						{
							tasksJsonPath: tasksJsonPath,
							id: args.id,
							prompt: args.prompt,
							research: args.research,
							projectRoot: args.projectRoot,
							customFields: customFields
						},
						log,
						{ session }
					);

					if (result.success) {
						log.info(`Successfully updated subtask with ID ${args.id}`);
					} else {
						log.error(
							`Failed to update subtask: ${result.error?.message || 'Unknown error'}`
						);
					}

					return handleApiResult(
						result,
						log,
						'Error updating subtask',
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
		)
	});
}
