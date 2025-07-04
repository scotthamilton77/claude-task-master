/**
 * Integration test for parentTaskId migration through readJSON pipeline
 * 
 * This test focuses on the most critical integration: ensuring that when
 * readJSON processes task data, missing parentTaskId fields are automatically
 * assigned through the backward compatibility system.
 */

import { jest } from '@jest/globals';

describe('Subtask parentTaskId Integration via readJSON', () => {
	let utils;
	let backwardCompatibility;

	beforeEach(async () => {
		jest.clearAllMocks();
		
		// Import modules without complex mocking
		utils = await import('../../scripts/modules/utils.js');
		backwardCompatibility = await import('../../scripts/modules/utils/backwardCompatibility.js');
	});

	describe('Direct backward compatibility testing', () => {
		it('should fix missing parentTaskId in legacy format through ensureTasksBackwardCompatibility', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			
			// Simulate legacy data loaded from JSON with missing parentTaskId
			const legacyTasks = [
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
					id: 5,
					title: 'Task 5',
					subtasks: [
						{ 
							id: 1, 
							title: 'Another Legacy Subtask',
							// Missing parentTaskId
						}
					]
				}
			];

			const result = ensureTasksBackwardCompatibility(legacyTasks);

			// Verify parentTaskId was automatically assigned
			expect(result[0].subtasks[0].parentTaskId).toBe(1); // Auto-assigned
			expect(result[0].subtasks[1].parentTaskId).toBe(1); // Fixed from 999
			expect(result[1].subtasks[0].parentTaskId).toBe(5); // Auto-assigned
			
			// Verify customFields were also added (proving both validators ran)
			expect(result[0].customFields).toBeDefined();
			expect(result[0].subtasks[0].customFields).toBeDefined();
			expect(result[1].subtasks[0].customFields).toBeDefined();
		});

		it('should handle tagged format data with mixed subtask issues', () => {
			const { ensureTagDataBackwardCompatibility } = backwardCompatibility;
			
			const tagData = {
				tasks: [
					{
						id: 10,
						title: 'Tagged Task',
						subtasks: [
							{ id: 1, title: 'Good Subtask', parentTaskId: 10 }, // Correct
							{ id: 2, title: 'Missing Parent' }, // Missing parentTaskId
							{ id: 3, title: 'Wrong Parent', parentTaskId: 999 } // Wrong parentTaskId
						]
					}
				],
				metadata: {
					created: '2023-01-01T00:00:00.000Z'
				}
			};

			const result = ensureTagDataBackwardCompatibility(tagData);

			// Verify all subtasks have correct parentTaskId
			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(10); // Unchanged
			expect(result.tasks[0].subtasks[1].parentTaskId).toBe(10); // Fixed
			expect(result.tasks[0].subtasks[2].parentTaskId).toBe(10); // Fixed
			
			// Verify metadata preserved
			expect(result.metadata).toEqual(tagData.metadata);
		});

		it('should handle edge cases without breaking', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			
			const edgeCaseTasks = [
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
				},
				{
					id: 4,
					title: 'Task with malformed subtasks',
					subtasks: [
						null, // Null subtask
						{ }, // Empty subtask object
						{ id: 1 }, // Subtask missing title
						{ title: 'Subtask missing ID' },
						{
							id: 2,
							title: 'Valid subtask with wrong parent',
							parentTaskId: 999
						}
					]
				}
			];

			const result = ensureTasksBackwardCompatibility(edgeCaseTasks);

			// Should not throw errors and should fix what it can
			expect(result).toHaveLength(4);
			expect(result[0].subtasks).toEqual([]);
			expect(result[1].subtasks).toEqual([]); // null gets converted to [] by customFieldsValidator
			expect(result[2].subtasks).toEqual([]); // undefined gets converted to [] by customFieldsValidator
			
			// The valid subtask should have its parentTaskId fixed
			const validSubtask = result[3].subtasks.find(st => st && st.title === 'Valid subtask with wrong parent');
			expect(validSubtask.parentTaskId).toBe(4); // Fixed from 999
		});

		it('should preserve task and subtask order during migration', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			
			const tasks = [
				{
					id: 10, // Not sequential
					title: 'Task 10',
					subtasks: [
						{ id: 3, title: 'Subtask 10.3' }, // Out of order
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
			];

			const result = ensureTasksBackwardCompatibility(tasks);

			// Task order should be preserved
			expect(result[0].id).toBe(10);
			expect(result[1].id).toBe(5);

			// Subtask order should be preserved
			expect(result[0].subtasks[0].id).toBe(3);
			expect(result[0].subtasks[1].id).toBe(1);
			expect(result[0].subtasks[2].id).toBe(2);

			// All subtasks should have correct parentTaskId
			expect(result[0].subtasks[0].parentTaskId).toBe(10);
			expect(result[0].subtasks[1].parentTaskId).toBe(10);
			expect(result[0].subtasks[2].parentTaskId).toBe(10);
			expect(result[1].subtasks[0].parentTaskId).toBe(5);
		});

		it('should handle large datasets efficiently', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			
			// Create a moderately large dataset (100 tasks, 500 subtasks)
			const tasks = [];
			for (let i = 1; i <= 100; i++) {
				const subtasks = [];
				for (let j = 1; j <= 5; j++) {
					subtasks.push({
						id: j,
						title: `Subtask ${i}.${j}`,
						status: 'pending'
						// Missing parentTaskId for all 500 subtasks
					});
				}
				tasks.push({
					id: i,
					title: `Task ${i}`,
					status: 'pending',
					subtasks: subtasks
				});
			}

			const startTime = Date.now();
			const result = ensureTasksBackwardCompatibility(tasks);
			const endTime = Date.now();

			// Should complete in reasonable time (under 1 second)
			expect(endTime - startTime).toBeLessThan(1000);

			// Verify all parentTaskIds were assigned correctly
			expect(result).toHaveLength(100);
			result.forEach((task, taskIndex) => {
				expect(task.subtasks).toHaveLength(5);
				task.subtasks.forEach((subtask) => {
					expect(subtask.parentTaskId).toBe(taskIndex + 1);
				});
			});
		});
	});

	describe('Integration with data flow', () => {
		it('should demonstrate the full backward compatibility flow', () => {
			const { migrateLegacyFormatWithCustomFields, ensureDataBackwardCompatibility } = backwardCompatibility;
			
			// Step 1: Start with legacy format data (simulating readJSON input)
			const legacyData = {
				tasks: [
					{
						id: 1,
						title: 'Legacy Task',
						subtasks: [
							{ id: 1, title: 'Legacy Subtask' } // Missing parentTaskId and customFields
						]
					}
				]
			};

			// Step 2: Migrate legacy format (simulating what readJSON does)
			const migratedData = migrateLegacyFormatWithCustomFields(legacyData);
			
			// Step 3: Ensure backward compatibility (this is where our fix runs)
			const finalData = ensureDataBackwardCompatibility(migratedData, false);

			// Verify the complete chain worked
			expect(finalData).toHaveProperty('master');
			expect(finalData.master.tasks[0].customFields).toBeDefined();
			expect(finalData.master.tasks[0].subtasks[0].parentTaskId).toBe(1);
			expect(finalData.master.tasks[0].subtasks[0].customFields).toBeDefined();
			expect(finalData.master.metadata).toBeDefined();
		});
	});
});