import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

// Import the actual implementations to test
import addTask from '../../scripts/modules/task-manager/add-task.js';
import addSubtask from '../../scripts/modules/task-manager/add-subtask.js';
import updateTaskById from '../../scripts/modules/task-manager/update-task-by-id.js';
import updateSubtaskById from '../../scripts/modules/task-manager/update-subtask-by-id.js';

// Import MCP tool functions 
import { addTaskDirect } from '../../mcp-server/src/core/direct-functions/add-task-direct.js';
import { addSubtaskDirect } from '../../mcp-server/src/core/direct-functions/add-subtask-direct.js';
import { updateTaskByIdDirect } from '../../mcp-server/src/core/direct-functions/update-task-by-id.js';
import { updateSubtaskByIdDirect } from '../../mcp-server/src/core/direct-functions/update-subtask-by-id.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Custom Fields Dual Path Integration Tests', () => {
	let testDir;
	let projectRoot;
	let tasksFilePath;
	let configFilePath;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-dual-test-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });

		tasksFilePath = path.join(tasksDir, 'tasks.json');
		configFilePath = path.join(taskMasterDir, 'custom-fields.json');

		// Initialize empty tasks file
		await fs.writeFile(
			tasksFilePath,
			JSON.stringify(
				{
					master: {
						tasks: [],
						metadata: {
							created: new Date().toISOString(),
							description: 'Test tasks for master context'
						}
					}
				},
				null,
				2
			)
		);

		// Create custom fields configuration
		const customFieldsConfig = {
			version: '1.0',
			allowList: ['epic', 'component', 'assignee'],
			allowAdhoc: true,
			blockList: ['password', 'secret'],
			description: 'Test configuration for dual path testing'
		};

		await fs.writeFile(configFilePath, JSON.stringify(customFieldsConfig, null, 2));
	});

	afterEach(async () => {
		// Clean up test directory
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Add Task - CLI vs MCP Consistency', () => {
		it('should produce identical results for CLI and MCP paths with custom fields', async () => {
			// Test data
			const taskData = {
				title: 'Test Task with Custom Fields',
				description: 'Testing dual path consistency',
				details: 'Implementation details for testing',
				testStrategy: 'Unit and integration tests',
				priority: 'high'
			};

			const customFields = {
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe',
				'custom-field': 'custom-value' // ad-hoc field
			};

			// Mock console.log and other CLI outputs to prevent spam
			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				// === CLI PATH ===
				const cliResult = await addTask(
					tasksFilePath,
					`Create a task: ${taskData.description}`,
					[], // dependencies
					taskData.priority,
					{
						projectRoot: projectRoot,
						commandName: 'add-task',
						outputType: 'cli'
					},
					'json', // outputFormat to minimize CLI output
					taskData, // manualTaskData
					false, // useResearch
					null, // tag
					customFields
				);

				// Read CLI result from file
				const cliFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const cliTasksData = JSON.parse(cliFileContent);
				const cliTask = cliTasksData.master.tasks[0];

				// === Reset for MCP PATH ===
				// Clear the tasks file
				await fs.writeFile(
					tasksFilePath,
					JSON.stringify(
						{
							master: {
								tasks: [],
								metadata: {
									created: new Date().toISOString(),
									description: 'Test tasks for master context'
								}
							}
						},
						null,
						2
					)
				);

				// Create mock logger for MCP
				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				// === MCP PATH ===
				const mcpResult = await addTaskDirect(
					{
						tasksJsonPath: tasksFilePath,
						prompt: `Create a task: ${taskData.description}`,
						title: taskData.title,
						description: taskData.description,
						details: taskData.details,
						testStrategy: taskData.testStrategy,
						priority: taskData.priority,
						dependencies: '',
						research: false,
						projectRoot: projectRoot,
						customFields: customFields
					},
					mcpLog,
					{ session: { id: 'test-session' } }
				);

				// Read MCP result from file
				const mcpFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const mcpTasksData = JSON.parse(mcpFileContent);
				const mcpTask = mcpTasksData.master.tasks[0];

				// === COMPARISON ===
				// Both should be successful
				expect(cliResult.newTaskId).toBeDefined();
				expect(mcpResult.success).toBe(true);

				// Core task properties should be identical
				expect(cliTask.title).toBe(mcpTask.title);
				expect(cliTask.description).toBe(mcpTask.description);
				expect(cliTask.details).toBe(mcpTask.details);
				expect(cliTask.testStrategy).toBe(mcpTask.testStrategy);
				expect(cliTask.priority).toBe(mcpTask.priority);
				expect(cliTask.status).toBe(mcpTask.status);

				// Custom fields should be identical
				expect(cliTask.customFields).toEqual(mcpTask.customFields);
				expect(cliTask.customFields.epic).toBe('EPIC-1234');
				expect(cliTask.customFields.component).toBe('auth');
				expect(cliTask.customFields.assignee).toBe('john.doe');
				expect(cliTask.customFields['custom-field']).toBe('custom-value');

				// File structure should be identical
				expect(cliTasksData.master.tasks).toHaveLength(1);
				expect(mcpTasksData.master.tasks).toHaveLength(1);

			} finally {
				// Restore console
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});

		it('should handle missing configuration consistently', async () => {
			// Remove custom fields configuration
			await fs.unlink(configFilePath);

			const taskData = {
				title: 'Task without config',
				description: 'Testing without configuration'
			};

			const customFields = {
				epic: 'EPIC-5678',
				component: 'backend'
			};

			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				// === CLI PATH ===
				const cliResult = await addTask(
					tasksFilePath,
					`Create task: ${taskData.description}`,
					[],
					'medium',
					{
						projectRoot: projectRoot,
						commandName: 'add-task',
						outputType: 'cli'
					},
					'json',
					taskData,
					false,
					null,
					customFields
				);

				const cliFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const cliTasksData = JSON.parse(cliFileContent);
				const cliTask = cliTasksData.master.tasks[0];

				// === Reset for MCP PATH ===
				await fs.writeFile(
					tasksFilePath,
					JSON.stringify(
						{
							master: {
								tasks: [],
								metadata: {
									created: new Date().toISOString(),
									description: 'Test tasks for master context'
								}
							}
						},
						null,
						2
					)
				);

				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				// === MCP PATH ===
				const mcpResult = await addTaskDirect(
					{
						tasksJsonPath: tasksFilePath,
						title: taskData.title,
						description: taskData.description,
						projectRoot: projectRoot,
						customFields: customFields
					},
					mcpLog,
					{ session: { id: 'test-session' } }
				);

				const mcpFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const mcpTasksData = JSON.parse(mcpFileContent);
				const mcpTask = mcpTasksData.master.tasks[0];

				// === COMPARISON ===
				// Without configuration, both paths should handle custom fields gracefully
				// The exact behavior depends on implementation, but should be consistent
				expect(cliTask.customFields).toEqual(mcpTask.customFields);

				// Both should succeed despite missing config
				expect(cliResult.newTaskId).toBeDefined();
				expect(mcpResult.success).toBe(true);

			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});
	});

	describe('Add Subtask - CLI vs MCP Consistency', () => {
		it('should produce identical results for CLI and MCP subtask creation', async () => {
			// First create a parent task
			const parentTaskData = {
				title: 'Parent Task',
				description: 'Parent task for subtask testing',
				details: 'Parent task details',
				testStrategy: 'Parent test strategy'
			};

			// Add parent task via CLI to have a consistent starting point
			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				await addTask(
					tasksFilePath,
					'Create parent task',
					[],
					'medium',
					{
						projectRoot: projectRoot,
						commandName: 'add-task',
						outputType: 'cli'
					},
					'json',
					parentTaskData,
					false,
					null,
					{ epic: 'EPIC-PARENT', component: 'parent' }
				);

				const subtaskData = {
					title: 'Test Subtask',
					description: 'Testing subtask dual path',
					details: 'Subtask implementation details',
					status: 'pending'
				};

				const subtaskCustomFields = {
					assignee: 'jane.doe',
					component: 'subtask-component',
					'difficulty': 'medium' // ad-hoc field
				};

				// === CLI PATH ===
				const cliSubtaskResult = await addSubtask(
					tasksFilePath,
					1, // parentId
					null, // existingTaskId
					subtaskData,
					true, // generateFiles
					{
						projectRoot: projectRoot,
						tag: 'master'
					},
					subtaskCustomFields
				);

				const cliFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const cliTasksData = JSON.parse(cliFileContent);
				const cliParentTask = cliTasksData.master.tasks.find(t => t.id === 1);
				const cliSubtask = cliParentTask.subtasks[0];

				// === Reset subtasks for MCP PATH ===
				cliParentTask.subtasks = [];
				await fs.writeFile(tasksFilePath, JSON.stringify(cliTasksData, null, 2));

				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				// === MCP PATH ===
				const mcpSubtaskResult = await addSubtaskDirect(
					{
						tasksJsonPath: tasksFilePath,
						id: '1',
						title: subtaskData.title,
						description: subtaskData.description,
						details: subtaskData.details,
						status: subtaskData.status,
						projectRoot: projectRoot,
						customFields: subtaskCustomFields
					},
					mcpLog,
					{ session: { id: 'test-session' } }
				);

				const mcpFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const mcpTasksData = JSON.parse(mcpFileContent);
				const mcpParentTask = mcpTasksData.master.tasks.find(t => t.id === 1);
				const mcpSubtask = mcpParentTask.subtasks[0];

				// === COMPARISON ===
				expect(cliSubtaskResult).toBeDefined();
				expect(mcpSubtaskResult.success).toBe(true);

				// Subtask properties should be identical
				expect(cliSubtask.title).toBe(mcpSubtask.title);
				expect(cliSubtask.status).toBe(mcpSubtask.status);
				expect(cliSubtask.details).toBe(mcpSubtask.details);

				// Custom fields should be identical
				expect(cliSubtask.customFields).toEqual(mcpSubtask.customFields);
				expect(cliSubtask.customFields.assignee).toBe('jane.doe');
				expect(cliSubtask.customFields.component).toBe('subtask-component');
				expect(cliSubtask.customFields.difficulty).toBe('medium');

			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});
	});

	describe('Update Operations - CLI vs MCP Consistency', () => {
		it('should produce identical results for task updates with custom fields', async () => {
			// Setup: Create a task first
			const initialTaskData = {
				title: 'Task to Update',
				description: 'Initial description',
				details: 'Initial details',
				testStrategy: 'Initial test strategy'
			};

			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				await addTask(
					tasksFilePath,
					'Create task to update',
					[],
					'medium',
					{
						projectRoot: projectRoot,
						commandName: 'add-task',
						outputType: 'cli'
					},
					'json',
					initialTaskData,
					false,
					null,
					{ epic: 'EPIC-UPDATE', component: 'initial' }
				);

				const updatePrompt = 'Add new requirements and update status';
				const updateCustomFields = {
					epic: 'EPIC-UPDATED',
					assignee: 'update.user',
					'priority-level': 'critical' // ad-hoc field
				};

				// === CLI PATH ===
				const cliUpdateResult = await updateTaskById(
					tasksFilePath,
					1,
					updatePrompt,
					false, // useResearch
					{
						projectRoot: projectRoot,
						customFields: updateCustomFields
					},
					'json', // outputFormat
					true // appendMode
				);

				const cliFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const cliTasksData = JSON.parse(cliFileContent);
				const cliUpdatedTask = cliTasksData.master.tasks.find(t => t.id === 1);

				// === Reset task for MCP PATH ===
				// Restore original task state
				const resetTasksData = {
					master: {
						tasks: [{
							id: 1,
							title: initialTaskData.title,
							description: initialTaskData.description,
							details: initialTaskData.details,
							testStrategy: initialTaskData.testStrategy,
							status: 'pending',
							priority: 'medium',
							dependencies: [],
							subtasks: [],
							customFields: { epic: 'EPIC-UPDATE', component: 'initial' }
						}],
						metadata: {
							created: new Date().toISOString(),
							description: 'Test tasks for master context'
						}
					}
				};
				await fs.writeFile(tasksFilePath, JSON.stringify(resetTasksData, null, 2));

				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				// === MCP PATH ===
				const mcpUpdateResult = await updateTaskByIdDirect(
					{
						tasksJsonPath: tasksFilePath,
						taskId: 1,
						prompt: updatePrompt,
						appendMode: true,
						projectRoot: projectRoot,
						customFields: updateCustomFields
					},
					mcpLog,
					{ session: { id: 'test-session' } }
				);

				const mcpFileContent = await fs.readFile(tasksFilePath, 'utf-8');
				const mcpTasksData = JSON.parse(mcpFileContent);
				const mcpUpdatedTask = mcpTasksData.master.tasks.find(t => t.id === 1);

				// === COMPARISON ===
				expect(cliUpdateResult).toBeDefined();
				expect(mcpUpdateResult.success).toBe(true);

				// Core properties should be identical
				expect(cliUpdatedTask.title).toBe(mcpUpdatedTask.title);
				expect(cliUpdatedTask.status).toBe(mcpUpdatedTask.status);

				// Custom fields should be merged identically
				expect(cliUpdatedTask.customFields).toEqual(mcpUpdatedTask.customFields);
				expect(cliUpdatedTask.customFields.epic).toBe('EPIC-UPDATED');
				expect(cliUpdatedTask.customFields.assignee).toBe('update.user');
				expect(cliUpdatedTask.customFields['priority-level']).toBe('critical');
				expect(cliUpdatedTask.customFields.component).toBe('initial'); // Should be preserved

			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});
	});

	describe('Error Handling - CLI vs MCP Consistency', () => {
		it('should handle invalid custom fields consistently', async () => {
			const taskData = {
				title: 'Task with Invalid Fields',
				description: 'Testing error handling'
			};

			// Custom fields with blocked values
			const invalidCustomFields = {
				password: 'secret123', // blocked field
				epic: 'EPIC-VALID',
				secret: 'topsecret' // another blocked field
			};

			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				// === CLI PATH ===
				let cliError = null;
				try {
					await addTask(
						tasksFilePath,
						'Create task with invalid fields',
						[],
						'medium',
						{
							projectRoot: projectRoot,
							commandName: 'add-task',
							outputType: 'cli'
						},
						'json',
						taskData,
						false,
						null,
						invalidCustomFields
					);
				} catch (error) {
					cliError = error;
				}

				// === MCP PATH ===
				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				let mcpError = null;
				try {
					await addTaskDirect(
						{
							tasksJsonPath: tasksFilePath,
							title: taskData.title,
							description: taskData.description,
							projectRoot: projectRoot,
							customFields: invalidCustomFields
						},
						mcpLog,
						{ session: { id: 'test-session' } }
					);
				} catch (error) {
					mcpError = error;
				}

				// === COMPARISON ===
				// Both paths should handle blocked fields similarly
				// The exact error handling may differ, but behavior should be consistent
				// (Either both throw errors, or both filter out blocked fields)
				
				if (cliError && mcpError) {
					// Both threw errors - check they're similar
					expect(typeof cliError.message).toBe('string');
					expect(typeof mcpError.message).toBe('string');
				} else if (!cliError && !mcpError) {
					// Both succeeded - check blocked fields were filtered consistently
					const cliFileContent = await fs.readFile(tasksFilePath, 'utf-8');
					const tasksData = JSON.parse(cliFileContent);
					
					if (tasksData.master.tasks.length > 0) {
						const task = tasksData.master.tasks[0];
						expect(task.customFields.password).toBeUndefined();
						expect(task.customFields.secret).toBeUndefined();
						expect(task.customFields.epic).toBe('EPIC-VALID'); // valid field should remain
					}
				} else {
					// Inconsistent behavior - one threw error, other didn't
					fail(`Inconsistent error handling: CLI ${cliError ? 'threw' : 'succeeded'}, MCP ${mcpError ? 'threw' : 'succeeded'}`);
				}

			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});

		it('should handle configuration parsing errors consistently', async () => {
			// Create invalid configuration file
			await fs.writeFile(configFilePath, 'invalid json content');

			const taskData = {
				title: 'Task with Invalid Config',
				description: 'Testing config error handling'
			};

			const customFields = {
				epic: 'EPIC-TEST',
				component: 'test'
			};

			const originalConsoleLog = console.log;
			const originalConsoleError = console.error;
			console.log = jest.fn();
			console.error = jest.fn();

			try {
				// === CLI PATH ===
				let cliResult = null;
				let cliError = null;
				try {
					cliResult = await addTask(
						tasksFilePath,
						'Create task with invalid config',
						[],
						'medium',
						{
							projectRoot: projectRoot,
							commandName: 'add-task',
							outputType: 'cli'
						},
						'json',
						taskData,
						false,
						null,
						customFields
					);
				} catch (error) {
					cliError = error;
				}

				// === MCP PATH ===
				const mcpLog = {
					info: jest.fn(),
					warn: jest.fn(),
					error: jest.fn(),
					debug: jest.fn()
				};

				let mcpResult = null;
				let mcpError = null;
				try {
					mcpResult = await addTaskDirect(
						{
							tasksJsonPath: tasksFilePath,
							title: taskData.title,
							description: taskData.description,
							projectRoot: projectRoot,
							customFields: customFields
						},
						mcpLog,
						{ session: { id: 'test-session' } }
					);
				} catch (error) {
					mcpError = error;
				}

				// === COMPARISON ===
				// Both paths should handle config errors gracefully and consistently
				if (cliError && mcpError) {
					// Both paths failed - should be for similar reasons
					expect(cliError.message).toContain('Invalid JSON' || 'config' || 'parse');
					expect(mcpError.message).toContain('Invalid JSON' || 'config' || 'parse');
				} else if (cliResult && mcpResult) {
					// Both paths succeeded - both should have handled the error gracefully
					expect(cliResult.newTaskId).toBeDefined();
					expect(mcpResult.success).toBe(true);
					
					// Check that tasks were created despite config error
					const fileContent = await fs.readFile(tasksFilePath, 'utf-8');
					const tasksData = JSON.parse(fileContent);
					expect(tasksData.master.tasks.length).toBeGreaterThan(0);
				} else {
					// Inconsistent behavior
					fail(`Inconsistent config error handling: CLI ${cliError ? 'failed' : 'succeeded'}, MCP ${mcpError ? 'failed' : 'succeeded'}`);
				}

			} finally {
				console.log = originalConsoleLog;
				console.error = originalConsoleError;
			}
		});
	});
});