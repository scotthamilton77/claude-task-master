import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock update functions for custom fields
async function mockSetCustomFields(taskId, customFields, operation = 'set', projectRoot) {
	const tasksFilePath = path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json');
	const content = await fs.readFile(tasksFilePath, 'utf-8');
	const tasksFile = JSON.parse(content);
	
	// Find task or subtask
	let targetItem = null;
	let isSubtask = false;
	
	if (taskId.includes('.')) {
		// Subtask
		const [parentId, subtaskId] = taskId.split('.');
		const parentTask = tasksFile.tasks.find(t => t.id === parseInt(parentId));
		if (parentTask && parentTask.subtasks) {
			targetItem = parentTask.subtasks.find(s => s.id === taskId);
			isSubtask = true;
		}
	} else {
		// Task
		targetItem = tasksFile.tasks.find(t => t.id === parseInt(taskId));
	}
	
	if (!targetItem) {
		throw new Error(`Task ${taskId} not found`);
	}
	
	// Initialize customFields if not present
	if (!targetItem.customFields) {
		targetItem.customFields = {};
	}
	
	// Apply operation
	switch (operation) {
		case 'set':
			targetItem.customFields = { ...customFields };
			break;
		case 'merge':
			targetItem.customFields = { ...targetItem.customFields, ...customFields };
			break;
		case 'unset':
			Object.keys(customFields).forEach(key => {
				delete targetItem.customFields[key];
			});
			break;
	}
	
	await fs.writeFile(tasksFilePath, JSON.stringify(tasksFile, null, 2));
	return targetItem;
}

describe('Custom Fields Update Integration', () => {
	let testDir;
	let projectRoot;
	let tasksFilePath;

	beforeEach(async () => {
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-test-'));
		projectRoot = testDir;
		
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });
		
		tasksFilePath = path.join(tasksDir, 'tasks.json');
		
		// Create sample tasks
		const sampleData = {
			currentTag: 'master',
			tasks: [
				{
					id: 1,
					title: 'Task 1',
					description: 'Description 1',
					details: 'Details 1',
					testStrategy: 'Test 1',
					status: 'pending',
					subtasks: [
						{
							id: '1.1',
							title: 'Subtask 1.1',
							status: 'pending',
							customFields: { assignee: 'alice' }
						}
					],
					customFields: {
						epic: 'EPIC-1234',
						component: 'auth'
					}
				}
			]
		};
		
		await fs.writeFile(tasksFilePath, JSON.stringify(sampleData, null, 2));
	});

	afterEach(async () => {
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Set custom fields operations', () => {
		it('should set custom fields on task', async () => {
			const newFields = {
				assignee: 'john.doe',
				sprint: '2024-Q1-S3'
			};
			
			await mockSetCustomFields('1', newFields, 'set', projectRoot);
			
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks[0].customFields).toEqual(newFields);
		});

		it('should merge custom fields on task', async () => {
			const additionalFields = {
				assignee: 'john.doe',
				sprint: '2024-Q1-S3'
			};
			
			await mockSetCustomFields('1', additionalFields, 'merge', projectRoot);
			
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks[0].customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe',
				sprint: '2024-Q1-S3'
			});
		});

		it('should unset custom fields on task', async () => {
			await mockSetCustomFields('1', { epic: '', component: '' }, 'unset', projectRoot);
			
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks[0].customFields).toEqual({});
		});
	});

	describe('Subtask custom field operations', () => {
		it('should update subtask custom fields', async () => {
			const newFields = { component: 'auth-module' };
			
			await mockSetCustomFields('1.1', newFields, 'merge', projectRoot);
			
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksFile = JSON.parse(content);
			
			expect(tasksFile.tasks[0].subtasks[0].customFields).toEqual({
				assignee: 'alice',
				component: 'auth-module'
			});
		});
	});
});

export { mockSetCustomFields };