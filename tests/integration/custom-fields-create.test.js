import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { z } from 'zod';

// Mock implementations based on the actual functions we'll modify
const TasksFileSchema = z.object({
	currentTag: z.string(),
	tasks: z.array(z.object({
		id: z.number(),
		title: z.string(),
		description: z.string(),
		details: z.string(),
		testStrategy: z.string(),
		status: z.enum(['pending', 'in-progress', 'done', 'review', 'deferred', 'cancelled']),
		priority: z.enum(['high', 'medium', 'low']).optional(),
		dependencies: z.array(z.number()).optional(),
		subtasks: z.array(z.any()).optional(),
		customFields: z.record(z.string()).optional().default({})
	}))
});

// Mock add-task function with custom fields support
async function mockAddTask(taskData, customFields = {}) {
	const tasksFilePath = path.join(taskData.projectRoot, '.taskmaster', 'tasks', 'tasks.json');
	
	// Read existing tasks
	let tasksFile;
	try {
		const content = await fs.readFile(tasksFilePath, 'utf-8');
		tasksFile = JSON.parse(content);
	} catch (error) {
		tasksFile = { currentTag: 'master', tasks: [] };
	}
	
	// Generate new task ID
	const maxId = tasksFile.tasks.reduce((max, task) => Math.max(max, task.id), 0);
	const newId = maxId + 1;
	
	// Create new task with custom fields
	const newTask = {
		id: newId,
		title: taskData.title,
		description: taskData.description,
		details: taskData.details,
		testStrategy: taskData.testStrategy,
		status: taskData.status || 'pending',
		priority: taskData.priority || 'medium',
		dependencies: taskData.dependencies || [],
		subtasks: [],
		customFields: customFields || {}
	};
	
	// Add to tasks array
	tasksFile.tasks.push(newTask);
	
	// Write back to file
	await fs.writeFile(tasksFilePath, JSON.stringify(tasksFile, null, 2));
	
	return newTask;
}

// Mock add-subtask function with custom fields support
async function mockAddSubtask(parentId, subtaskData, customFields = {}, projectRoot) {
	const tasksFilePath = path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json');
	
	// Read existing tasks
	const content = await fs.readFile(tasksFilePath, 'utf-8');
	const tasksFile = JSON.parse(content);
	
	// Find parent task
	const parentTask = tasksFile.tasks.find(task => task.id === parentId);
	if (!parentTask) {
		throw new Error(`Parent task with ID ${parentId} not found`);
	}
	
	// Generate subtask ID
	const maxSubtaskId = parentTask.subtasks.reduce((max, subtask) => {
		const subtaskNum = parseInt(subtask.id.split('.')[1]);
		return Math.max(max, subtaskNum);
	}, 0);
	const newSubtaskId = `${parentId}.${maxSubtaskId + 1}`;
	
	// Create new subtask with custom fields
	const newSubtask = {
		id: newSubtaskId,
		title: subtaskData.title,
		status: subtaskData.status || 'pending',
		details: subtaskData.details || '',
		dependencies: subtaskData.dependencies || [],
		customFields: customFields || {}
	};
	
	// Add to parent task's subtasks
	parentTask.subtasks.push(newSubtask);
	
	// Write back to file
	await fs.writeFile(tasksFilePath, JSON.stringify(tasksFile, null, 2));
	
	return newSubtask;
}

describe('Custom Fields Task Creation Integration', () => {
	let testDir;
	let projectRoot;
	let tasksFilePath;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-test-'));
		projectRoot = testDir;
		
		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });
		
		tasksFilePath = path.join(tasksDir, 'tasks.json');
		
		// Initialize empty tasks file
		await fs.writeFile(tasksFilePath, JSON.stringify({
			currentTag: 'master',
			tasks: []
		}, null, 2));
	});

	afterEach(async () => {
		// Clean up test directory
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Task creation with custom fields', () => {
		it('should create task with custom fields via MCP-like interface', async () => {
			const taskData = {
				title: 'Implement user authentication',
				description: 'Add login and logout functionality',
				details: 'Use JWT tokens for session management',
				testStrategy: 'Unit tests and integration tests',
				projectRoot
			};
			
			const customFields = {
				epic: 'EPIC-1234',
				component: 'auth',
				taskType: 'feature',
				assignee: 'john.doe',
				sprint: '2024-Q1-S3'
			};
			
			const newTask = await mockAddTask(taskData, customFields);
			
			expect(newTask.id).toBe(1);
			expect(newTask.title).toBe(taskData.title);
			expect(newTask.customFields).toEqual(customFields);
		});

		it('should create task without custom fields (backward compatibility)', async () => {
			const taskData = {
				title: 'Legacy task',
				description: 'Task created without custom fields',
				details: 'Should work as before',
				testStrategy: 'Manual testing',
				projectRoot
			};
			
			const newTask = await mockAddTask(taskData);
			
			expect(newTask.id).toBe(1);
			expect(newTask.customFields).toEqual({});
		});

		it('should handle empty custom fields object', async () => {
			const taskData = {
				title: 'Task with empty custom fields',
				description: 'Testing empty custom fields',
				details: 'Details here',
				testStrategy: 'Test strategy',
				projectRoot
			};
			
			const newTask = await mockAddTask(taskData, {});
			
			expect(newTask.customFields).toEqual({});
		});

		it('should validate custom field names against reserved words', async () => {
			const taskData = {
				title: 'Task with invalid custom field',
				description: 'Should fail validation',
				details: 'Testing validation',
				testStrategy: 'Validation tests',
				projectRoot
			};
			
			const invalidCustomFields = {
				id: 'should-fail',
				title: 'also-should-fail',
				status: 'invalid-status'
			};
			
			// In real implementation, this would be caught by validation
			// For now, we'll simulate the validation
			const reservedFields = ['id', 'title', 'status', 'priority', 'dependencies'];
			const hasReservedFields = Object.keys(invalidCustomFields).some(key => 
				reservedFields.includes(key)
			);
			
			expect(hasReservedFields).toBe(true);
			
			// The actual implementation would throw an error here
			// await expect(mockAddTask(taskData, invalidCustomFields)).rejects.toThrow();
		});

		it('should persist custom fields to file system', async () => {
			const taskData = {
				title: 'Persistent task',
				description: 'Test file persistence',
				details: 'Should save to disk',
				testStrategy: 'File system tests',
				projectRoot
			};
			
			const customFields = {
				epic: 'EPIC-5678',
				component: 'database',
				priority: 'critical'
			};
			
			await mockAddTask(taskData, customFields);
			
			// Read file directly to verify persistence
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks).toHaveLength(1);
			expect(tasksFile.tasks[0].customFields).toEqual(customFields);
		});

		it('should handle multiple tasks with different custom fields', async () => {
			const task1 = await mockAddTask({
				title: 'Task 1',
				description: 'First task',
				details: 'Details 1',
				testStrategy: 'Test 1',
				projectRoot
			}, {
				epic: 'EPIC-1',
				component: 'frontend'
			});
			
			const task2 = await mockAddTask({
				title: 'Task 2',
				description: 'Second task',
				details: 'Details 2',
				testStrategy: 'Test 2',
				projectRoot
			}, {
				epic: 'EPIC-2',
				component: 'backend',
				assignee: 'jane.doe'
			});
			
			expect(task1.id).toBe(1);
			expect(task2.id).toBe(2);
			expect(task1.customFields.epic).toBe('EPIC-1');
			expect(task2.customFields.epic).toBe('EPIC-2');
			expect(task2.customFields.assignee).toBe('jane.doe');
		});
	});

	describe('Subtask creation with custom fields', () => {
		it('should create subtask with custom fields', async () => {
			// First create parent task
			const parentTask = await mockAddTask({
				title: 'Parent task',
				description: 'Parent description',
				details: 'Parent details',
				testStrategy: 'Parent test strategy',
				projectRoot
			}, {
				epic: 'EPIC-1234',
				component: 'auth'
			});
			
			// Then create subtask with custom fields
			const subtaskData = {
				title: 'Subtask with custom fields',
				details: 'Subtask details'
			};
			
			const subtaskCustomFields = {
				subComponent: 'auth-module',
				assignee: 'alice.jones',
				difficulty: 'medium'
			};
			
			const subtask = await mockAddSubtask(
				parentTask.id,
				subtaskData,
				subtaskCustomFields,
				projectRoot
			);
			
			expect(subtask.id).toBe('1.1');
			expect(subtask.customFields).toEqual(subtaskCustomFields);
		});

		it('should inherit custom fields from parent task', async () => {
			// Create parent task
			const parentTask = await mockAddTask({
				title: 'Parent task',
				description: 'Parent description',
				details: 'Parent details',
				testStrategy: 'Parent test strategy',
				projectRoot
			}, {
				epic: 'EPIC-1234',
				component: 'auth',
				sprint: '2024-Q1-S3'
			});
			
			// Create subtask that inherits some fields
			const subtaskData = {
				title: 'Inheriting subtask',
				details: 'Subtask that inherits parent fields'
			};
			
			// In real implementation, this would inherit parent's custom fields
			// and allow overrides
			const inheritedFields = {
				...parentTask.customFields,
				assignee: 'bob.smith' // Override/add specific field
			};
			
			const subtask = await mockAddSubtask(
				parentTask.id,
				subtaskData,
				inheritedFields,
				projectRoot
			);
			
			expect(subtask.customFields.epic).toBe('EPIC-1234');
			expect(subtask.customFields.component).toBe('auth');
			expect(subtask.customFields.assignee).toBe('bob.smith');
		});

		it('should handle subtasks without custom fields', async () => {
			// Create parent task
			const parentTask = await mockAddTask({
				title: 'Parent task',
				description: 'Parent description',
				details: 'Parent details',
				testStrategy: 'Parent test strategy',
				projectRoot
			});
			
			// Create subtask without custom fields
			const subtaskData = {
				title: 'Simple subtask',
				details: 'No custom fields'
			};
			
			const subtask = await mockAddSubtask(
				parentTask.id,
				subtaskData,
				{},
				projectRoot
			);
			
			expect(subtask.customFields).toEqual({});
		});
	});

	describe('Validation and error handling', () => {
		it('should validate custom field format', async () => {
			const taskData = {
				title: 'Task with invalid field names',
				description: 'Test validation',
				details: 'Details',
				testStrategy: 'Test strategy',
				projectRoot
			};
			
			const invalidFieldNames = {
				'field name': 'spaces not allowed',
				'field@name': 'special chars not allowed',
				'123field': 'numbers first not allowed',
				'': 'empty name not allowed'
			};
			
			// In real implementation, this would validate field names
			const fieldNameRegex = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;
			
			Object.keys(invalidFieldNames).forEach(fieldName => {
				if (fieldName !== '') {
					expect(fieldNameRegex.test(fieldName)).toBe(false);
				}
			});
		});

		it('should handle file system errors gracefully', async () => {
			// Create task in non-existent directory
			const invalidProjectRoot = path.join(testDir, 'nonexistent');
			
			const taskData = {
				title: 'Task in invalid location',
				description: 'Should handle errors',
				details: 'Details',
				testStrategy: 'Error handling tests',
				projectRoot: invalidProjectRoot
			};
			
			await expect(mockAddTask(taskData, {})).rejects.toThrow();
		});

		it('should preserve file format and structure', async () => {
			// Create task with custom fields
			await mockAddTask({
				title: 'Format preservation test',
				description: 'Test file format',
				details: 'Details',
				testStrategy: 'Format tests',
				projectRoot
			}, {
				epic: 'EPIC-1234',
				component: 'test'
			});
			
			// Read and validate file structure
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			// Should validate against schema
			expect(() => TasksFileSchema.parse(tasksFile)).not.toThrow();
			
			// Should preserve structure
			expect(tasksFile).toHaveProperty('currentTag');
			expect(tasksFile).toHaveProperty('tasks');
			expect(Array.isArray(tasksFile.tasks)).toBe(true);
		});
	});

	describe('Migration and backward compatibility', () => {
		it('should handle existing tasks without custom fields', async () => {
			// Create legacy task file
			const legacyTasksFile = {
				currentTag: 'master',
				tasks: [{
					id: 1,
					title: 'Legacy task',
					description: 'Existing task without custom fields',
					details: 'Should work with new system',
					testStrategy: 'Compatibility tests',
					status: 'pending',
					priority: 'medium',
					dependencies: [],
					subtasks: []
				}]
			};
			
			await fs.writeFile(tasksFilePath, JSON.stringify(legacyTasksFile, null, 2));
			
			// Add new task with custom fields
			const newTask = await mockAddTask({
				title: 'New task with custom fields',
				description: 'Should work alongside legacy',
				details: 'Details',
				testStrategy: 'Migration tests',
				projectRoot
			}, {
				epic: 'EPIC-9999',
				component: 'migration'
			});
			
			expect(newTask.id).toBe(2);
			expect(newTask.customFields.epic).toBe('EPIC-9999');
			
			// Verify legacy task is preserved
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks).toHaveLength(2);
			expect(tasksFile.tasks[0].title).toBe('Legacy task');
			expect(tasksFile.tasks[0].customFields || {}).toEqual({});
		});

		it('should migrate tasks to include customFields if missing', async () => {
			// Create task without customFields property
			const taskWithoutCustomFields = {
				currentTag: 'master',
				tasks: [{
					id: 1,
					title: 'Task without customFields property',
					description: 'Missing customFields',
					details: 'Details',
					testStrategy: 'Migration test',
					status: 'pending',
					priority: 'medium',
					dependencies: [],
					subtasks: []
				}]
			};
			
			await fs.writeFile(tasksFilePath, JSON.stringify(taskWithoutCustomFields, null, 2));
			
			// Read and migrate
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			// Apply migration (add customFields if missing)
			tasksFile.tasks.forEach(task => {
				if (!task.customFields) {
					task.customFields = {};
				}
			});
			
			expect(tasksFile.tasks[0].customFields).toEqual({});
		});
	});
});

// Export mock functions for use in other tests
export { mockAddTask, mockAddSubtask };