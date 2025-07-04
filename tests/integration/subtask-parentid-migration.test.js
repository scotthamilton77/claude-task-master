/**
 * Integration tests for parentTaskId migration through the data loading pipeline
 * Tests the full flow from readJSON through backward compatibility to final result
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');

// Mock config manager to prevent circular dependencies
jest.mock('../../scripts/modules/config-manager.js', () => ({
	getDebugFlag: jest.fn(() => false),
	getLogLevel: jest.fn(() => 'info')
}));

// Mock git utils
jest.mock('../../scripts/modules/utils/git-utils.js', () => ({
	checkAndAutoSwitchGitTagSync: jest.fn()
}));

describe('Subtask parentTaskId Migration Integration', () => {
	let utils;
	const mockProjectRoot = '/test/project';
	const mockTasksJsonPath = '/test/project/.taskmaster/tasks/tasks.json';

	beforeEach(async () => {
		jest.clearAllMocks();
		
		// Setup mocks
		if (path.join && typeof path.join.mockImplementation === 'function') {
			path.join.mockImplementation((...args) => args.join('/'));
			path.dirname.mockImplementation((filePath) => filePath.split('/').slice(0, -1).join('/'));
			path.resolve.mockImplementation((...paths) => paths.join('/'));
		}

		// Import utils after mocks are set up
		utils = await import('../../scripts/modules/utils.js');
	});

	describe('Legacy format migration with missing parentTaskId', () => {
		it('should automatically assign parentTaskId when migrating legacy format', () => {
			const legacyData = {
				tasks: [
					{
						id: 1,
						title: 'Task 1',
						status: 'pending',
						subtasks: [
							{ 
								id: 1, 
								title: 'Legacy Subtask 1', 
								status: 'pending'
								// Missing parentTaskId - should be auto-assigned
							},
							{ 
								id: 2, 
								title: 'Legacy Subtask 2', 
								status: 'done',
								parentTaskId: 999 // Wrong parentTaskId - should be fixed
							}
						]
					},
					{
						id: 2,
						title: 'Task 2',
						status: 'done'
						// No subtasks
					}
				]
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(legacyData));
			fs.writeFileSync.mockImplementation(() => {}); // Mock the migration write
			fs.existsSync.mockReturnValue(false); // No existing state/config files

			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);

			// Should be migrated to tagged format
			expect(result).toHaveProperty('tag', 'master');
			expect(result).toHaveProperty('tasks');
			expect(result.tasks).toHaveLength(2);

			// Check that parentTaskId was automatically assigned
			const task1 = result.tasks[0];
			expect(task1.subtasks).toHaveLength(2);
			expect(task1.subtasks[0].parentTaskId).toBe(1); // Auto-assigned
			expect(task1.subtasks[1].parentTaskId).toBe(1); // Fixed from 999
			
			// Check that customFields were added
			expect(task1.customFields).toBeDefined();
			expect(task1.subtasks[0].customFields).toBeDefined();
			expect(task1.subtasks[1].customFields).toBeDefined();
		});
	});

	describe('Tagged format with missing parentTaskId', () => {
		it('should fix missing parentTaskId in existing tagged format', () => {
			const taggedData = {
				master: {
					tasks: [
						{
							id: 5,
							title: 'Master Task',
							status: 'in-progress',
							subtasks: [
								{ 
									id: 1, 
									title: 'Missing Parent ID', 
									status: 'pending'
									// Missing parentTaskId
								},
								{ 
									id: 2, 
									title: 'Wrong Parent ID', 
									status: 'pending',
									parentTaskId: 10 // Wrong value
								},
								{ 
									id: 3, 
									title: 'Correct Parent ID', 
									status: 'done',
									parentTaskId: 5 // Correct value
								}
							]
						}
					],
					metadata: {
						created: '2023-01-01T00:00:00.000Z',
						description: 'Test tasks'
					}
				},
				dev: {
					tasks: [
						{
							id: 10,
							title: 'Dev Task',
							subtasks: [
								{ 
									id: 1, 
									title: 'Dev Subtask', 
									// Missing parentTaskId
								}
							]
						}
					]
				}
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(taggedData));
			fs.existsSync.mockReturnValue(false);

			// Test master tag
			const masterResult = utils.readJSON(mockTasksJsonPath, mockProjectRoot, 'master');
			expect(masterResult.tag).toBe('master');
			expect(masterResult.tasks[0].subtasks[0].parentTaskId).toBe(5); // Fixed
			expect(masterResult.tasks[0].subtasks[1].parentTaskId).toBe(5); // Fixed
			expect(masterResult.tasks[0].subtasks[2].parentTaskId).toBe(5); // Unchanged

			// Test dev tag
			const devResult = utils.readJSON(mockTasksJsonPath, mockProjectRoot, 'dev');
			expect(devResult.tag).toBe('dev');
			expect(devResult.tasks[0].subtasks[0].parentTaskId).toBe(10); // Fixed
		});
	});

	describe('Edge cases and error conditions', () => {
		it('should handle tasks with empty subtasks array', () => {
			const data = {
				master: {
					tasks: [
						{
							id: 1,
							title: 'Task with empty subtasks',
							subtasks: []
						},
						{
							id: 2,
							title: 'Task with null subtasks',
							subtasks: null
						},
						{
							id: 3,
							title: 'Task without subtasks property'
						}
					]
				}
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(data));
			fs.existsSync.mockReturnValue(false);

			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);

			expect(result.tasks).toHaveLength(3);
			expect(result.tasks[0].subtasks).toEqual([]);
			expect(result.tasks[1].subtasks).toBeNull();
			expect(result.tasks[2].subtasks).toBeUndefined();
		});

		it('should handle malformed subtask data gracefully', () => {
			const data = {
				master: {
					tasks: [
						{
							id: 1,
							title: 'Task with malformed subtasks',
							subtasks: [
								null, // Null subtask
								undefined, // Undefined subtask
								{ }, // Empty subtask object
								{ id: 1 }, // Subtask missing title
								{ title: 'Subtask missing ID' },
								'not an object', // Invalid type
								{
									id: 2,
									title: 'Valid subtask',
									parentTaskId: 999 // Wrong parentTaskId, should be fixed
								}
							]
						}
					]
				}
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(data));
			fs.existsSync.mockReturnValue(false);

			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].subtasks).toHaveLength(7);
			
			// The valid subtask should have its parentTaskId fixed
			const validSubtask = result.tasks[0].subtasks.find(st => st && st.title === 'Valid subtask');
			expect(validSubtask).toBeDefined();
			expect(validSubtask.parentTaskId).toBe(1); // Fixed from 999
		});

		it('should handle deeply nested task structures', () => {
			const data = {
				master: {
					tasks: [
						{
							id: 1,
							title: 'Parent Task',
							subtasks: [
								{
									id: 1,
									title: 'Subtask with many properties',
									description: 'Complex subtask',
									details: 'Implementation details',
									status: 'in-progress',
									dependencies: [2],
									customFields: { priority: 'high', team: 'backend' },
									// Missing parentTaskId despite having other fields
								}
							]
						}
					]
				}
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(data));
			fs.existsSync.mockReturnValue(false);

			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);

			const subtask = result.tasks[0].subtasks[0];
			expect(subtask.parentTaskId).toBe(1); // Auto-assigned
			expect(subtask.customFields.priority).toBe('high'); // Preserved
			expect(subtask.customFields.team).toBe('backend'); // Preserved
			expect(subtask.dependencies).toEqual([2]); // Preserved
		});

		it('should preserve task order and IDs during migration', () => {
			const data = {
				tasks: [
					{
						id: 10,
						title: 'Task 10',
						subtasks: [
							{ id: 3, title: 'Subtask 10.3' },
							{ id: 1, title: 'Subtask 10.1' },
							{ id: 2, title: 'Subtask 10.2' }
						]
					},
					{
						id: 5,
						title: 'Task 5',
						subtasks: [
							{ id: 1, title: 'Subtask 5.1' }
						]
					}
				]
			};

			fs.readFileSync.mockReturnValue(JSON.stringify(data));
			fs.writeFileSync.mockImplementation(() => {});
			fs.existsSync.mockReturnValue(false);

			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);

			// Task order should be preserved
			expect(result.tasks[0].id).toBe(10);
			expect(result.tasks[1].id).toBe(5);

			// Subtask order should be preserved
			expect(result.tasks[0].subtasks[0].id).toBe(3);
			expect(result.tasks[0].subtasks[1].id).toBe(1);
			expect(result.tasks[0].subtasks[2].id).toBe(2);

			// All subtasks should have correct parentTaskId
			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(10);
			expect(result.tasks[0].subtasks[1].parentTaskId).toBe(10);
			expect(result.tasks[0].subtasks[2].parentTaskId).toBe(10);
			expect(result.tasks[1].subtasks[0].parentTaskId).toBe(5);
		});
	});

	describe('Performance considerations', () => {
		it('should handle large datasets efficiently', () => {
			// Create a large dataset
			const tasks = [];
			for (let i = 1; i <= 100; i++) {
				const subtasks = [];
				for (let j = 1; j <= 10; j++) {
					subtasks.push({
						id: j,
						title: `Subtask ${i}.${j}`,
						status: 'pending'
						// Missing parentTaskId for all 1000 subtasks
					});
				}
				tasks.push({
					id: i,
					title: `Task ${i}`,
					status: 'pending',
					subtasks: subtasks
				});
			}

			const data = { master: { tasks } };
			fs.readFileSync.mockReturnValue(JSON.stringify(data));
			fs.existsSync.mockReturnValue(false);

			const startTime = Date.now();
			const result = utils.readJSON(mockTasksJsonPath, mockProjectRoot);
			const endTime = Date.now();

			// Should complete in reasonable time (under 1 second for this size)
			expect(endTime - startTime).toBeLessThan(1000);

			// Verify all parentTaskIds were assigned correctly
			expect(result.tasks).toHaveLength(100);
			result.tasks.forEach((task, taskIndex) => {
				expect(task.subtasks).toHaveLength(10);
				task.subtasks.forEach((subtask) => {
					expect(subtask.parentTaskId).toBe(taskIndex + 1);
				});
			});
		});
	});
});