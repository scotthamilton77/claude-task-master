/**
 * subtaskValidator.js tests
 */

import { jest } from '@jest/globals';

// Mock process.env for debug logging tests
const originalEnv = process.env;

describe('subtaskValidator', () => {
	let subtaskValidator;

	beforeEach(async () => {
		// Reset environment before each test
		jest.resetModules();
		process.env = { ...originalEnv };

		// Import the module after environment setup
		subtaskValidator = await import(
			'../../../../../scripts/modules/utils/subtaskValidator.js'
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.clearAllMocks();
	});

	describe('ensureSubtaskParentIds', () => {
		it('should handle empty or invalid input gracefully', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;

			expect(ensureSubtaskParentIds([])).toEqual([]);
			expect(ensureSubtaskParentIds(null)).toBeNull();
			expect(ensureSubtaskParentIds(undefined)).toBeUndefined();
			expect(ensureSubtaskParentIds('not an array')).toBe('not an array');
		});

		it('should not modify tasks without subtasks', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;
			const tasks = [
				{ id: 1, title: 'Task 1' },
				{ id: 2, title: 'Task 2', subtasks: [] },
				{ id: 3, title: 'Task 3', subtasks: null }
			];

			const result = ensureSubtaskParentIds(tasks);

			expect(result).toEqual(tasks);
		});

		it('should assign missing parentTaskId to subtasks', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1' }, // Missing parentTaskId
						{ id: 2, title: 'Subtask 1.2', parentTaskId: 1 } // Already has correct parentTaskId
					]
				}
			];

			const result = ensureSubtaskParentIds(tasks);

			expect(result[0].subtasks[0].parentTaskId).toBe(1);
			expect(result[0].subtasks[1].parentTaskId).toBe(1);
		});

		it('should fix incorrect parentTaskId on subtasks', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;
			const tasks = [
				{
					id: 5,
					title: 'Task 5',
					subtasks: [
						{ id: 1, title: 'Subtask 5.1', parentTaskId: 3 }, // Wrong parentTaskId
						{ id: 2, title: 'Subtask 5.2', parentTaskId: 5 } // Correct parentTaskId
					]
				}
			];

			const result = ensureSubtaskParentIds(tasks);

			expect(result[0].subtasks[0].parentTaskId).toBe(5); // Fixed
			expect(result[0].subtasks[1].parentTaskId).toBe(5); // Unchanged
		});

		it('should log migrations when debug mode is enabled', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;
			process.env.TASKMASTER_DEBUG = 'true';

			// Mock console.log to capture debug output
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1' }, // Missing parentTaskId
						{ id: 2, title: 'Subtask 1.2', parentTaskId: 999 } // Wrong parentTaskId
					]
				}
			];

			const result = ensureSubtaskParentIds(tasks, true);

			expect(result[0].subtasks[0].parentTaskId).toBe(1);
			expect(result[0].subtasks[1].parentTaskId).toBe(1);

			// Should log each migration
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'[DEBUG] Auto-assigned parentTaskId 1 to subtask 1.1'
				)
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'[DEBUG] Auto-assigned parentTaskId 1 to subtask 1.2'
				)
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'[DEBUG] Subtask validation: Auto-assigned parentTaskId to 2 subtasks'
				)
			);

			consoleSpy.mockRestore();
		});

		it('should not log when debug mode is disabled', () => {
			const { ensureSubtaskParentIds } = subtaskValidator;
			process.env.TASKMASTER_DEBUG = 'false';

			const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [{ id: 1, title: 'Subtask 1.1' }]
				}
			];

			ensureSubtaskParentIds(tasks, true);

			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('validateSubtaskStructure', () => {
		it('should handle invalid input gracefully', () => {
			const { validateSubtaskStructure } = subtaskValidator;

			const result = validateSubtaskStructure('not an array');
			expect(result.issues).toContain('Tasks must be an array');
			expect(result.isValid).toBe(false);
		});

		it('should validate and fix subtask structure by default', () => {
			const { validateSubtaskStructure } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1' }, // Missing parentTaskId
						{ id: 2, title: 'Subtask 1.2', parentTaskId: 1 }
					]
				}
			];

			const result = validateSubtaskStructure(tasks);

			expect(result.tasks[0].subtasks[0].parentTaskId).toBe(1);
			expect(result.isValid).toBe(true);
			expect(result.issues).toHaveLength(0);
		});

		it('should detect issues without fixing when fixIssues is false', () => {
			const { validateSubtaskStructure } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1' }, // Missing parentTaskId
						{ title: 'Subtask without ID' }, // Missing ID
						{ id: 2, title: 'Subtask 1.2', parentTaskId: 999 } // Wrong parentTaskId
					]
				}
			];

			const result = validateSubtaskStructure(tasks, { fixIssues: false });

			expect(result.isValid).toBe(false);
			expect(result.issues).toContain('Task 1: Subtask 1 missing parentTaskId');
			expect(result.issues).toContain('Task 1: Subtask at index 1 missing id');
			expect(result.issues).toContain(
				'Task 1: Subtask 2 has incorrect parentTaskId (999)'
			);
		});

		it('should detect duplicate subtask IDs', () => {
			const { validateSubtaskStructure } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, title: 'Subtask 1.1', parentTaskId: 1 },
						{ id: 1, title: 'Duplicate Subtask', parentTaskId: 1 } // Duplicate ID
					]
				}
			];

			const result = validateSubtaskStructure(tasks, { fixIssues: false });

			expect(result.isValid).toBe(false);
			expect(result.issues).toContain('Task 1: Duplicate subtask ID 1');
		});

		it('should detect missing titles', () => {
			const { validateSubtaskStructure } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [
						{ id: 1, parentTaskId: 1 } // Missing title
					]
				}
			];

			const result = validateSubtaskStructure(tasks, { fixIssues: false });

			expect(result.isValid).toBe(false);
			expect(result.issues).toContain('Task 1: Subtask 1 missing title');
		});
	});

	describe('findOrphanedSubtasks', () => {
		it('should handle invalid input gracefully', () => {
			const { findOrphanedSubtasks } = subtaskValidator;

			expect(findOrphanedSubtasks(null)).toEqual([]);
			expect(findOrphanedSubtasks(undefined)).toEqual([]);
			expect(findOrphanedSubtasks('not an array')).toEqual([]);
		});

		it('should find subtasks with non-existent parent references', () => {
			const { findOrphanedSubtasks } = subtaskValidator;
			const tasks = [
				{ id: 1, title: 'Task 1' },
				{
					id: 2,
					title: 'Task 2',
					subtasks: [
						{ id: 1, title: 'Good Subtask', parentTaskId: 2 },
						{ id: 2, title: 'Orphaned Subtask', parentTaskId: 999 } // References non-existent task
					]
				}
			];

			const orphaned = findOrphanedSubtasks(tasks);

			expect(orphaned).toHaveLength(1);
			expect(orphaned[0].title).toBe('Orphaned Subtask');
			expect(orphaned[0].actualParentId).toBe(2);
			expect(orphaned[0].invalidParentId).toBe(999);
			expect(orphaned[0].context).toContain(
				'Found in task 2 but references non-existent parent 999'
			);
		});

		it('should return empty array when no orphaned subtasks exist', () => {
			const { findOrphanedSubtasks } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Task 1',
					subtasks: [{ id: 1, title: 'Subtask 1.1', parentTaskId: 1 }]
				}
			];

			const orphaned = findOrphanedSubtasks(tasks);
			expect(orphaned).toEqual([]);
		});
	});

	describe('createSubtaskIntegrityReport', () => {
		it('should create comprehensive integrity report', () => {
			const { createSubtaskIntegrityReport } = subtaskValidator;
			const tasks = [
				{ id: 1, title: 'Task without subtasks' },
				{
					id: 2,
					title: 'Task with good subtasks',
					subtasks: [
						{ id: 1, title: 'Good Subtask 1', parentTaskId: 2 },
						{ id: 2, title: 'Good Subtask 2', parentTaskId: 2 }
					]
				},
				{
					id: 3,
					title: 'Task with problematic subtasks',
					subtasks: [
						{ id: 1, title: 'Missing parentTaskId' },
						{ id: 2, title: 'Wrong parentTaskId', parentTaskId: 999 }
					]
				}
			];

			const report = createSubtaskIntegrityReport(tasks);

			expect(report.summary.totalTasks).toBe(3);
			expect(report.summary.tasksWithSubtasks).toBe(2);
			expect(report.summary.totalSubtasks).toBe(4);
			expect(report.summary.subtasksWithIssues).toBe(2);
			expect(report.summary.integrityScore).toBe('50.0%');

			expect(report.isHealthy).toBe(false);
			expect(report.issues.length).toBeGreaterThan(0);
		});

		it('should report 100% integrity for healthy data', () => {
			const { createSubtaskIntegrityReport } = subtaskValidator;
			const tasks = [
				{
					id: 1,
					title: 'Healthy Task',
					subtasks: [{ id: 1, title: 'Healthy Subtask', parentTaskId: 1 }]
				}
			];

			const report = createSubtaskIntegrityReport(tasks);

			expect(report.summary.integrityScore).toBe('100.0%');
			expect(report.isHealthy).toBe(true);
			expect(report.issues).toHaveLength(0);
		});

		it('should handle tasks with no subtasks', () => {
			const { createSubtaskIntegrityReport } = subtaskValidator;
			const tasks = [
				{ id: 1, title: 'Task 1' },
				{ id: 2, title: 'Task 2' }
			];

			const report = createSubtaskIntegrityReport(tasks);

			expect(report.summary.totalTasks).toBe(2);
			expect(report.summary.tasksWithSubtasks).toBe(0);
			expect(report.summary.totalSubtasks).toBe(0);
			expect(report.summary.integrityScore).toBe('100%');
			expect(report.isHealthy).toBe(true);
		});
	});
});
