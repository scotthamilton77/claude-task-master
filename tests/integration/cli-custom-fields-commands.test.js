/**
 * CLI Custom Fields Commands Integration Tests
 * Tests the actual CLI commands with custom fields functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock external dependencies
jest.mock('chalk', () => ({
	red: jest.fn((text) => text),
	blue: jest.fn((text) => text),
	green: jest.fn((text) => text),
	yellow: jest.fn((text) => text),
	white: jest.fn((text) => ({
		bold: jest.fn((text) => text)
	})),
	cyan: jest.fn((text) => text),
	reset: jest.fn(() => '')
}));

jest.mock('boxen', () => jest.fn((text) => text));

jest.mock('../../scripts/modules/ui.js', () => ({
	displayCurrentTagIndicator: jest.fn(),
	getStatusWithColor: jest.fn((status) => status),
	startLoadingIndicator: jest.fn(() => ({ stop: jest.fn() })),
	stopLoadingIndicator: jest.fn(),
	displayAiUsageSummary: jest.fn()
}));

jest.mock('../../scripts/modules/config-manager.js', () => ({
	getDebugFlag: jest.fn(() => false),
	isApiKeySet: jest.fn(() => true),
	getLogLevel: jest.fn(() => 'info')
}));

jest.mock('../../scripts/modules/utils.js', () => ({
	findProjectRoot: jest.fn(),
	getCurrentTag: jest.fn(() => 'master'),
	readJSON: jest.fn(),
	writeJSON: jest.fn(),
	log: jest.fn()
}));

// Mock the actual task management functions
jest.mock('../../scripts/modules/task-manager.js', () => ({
	addTask: jest.fn(),
	addSubtask: jest.fn(),
	updateTaskById: jest.fn(),
	updateSubtaskById: jest.fn()
}));

// Import after mocking
import { addTask, addSubtask, updateTaskById, updateSubtaskById } from '../../scripts/modules/task-manager.js';
import { findProjectRoot } from '../../scripts/modules/utils.js';
import { customFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

describe('CLI Custom Fields Commands Integration', () => {
	let testDir;
	let projectRoot;
	let configFilePath;
	let tasksFilePath;
	let originalConsoleLog;
	let originalConsoleError;
	let originalProcessExit;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-integration-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });

		configFilePath = path.join(taskMasterDir, 'custom-fields.json');
		tasksFilePath = path.join(tasksDir, 'tasks.json');

		// Initialize empty tasks file
		await fs.writeFile(
			tasksFilePath,
			JSON.stringify({
				master: {
					tasks: [],
					metadata: {
						created: new Date().toISOString(),
						description: 'Test tasks for master context'
					}
				}
			}, null, 2)
		);

		// Mock console and process.exit to prevent spam and exits during tests
		originalConsoleLog = console.log;
		originalConsoleError = console.error;
		originalProcessExit = process.exit;
		console.log = jest.fn();
		console.error = jest.fn();
		process.exit = jest.fn();

		// Setup mocks (we need to properly mock findProjectRoot for CLI tests)
		// Since findProjectRoot is not a jest mock, we need to adjust how we mock it 
		// For now, we'll use the real implementation and let it find the test project root

		// Setup successful mock returns
		addTask.mockResolvedValue({ 
			newTaskId: 1, 
			telemetryData: { tokens: 100 } 
		});
		addSubtask.mockResolvedValue({ 
			id: 1, 
			title: 'Test Subtask',
			status: 'pending'
		});
		updateTaskById.mockResolvedValue({
			id: 1,
			title: 'Updated Task',
			status: 'in-progress'
		});
		updateSubtaskById.mockResolvedValue({
			success: true,
			task: { id: 1 },
			subtask: { id: 1 }
		});

		// Clear custom fields config cache
		customFieldsConfig.clearCache();
	});

	afterEach(async () => {
		// Restore console and process.exit
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
		process.exit = originalProcessExit;

		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}

		// Clear mocks
		jest.clearAllMocks();
		customFieldsConfig.clearCache();
	});

	describe('add-task command with custom fields', () => {
		beforeEach(async () => {
			// Create custom fields config
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should pass allow-listed custom fields to addTask function', async () => {
			// Import the command registration function
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			// Create a mock commander program
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			// Register commands to get the action function
			registerCommands(mockProgram);

			// Find the add-task command
			const addTaskCall = mockProgram.command.mock.calls.find(call => call[0] === 'add-task');
			expect(addTaskCall).toBeDefined();

			// Get the action function
			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			expect(actionCall).toBeDefined();
			const actionFunction = actionCall[0];

			// Simulate CLI options with custom fields
			const mockOptions = {
				prompt: 'Create a new authentication system',
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe',
				priority: 'high',
				file: tasksFilePath
			};

			// Execute the action
			await actionFunction(mockOptions);

			// Verify addTask was called with custom fields
			expect(addTask).toHaveBeenCalledWith(
				tasksFilePath,
				'Create a new authentication system',
				[], // dependencies
				'high', // priority
				{
					projectRoot: projectRoot,
					tag: 'master',
					commandName: 'add-task',
					outputType: 'cli'
				},
				'text', // outputFormat
				undefined, // manualTaskData
				undefined, // useResearch
				'master', // tag
				{
					epic: 'EPIC-1234',
					component: 'auth',
					assignee: 'john.doe'
				} // customFields
			);
		});

		it('should pass ad-hoc custom fields to addTask function', async () => {
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			const actionFunction = actionCall[0];

			// Simulate CLI options with ad-hoc custom fields
			const mockOptions = {
				prompt: 'Create a new feature',
				'custom:priority-level': 'P1',
				'custom:reviewer': 'jane.doe',
				'custom:estimate': '4h',
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			expect(addTask).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(String),
				expect.any(Array),
				expect.any(String),
				expect.any(Object),
				expect.any(String),
				expect.anything(),
				expect.anything(),
				expect.any(String),
				{
					'priority-level': 'P1',
					'reviewer': 'jane.doe',
					'estimate': '4h'
				}
			);
		});

		it('should handle mixed allow-listed and ad-hoc custom fields', async () => {
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				prompt: 'Create a comprehensive feature',
				epic: 'EPIC-1234', // allow-listed
				component: 'ui', // allow-listed
				'custom:priority-level': 'P1', // ad-hoc
				'custom:reviewer': 'jane.doe', // ad-hoc
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			expect(addTask).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(String),
				expect.any(Array),
				expect.any(String),
				expect.any(Object),
				expect.any(String),
				expect.anything(),
				expect.anything(),
				expect.any(String),
				{
					epic: 'EPIC-1234',
					component: 'ui',
					'priority-level': 'P1',
					'reviewer': 'jane.doe'
				}
			);
		});
	});

	describe('add-subtask command with custom fields', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['assignee', 'estimate', 'difficulty'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should pass custom fields to addSubtask function', async () => {
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-subtask';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				parent: '1',
				title: 'New subtask',
				description: 'Subtask description',
				assignee: 'john.doe',
				estimate: '2h',
				'custom:priority': 'urgent',
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			expect(addSubtask).toHaveBeenCalledWith(
				tasksFilePath,
				1, // parentId
				null, // existingTaskId
				{
					title: 'New subtask',
					description: 'Subtask description',
					details: '',
					status: 'pending',
					dependencies: []
				},
				true, // generateFiles
				{ projectRoot: projectRoot, tag: 'master' },
				{
					assignee: 'john.doe',
					estimate: '2h',
					priority: 'urgent'
				}
			);
		});
	});

	describe('update-task command with custom fields', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'status-notes'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should pass custom fields to updateTaskById function', async () => {
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'update-task';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				id: '1',
				prompt: 'Update task with new information',
				epic: 'EPIC-5678',
				'custom:blockers': 'waiting for API',
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			expect(updateTaskById).toHaveBeenCalledWith(
				tasksFilePath,
				1, // taskId
				'Update task with new information',
				false, // useResearch
				{ 
					projectRoot: projectRoot, 
					tag: 'master',
					customFields: {
						epic: 'EPIC-5678',
						blockers: 'waiting for API'
					}
				},
				'text',
				false // appendMode
			);
		});
	});

	describe('update-subtask command with custom fields', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['assignee', 'estimate'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should pass custom fields to updateSubtaskById function', async () => {
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'update-subtask';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				id: '1.2',
				prompt: 'Update subtask with progress',
				assignee: 'jane.doe',
				'custom:blockers': 'dependencies not ready',
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			expect(updateSubtaskById).toHaveBeenCalledWith(
				tasksFilePath,
				1, // parentTaskId
				2, // subtaskId
				'Update subtask with progress',
				false, // useResearch
				{ projectRoot: projectRoot, tag: 'master' },
				'text',
				{
					assignee: 'jane.doe',
					blockers: 'dependencies not ready'
				}
			);
		});
	});

	describe('Error handling with custom fields', () => {
		it('should handle blocked fields gracefully', async () => {
			// Create config with blocked fields
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				prompt: 'Create a task',
				'custom:password': 'secret123', // blocked field
				file: tasksFilePath
			};

			// Should throw error for blocked field
			await expect(actionFunction(mockOptions)).rejects.toThrow(
				"Custom field 'password' is blocked by project configuration"
			);

			// addTask should not be called
			expect(addTask).not.toHaveBeenCalled();
		});

		it('should handle missing configuration gracefully', async () => {
			// Don't create config file - should use defaults
			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				prompt: 'Create a task',
				'custom:some-field': 'some-value', // Should be ignored (allowAdhoc defaults to false)
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			// Should call addTask with empty custom fields
			expect(addTask).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(String),
				expect.any(Array),
				expect.any(String),
				expect.any(Object),
				expect.any(String),
				expect.anything(),
				expect.anything(),
				expect.any(String),
				{} // empty custom fields
			);
		});
	});

	describe('Configuration loading during CLI execution', () => {
		it('should log custom fields when they are provided', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const { registerCommands } = await import('../../scripts/modules/commands.js');
			
			const mockProgram = {
				commands: [],
				command: jest.fn().mockReturnThis(),
				description: jest.fn().mockReturnThis(),
				option: jest.fn().mockReturnThis(),
				addHelpText: jest.fn().mockReturnThis(),
				action: jest.fn()
			};

			registerCommands(mockProgram);

			const actionCall = mockProgram.action.mock.calls.find((_, index) => {
				const commandCall = mockProgram.command.mock.calls[index];
				return commandCall && commandCall[0] === 'add-task';
			});
			const actionFunction = actionCall[0];

			const mockOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				file: tasksFilePath
			};

			await actionFunction(mockOptions);

			// Should have logged custom fields
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining('Custom fields: {"epic":"EPIC-1234"}')
			);
		});
	});
});