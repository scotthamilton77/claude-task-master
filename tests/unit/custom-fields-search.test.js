import { describe, it, expect, beforeEach } from '@jest/globals';
import Fuse from 'fuse.js';

// Weight configurations for different field types
const FIELD_WEIGHTS = {
	// Core fields
	title: 2.0,
	description: 1.5,
	details: 1.0,

	// Common custom fields (higher weights)
	epic: 1.8,
	component: 1.5,
	taskType: 1.6,
	assignee: 1.2,
	sprint: 1.4,

	// Default weight for unknown custom fields
	default: 1.0
};

// Get weight for a field
function getWeightForField(fieldName) {
	return FIELD_WEIGHTS[fieldName] || FIELD_WEIGHTS.default;
}

// Extract all custom field names from tasks
function getCustomFieldNames(tasks) {
	const fieldNames = new Set();
	tasks.forEach((task) => {
		if (task.customFields) {
			Object.keys(task.customFields).forEach((field) => fieldNames.add(field));
		}
		if (task.subtasks) {
			task.subtasks.forEach((subtask) => {
				if (subtask.customFields) {
					Object.keys(subtask.customFields).forEach((field) =>
						fieldNames.add(field)
					);
				}
			});
		}
	});
	return Array.from(fieldNames);
}

// Generate dynamic search keys based on discovered custom fields
function generateSearchKeys(tasks) {
	const coreFields = ['title', 'description', 'details'];
	const customFields = getCustomFieldNames(tasks);

	const keys = [
		...coreFields.map((field) => ({
			name: field,
			weight: getWeightForField(field)
		})),
		...customFields.map((field) => ({
			name: `customFields.${field}`,
			weight: getWeightForField(field)
		}))
	];

	return keys;
}

// Enhanced fuzzy search with custom fields
function searchTasks(tasks, query, options = {}) {
	const searchKeys = generateSearchKeys(tasks);

	const fuseOptions = {
		keys: searchKeys,
		threshold: options.threshold || 0.3,
		includeScore: true,
		ignoreLocation: true,
		...options
	};

	const fuse = new Fuse(tasks, fuseOptions);
	return fuse.search(query);
}

describe('Custom Fields Search Integration', () => {
	let sampleTasks;

	beforeEach(() => {
		sampleTasks = [
			{
				id: 1,
				title: 'Implement user authentication',
				description: 'Add login and logout functionality',
				details: 'Use JWT tokens for session management',
				customFields: {
					epic: 'EPIC-1234',
					component: 'auth',
					taskType: 'feature',
					assignee: 'john.doe',
					sprint: '2024-Q1-S3'
				}
			},
			{
				id: 2,
				title: 'Fix database connection pooling',
				description: 'Resolve connection timeout issues',
				details: 'Connection pool exhaustion under high load',
				customFields: {
					epic: 'EPIC-5678',
					component: 'database',
					taskType: 'bug',
					assignee: 'jane.smith',
					priority: 'critical'
				}
			},
			{
				id: 3,
				title: 'Add user profile API endpoints',
				description: 'RESTful API for user profile management',
				details: 'CRUD operations for user profiles',
				customFields: {
					epic: 'EPIC-1234',
					component: 'api',
					taskType: 'feature',
					assignee: 'john.doe'
				}
			},
			{
				id: 4,
				title: 'Legacy task without custom fields',
				description: 'This is an old task',
				details: 'Should still be searchable'
			}
		];
	});

	describe('Dynamic search key generation', () => {
		it('should discover all unique custom field names', () => {
			const fieldNames = getCustomFieldNames(sampleTasks);

			expect(fieldNames).toContain('epic');
			expect(fieldNames).toContain('component');
			expect(fieldNames).toContain('taskType');
			expect(fieldNames).toContain('assignee');
			expect(fieldNames).toContain('sprint');
			expect(fieldNames).toContain('priority');
			expect(fieldNames).toHaveLength(6);
		});

		it('should generate search keys for all fields', () => {
			const keys = generateSearchKeys(sampleTasks);

			// Core fields
			expect(keys).toContainEqual({ name: 'title', weight: 2.0 });
			expect(keys).toContainEqual({ name: 'description', weight: 1.5 });
			expect(keys).toContainEqual({ name: 'details', weight: 1.0 });

			// Custom fields
			expect(keys).toContainEqual({ name: 'customFields.epic', weight: 1.8 });
			expect(keys).toContainEqual({
				name: 'customFields.component',
				weight: 1.5
			});
			expect(keys).toContainEqual({
				name: 'customFields.taskType',
				weight: 1.6
			});
			expect(keys).toContainEqual({
				name: 'customFields.assignee',
				weight: 1.2
			});
		});

		it('should handle tasks with no custom fields', () => {
			const tasksWithoutCustom = [
				{ id: 1, title: 'Task 1', description: 'Desc 1', details: 'Details 1' },
				{ id: 2, title: 'Task 2', description: 'Desc 2', details: 'Details 2' }
			];

			const keys = generateSearchKeys(tasksWithoutCustom);

			expect(keys).toHaveLength(3); // Only core fields
			expect(keys.every((key) => !key.name.includes('customFields'))).toBe(
				true
			);
		});

		it('should discover custom fields from subtasks', () => {
			const tasksWithSubtasks = [
				{
					id: 1,
					title: 'Parent task',
					description: 'Parent description',
					details: 'Parent details',
					subtasks: [
						{
							id: '1.1',
							title: 'Subtask',
							customFields: {
								subComponent: 'auth-module',
								subAssignee: 'alice.jones'
							}
						}
					]
				}
			];

			const fieldNames = getCustomFieldNames(tasksWithSubtasks);

			expect(fieldNames).toContain('subComponent');
			expect(fieldNames).toContain('subAssignee');
		});
	});

	describe('Custom field weight calculation', () => {
		it('should assign predefined weights to known fields', () => {
			expect(getWeightForField('epic')).toBe(1.8);
			expect(getWeightForField('component')).toBe(1.5);
			expect(getWeightForField('taskType')).toBe(1.6);
		});

		it('should assign default weight to unknown fields', () => {
			expect(getWeightForField('unknownField')).toBe(1.0);
			expect(getWeightForField('customTag')).toBe(1.0);
		});
	});

	describe('Fuzzy search with custom fields', () => {
		it('should find tasks by custom field values', () => {
			const results = searchTasks(sampleTasks, 'EPIC-1234');

			expect(results).toHaveLength(2);
			expect(results[0].item.id).toBe(1);
			expect(results[1].item.id).toBe(3);
		});

		it('should find tasks by assignee', () => {
			const results = searchTasks(sampleTasks, 'john.doe');

			expect(results).toHaveLength(2);
			const resultIds = results.map((r) => r.item.id);
			expect(resultIds).toContain(1);
			expect(resultIds).toContain(3);
		});

		it('should find tasks by component', () => {
			const results = searchTasks(sampleTasks, 'database');

			expect(results).toHaveLength(1);
			expect(results[0].item.id).toBe(2);
		});

		it('should find tasks by task type', () => {
			const results = searchTasks(sampleTasks, 'bug');

			expect(results).toHaveLength(1);
			expect(results[0].item.id).toBe(2);
		});

		it('should still search core fields', () => {
			const results = searchTasks(sampleTasks, 'authentication');

			expect(results.length).toBeGreaterThan(0);
			expect(results[0].item.id).toBe(1);
		});

		it('should handle partial matches in custom fields', () => {
			const results = searchTasks(sampleTasks, 'jane');

			expect(results).toHaveLength(1);
			expect(results[0].item.id).toBe(2);
		});

		it('should rank results by field weights', () => {
			// Search for "EPIC" which appears in custom fields
			const results = searchTasks(sampleTasks, 'EPIC');

			// All tasks with EPIC should be found
			expect(results.length).toBeGreaterThanOrEqual(2);

			// Results should be sorted by score (best match first)
			const scores = results.map((r) => r.score);
			expect(scores).toEqual([...scores].sort((a, b) => a - b));
		});
	});

	describe('Performance with large datasets', () => {
		it('should handle 1000 tasks efficiently', () => {
			const largeTasks = [];
			for (let i = 0; i < 1000; i++) {
				largeTasks.push({
					id: i,
					title: `Task ${i}`,
					description: `Description for task ${i}`,
					details: `Detailed information about task ${i}`,
					customFields: {
						epic: `EPIC-${Math.floor(i / 10)}`,
						component: ['auth', 'api', 'database', 'ui'][i % 4],
						assignee: `user${i % 20}@example.com`,
						taskType: ['feature', 'bug', 'enhancement'][i % 3],
						sprint: `2024-Q${Math.floor(i / 250) + 1}-S${(i % 12) + 1}`
					}
				});
			}

			const startTime = Date.now();
			const results = searchTasks(largeTasks, 'EPIC-50');
			const endTime = Date.now();

			expect(results.length).toBeGreaterThan(0);
			expect(endTime - startTime).toBeLessThan(500);
		});

		it('should handle tasks with many custom fields', () => {
			const taskWithManyFields = {
				id: 1,
				title: 'Complex task',
				description: 'Task with many custom fields',
				details: 'Testing performance',
				customFields: {}
			};

			// Add 50 custom fields
			for (let i = 0; i < 50; i++) {
				taskWithManyFields.customFields[`field${i}`] = `value${i}`;
			}

			const tasks = [taskWithManyFields];
			const keys = generateSearchKeys(tasks);

			expect(keys.length).toBe(53); // 3 core + 50 custom

			// Search should still work
			const results = searchTasks(tasks, 'value25');
			expect(results).toHaveLength(1);
		});
	});

	describe('Search accuracy with custom fields', () => {
		it('should not match unrelated tasks', () => {
			const results = searchTasks(sampleTasks, 'nonexistent');
			expect(results).toHaveLength(0);
		});

		it('should handle case-insensitive search', () => {
			const results = searchTasks(sampleTasks, 'epic-1234');

			expect(results.length).toBeGreaterThan(0);
			expect(results[0].item.customFields.epic).toBe('EPIC-1234');
		});

		it('should search across all field types simultaneously', () => {
			const mixedSearchTasks = [
				{
					id: 1,
					title: 'Alpha task',
					description: 'Beta description',
					details: 'Gamma details',
					customFields: {
						epic: 'Delta epic',
						component: 'Epsilon component'
					}
				}
			];

			// Each search term should find the task
			expect(searchTasks(mixedSearchTasks, 'Alpha')).toHaveLength(1);
			expect(searchTasks(mixedSearchTasks, 'Beta')).toHaveLength(1);
			expect(searchTasks(mixedSearchTasks, 'Gamma')).toHaveLength(1);
			expect(searchTasks(mixedSearchTasks, 'Delta')).toHaveLength(1);
			expect(searchTasks(mixedSearchTasks, 'Epsilon')).toHaveLength(1);
		});

		it('should handle special characters in custom field values', () => {
			const specialTasks = [
				{
					id: 1,
					title: 'Special task',
					description: 'Task with special characters',
					details: 'Testing special chars',
					customFields: {
						url: 'https://example.com/path',
						email: 'user@domain.com',
						jiraKey: 'PROJ-1234',
						version: 'v1.2.3-beta'
					}
				}
			];

			expect(searchTasks(specialTasks, 'example.com')).toHaveLength(1);
			expect(searchTasks(specialTasks, 'user@domain')).toHaveLength(1);
			expect(searchTasks(specialTasks, 'PROJ-1234')).toHaveLength(1);
			expect(searchTasks(specialTasks, 'v1.2.3')).toHaveLength(1);
		});
	});

	describe('Empty and null value handling', () => {
		it('should handle empty custom field values', () => {
			const tasksWithEmpty = [
				{
					id: 1,
					title: 'Task with empty fields',
					description: 'Description',
					details: 'Details',
					customFields: {
						epic: '',
						component: null,
						assignee: undefined
					}
				}
			];

			const keys = generateSearchKeys(tasksWithEmpty);
			const results = searchTasks(tasksWithEmpty, 'Task');

			expect(results).toHaveLength(1);
		});

		it('should handle missing customFields object', () => {
			const tasksWithoutCustomFields = [
				{
					id: 1,
					title: 'Task without customFields',
					description: 'Description',
					details: 'Details',
					customFields: null
				}
			];

			expect(() => generateSearchKeys(tasksWithoutCustomFields)).not.toThrow();
			expect(() => searchTasks(tasksWithoutCustomFields, 'Task')).not.toThrow();
		});
	});
});

// Export for use in implementation
export {
	generateSearchKeys,
	searchTasks,
	getCustomFieldNames,
	getWeightForField
};
