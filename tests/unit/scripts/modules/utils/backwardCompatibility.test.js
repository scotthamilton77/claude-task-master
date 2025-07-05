/**
 * backwardCompatibility.js integration tests
 *
 * These tests focus on functional behavior rather than mocking internals
 * to avoid complex module mocking issues while still verifying functionality.
 */

import { jest } from '@jest/globals';

describe('backwardCompatibility', () => {
	let backwardCompatibility;

	beforeEach(async () => {
		jest.clearAllMocks();

		// Import modules
		backwardCompatibility = await import(
			'../../../../../scripts/modules/utils/backwardCompatibility.js'
		);
	});

	describe('ensureTasksBackwardCompatibility', () => {
		it('should ensure both customFields and parentTaskId are present', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1' } // Missing both customFields and parentTaskId
					]
				}
			];

			const result = ensureTasksBackwardCompatibility(tasks);

			// Verify both validators worked
			expect(result[0].customFields).toBeDefined();
			expect(result[0].subtasks[0].customFields).toBeDefined();
			expect(result[0].subtasks[0].parentTaskId).toBe(1);
		});

		it('should handle empty arrays', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;

			const result = ensureTasksBackwardCompatibility([]);

			expect(result).toEqual([]);
		});

		it('should handle tasks without subtasks', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			const tasks = [
				{ id: 1, title: 'Task 1' },
				{ id: 2, title: 'Task 2', subtasks: [] }
			];

			const result = ensureTasksBackwardCompatibility(tasks);

			// Both tasks should have customFields added
			expect(result[0].customFields).toBeDefined();
			expect(result[1].customFields).toBeDefined();
			expect(result[1].subtasks).toEqual([]);
		});

		it('should fix incorrect parentTaskId values', () => {
			const { ensureTasksBackwardCompatibility } = backwardCompatibility;
			const tasks = [
				{
					id: 5,
					title: 'Task 5',
					subtasks: [
						{
							id: 1,
							title: 'Subtask with wrong parentTaskId',
							parentTaskId: 999
						}
					]
				}
			];

			const result = ensureTasksBackwardCompatibility(tasks);

			expect(result[0].subtasks[0].parentTaskId).toBe(5); // Fixed from 999
		});
	});

	describe('ensureTagDataBackwardCompatibility', () => {
		it('should apply backward compatibility to tag data', () => {
			const { ensureTagDataBackwardCompatibility } = backwardCompatibility;
			const tagData = {
				tasks: [
					{
						id: 1,
						title: 'Task 1',
						subtasks: [{ id: 1, title: 'Subtask 1.1' }]
					}
				],
				metadata: {
					created: '2023-01-01T00:00:00.000Z'
				}
			};

			const result = ensureTagDataBackwardCompatibility(tagData);

			expect(result.tasks[0].customFields).toBeDefined();
			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(1);
			expect(result.metadata).toEqual(tagData.metadata);
		});

		it('should handle tagData without tasks', () => {
			const { ensureTagDataBackwardCompatibility } = backwardCompatibility;
			const tagData = { metadata: { created: '2023-01-01' } };

			const result = ensureTagDataBackwardCompatibility(tagData);

			expect(result).toEqual(tagData);
		});

		it('should handle null/undefined tagData', () => {
			const { ensureTagDataBackwardCompatibility } = backwardCompatibility;

			expect(ensureTagDataBackwardCompatibility(null)).toBeNull();
			expect(ensureTagDataBackwardCompatibility(undefined)).toBeUndefined();
		});
	});

	describe('migrateLegacyFormatWithCustomFields', () => {
		it('should migrate legacy format and apply backward compatibility', () => {
			const { migrateLegacyFormatWithCustomFields } = backwardCompatibility;
			const legacyData = {
				tasks: [
					{
						id: 1,
						title: 'Legacy Task',
						subtasks: [{ id: 1, title: 'Legacy Subtask' }]
					}
				]
			};

			const result = migrateLegacyFormatWithCustomFields(legacyData);

			expect(result).toHaveProperty('master');
			expect(result.master.tasks[0].customFields).toBeDefined();
			expect(result.master.tasks[0].subtasks[0].parentTaskId).toBe(1);
			expect(result.master.metadata).toBeDefined();
			expect(result.master.metadata.description).toBe(
				'Tasks for master context'
			);
		});

		it('should preserve existing metadata', () => {
			const { migrateLegacyFormatWithCustomFields } = backwardCompatibility;
			const legacyData = {
				tasks: [{ id: 1, title: 'Task' }],
				metadata: {
					created: '2022-01-01T00:00:00.000Z',
					description: 'Custom description'
				}
			};

			const result = migrateLegacyFormatWithCustomFields(legacyData);

			expect(result.master.metadata).toEqual(legacyData.metadata);
		});
	});

	describe('ensureDataBackwardCompatibility', () => {
		it('should handle legacy format', () => {
			const { ensureDataBackwardCompatibility } = backwardCompatibility;
			const legacyData = {
				tasks: [
					{
						id: 1,
						title: 'Task 1',
						subtasks: [{ id: 1, title: 'Subtask' }]
					}
				]
			};

			const result = ensureDataBackwardCompatibility(legacyData, true);

			expect(result).toHaveProperty('master');
			expect(result.master.tasks[0].customFields).toBeDefined();
			expect(result.master.tasks[0].subtasks[0].parentTaskId).toBe(1);
		});

		it('should handle tagged format', () => {
			const { ensureDataBackwardCompatibility } = backwardCompatibility;
			const taggedData = {
				master: {
					tasks: [
						{
							id: 1,
							title: 'Task 1',
							subtasks: [{ id: 1, title: 'Subtask' }]
						}
					]
				},
				dev: {
					tasks: [
						{
							id: 2,
							title: 'Dev Task',
							subtasks: [{ id: 1, title: 'Dev Subtask' }]
						}
					]
				}
			};

			const result = ensureDataBackwardCompatibility(taggedData, false);

			expect(result.master.tasks[0].customFields).toBeDefined();
			expect(result.master.tasks[0].subtasks[0].parentTaskId).toBe(1);
			expect(result.dev.tasks[0].customFields).toBeDefined();
			expect(result.dev.tasks[0].subtasks[0].parentTaskId).toBe(2);
		});

		it('should preserve non-tag data in tagged format', () => {
			const { ensureDataBackwardCompatibility } = backwardCompatibility;
			const data = {
				master: { tasks: [{ id: 1, title: 'Task' }] },
				someOtherProperty: 'preserve me'
			};

			const result = ensureDataBackwardCompatibility(data, false);

			expect(result.someOtherProperty).toBe('preserve me');
			expect(result.master.tasks[0].customFields).toBeDefined();
		});
	});

	describe('createBackwardCompatibleResult', () => {
		it('should create result with backward compatibility applied', () => {
			const { createBackwardCompatibleResult } = backwardCompatibility;
			const tagData = {
				tasks: [
					{
						id: 1,
						title: 'Task 1',
						subtasks: [{ id: 1, title: 'Subtask' }]
					}
				]
			};
			const resolvedTag = 'dev';
			const originalTaggedData = { master: {}, dev: tagData };

			const result = createBackwardCompatibleResult(
				tagData,
				resolvedTag,
				originalTaggedData
			);

			expect(result.tag).toBe('dev');
			expect(result._rawTaggedData).toBe(originalTaggedData);
			expect(result.tasks[0].customFields).toBeDefined();
			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(1);
		});
	});

	describe('createMasterFallbackResult', () => {
		it('should create master fallback with backward compatibility', () => {
			const { createMasterFallbackResult } = backwardCompatibility;
			const masterData = {
				tasks: [
					{
						id: 1,
						title: 'Master Task',
						subtasks: [{ id: 1, title: 'Master Subtask' }]
					}
				]
			};
			const originalTaggedData = { master: masterData };

			const result = createMasterFallbackResult(masterData, originalTaggedData);

			expect(result.tag).toBe('master');
			expect(result._rawTaggedData).toBe(originalTaggedData);
			expect(result.tasks[0].customFields).toBeDefined();
			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(1);
		});
	});
});
