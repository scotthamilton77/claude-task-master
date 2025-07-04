/**
 * tools/get-tasks.js
 * Tool to get all tasks from Task Master
 */

import { z } from 'zod';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';
import { listTasksDirect } from '../core/task-master-core.js';
import {
	resolveTasksPath,
	resolveComplexityReportPath
} from '../core/utils/path-utils.js';

/**
 * Register the getTasks tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerListTasksTool(server) {
	server.addTool({
		name: 'get_tasks',
		description:
			'Get all tasks from Task Master, optionally filtering by status, custom fields, and including subtasks. Custom fields can be used as first-class query parameters (e.g., epic, component, assignee, taskType, etc.).',
		parameters: z.object({
			status: z
				.string()
				.optional()
				.describe(
					"Filter tasks by status (e.g., 'pending', 'done') or multiple statuses separated by commas (e.g., 'blocked,deferred')"
				),
			withSubtasks: z
				.boolean()
				.optional()
				.describe(
					'Include subtasks nested within their parent tasks in the response'
				),
			file: z
				.string()
				.optional()
				.describe(
					'Path to the tasks file (relative to project root or absolute)'
				),
			complexityReport: z
				.string()
				.optional()
				.describe(
					'Path to the complexity report file (relative to project root or absolute)'
				),
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			// Custom field parameters (examples - any custom field name can be used)
			epic: z
				.string()
				.optional()
				.describe('Filter by epic custom field (e.g., "EPIC-1234")'),
			component: z
				.string()
				.optional()
				.describe('Filter by component custom field (e.g., "auth", "database")'),
			assignee: z
				.string()
				.optional()
				.describe('Filter by assignee custom field (e.g., "john.doe")'),
			taskType: z
				.string()
				.optional()
				.describe('Filter by task type custom field (e.g., "feature", "bug")'),
			sprint: z
				.string()
				.optional()
				.describe('Filter by sprint custom field (e.g., "2024-Q1-S3")'),
			riskLevel: z
				.string()
				.optional()
				.describe('Filter by risk level custom field (e.g., "high", "medium", "low")')
		}).passthrough(), // Allow additional custom field parameters not explicitly defined
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info(`Getting tasks with filters: ${JSON.stringify(args)}`);

				// Resolve the path to tasks.json using new path utilities
				let tasksJsonPath;
				try {
					tasksJsonPath = resolveTasksPath(args, log);
				} catch (error) {
					log.error(`Error finding tasks.json: ${error.message}`);
					return createErrorResponse(
						`Failed to find tasks.json: ${error.message}`
					);
				}

				// Resolve the path to complexity report
				let complexityReportPath;
				try {
					complexityReportPath = resolveComplexityReportPath(args, session);
				} catch (error) {
					log.error(`Error finding complexity report: ${error.message}`);
					// This is optional, so we don't fail the operation
					complexityReportPath = null;
				}

				// Extract custom field filters from args
				// Core parameters that are not custom fields
				const coreParams = ['status', 'withSubtasks', 'file', 'complexityReport', 'projectRoot'];
				const customFieldFilters = {};
				
				Object.entries(args).forEach(([key, value]) => {
					if (!coreParams.includes(key) && value !== undefined) {
						customFieldFilters[key] = value;
					}
				});

				log.info(`Custom field filters: ${JSON.stringify(customFieldFilters)}`);

				const result = await listTasksDirect(
					{
						tasksJsonPath: tasksJsonPath,
						status: args.status,
						withSubtasks: args.withSubtasks,
						reportPath: complexityReportPath,
						projectRoot: args.projectRoot,
						customFieldFilters: customFieldFilters
					},
					log,
					{ session }
				);

				log.info(
					`Retrieved ${result.success ? result.data?.tasks?.length || 0 : 0} tasks`
				);
				return handleApiResult(
					result,
					log,
					'Error getting tasks',
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(`Error getting tasks: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}

// We no longer need the formatTasksResponse function as we're returning raw JSON data
