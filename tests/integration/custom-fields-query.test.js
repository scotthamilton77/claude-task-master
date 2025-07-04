import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock query engine that will be implemented in Phase 2
class CustomFieldQueryEngine {
	constructor(tasksData) {
		this.tasks = tasksData.tasks || [];
	}
	
	// Translate query parameters into core and custom field filters
	translateQuery(params) {
		const coreFields = ['id', 'title', 'description', 'details', 'testStrategy', 'status', 'priority', 'dependencies', 'subtasks'];
		
		const translated = {
			coreFilters: {},
			customFilters: {}
		};
		
		Object.entries(params).forEach(([key, value]) => {
			if (coreFields.includes(key)) {
				translated.coreFilters[key] = value;
			} else {
				translated.customFilters[key] = value;
			}
		});
		
		return translated;
	}
	
	// Apply filters to tasks
	filterTasks(filters) {
		let results = [...this.tasks];
		
		// Apply core field filters
		Object.entries(filters.coreFilters).forEach(([field, value]) => {
			results = results.filter(task => {
				if (field === 'status' && value.includes(',')) {
					// Handle comma-separated status values
					const statuses = value.split(',').map(s => s.trim());
					return statuses.includes(task[field]);
				}
				return task[field] === value || (task[field] && task[field].toString().includes(value));
			});
		});
		
		// Apply custom field filters
		Object.entries(filters.customFilters).forEach(([field, value]) => {
			results = results.filter(task => {
				if (!task.customFields || !task.customFields[field]) {
					return false;
				}
				
				if (value.includes(',')) {
					// Handle comma-separated values
					const values = value.split(',').map(v => v.trim());
					return values.includes(task.customFields[field]);
				}
				
				return task.customFields[field] === value || 
					   task.customFields[field].includes(value);
			});
		});
		
		return results;
	}
	
	// Main query method
	query(params) {
		const filters = this.translateQuery(params);
		return this.filterTasks(filters);
	}
	
	// Query with subtasks included
	queryWithSubtasks(params) {
		const results = this.query(params);
		
		// Also search subtasks
		const subtaskResults = [];
		this.tasks.forEach(task => {
			if (task.subtasks) {
				task.subtasks.forEach(subtask => {
					const subtaskMatches = this.matchesCustomFields(subtask, params);
					if (subtaskMatches) {
						subtaskResults.push({
							...task,
							matchedSubtask: subtask
						});
					}
				});
			}
		});
		
		return [...results, ...subtaskResults];
	}
	
	// Check if task/subtask matches custom field criteria
	matchesCustomFields(item, params) {
		const filters = this.translateQuery(params);
		
		return Object.entries(filters.customFilters).every(([field, value]) => {
			if (!item.customFields || !item.customFields[field]) {
				return false;
			}
			
			if (value.includes(',')) {
				const values = value.split(',').map(v => v.trim());
				return values.includes(item.customFields[field]);
			}
			
			return item.customFields[field] === value;
		});
	}
}

describe('Custom Fields Query Integration', () => {
	let testDir;
	let projectRoot;
	let tasksFilePath;
	let sampleTasksData;
	let queryEngine;

	beforeEach(async () => {
		// Create temporary directory
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-test-'));
		projectRoot = testDir;
		
		// Create directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });
		
		tasksFilePath = path.join(tasksDir, 'tasks.json');
		
		// Create sample tasks data
		sampleTasksData = {
			currentTag: 'master',
			tasks: [
				{
					id: 1,
					title: 'Implement user authentication',
					description: 'Add login and logout functionality',
					details: 'Use JWT tokens for session management',
					testStrategy: 'Unit and integration tests',
					status: 'pending',
					priority: 'high',
					dependencies: [],
					subtasks: [],
					customFields: {
						epic: 'EPIC-1234',
						component: 'auth',
						taskType: 'feature',
						assignee: 'john.doe',
						sprint: '2024-Q1-S3',
						estimatedHours: '16'
					}
				},
				{
					id: 2,
					title: 'Fix database connection pooling',
					description: 'Resolve connection timeout issues',
					details: 'Connection pool exhaustion under high load',
					testStrategy: 'Load testing',
					status: 'in-progress',
					priority: 'critical',
					dependencies: [],
					subtasks: [
						{
							id: '2.1',
							title: 'Analyze connection patterns',
							status: 'done',
							details: 'Complete analysis of connection usage',
							customFields: {
								assignee: 'alice.jones',
								component: 'database-analysis'
							}
						}
					],
					customFields: {
						epic: 'EPIC-5678',
						component: 'database',
						taskType: 'bug',
						assignee: 'jane.smith',
						priority: 'critical',
						riskLevel: 'high'
					}
				},
				{
					id: 3,
					title: 'Add user profile API endpoints',
					description: 'RESTful API for user profile management',
					details: 'CRUD operations for user profiles',
					testStrategy: 'API testing',
					status: 'pending',
					priority: 'medium',
					dependencies: [1],
					subtasks: [],
					customFields: {
						epic: 'EPIC-1234',
						component: 'api',
						taskType: 'feature',
						assignee: 'john.doe',
						sprint: '2024-Q1-S4'
					}
				},
				{
					id: 4,
					title: 'Legacy task without custom fields',
					description: 'Old task for compatibility testing',
					details: 'Should not appear in custom field queries',
					testStrategy: 'Manual testing',
					status: 'pending',
					priority: 'low',
					dependencies: [],
					subtasks: []
				}
			]
		};
		
		// Write sample data to file
		await fs.writeFile(tasksFilePath, JSON.stringify(sampleTasksData, null, 2));
		
		// Initialize query engine
		queryEngine = new CustomFieldQueryEngine(sampleTasksData);
	});

	afterEach(async () => {
		// Clean up
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Single custom field filtering', () => {
		it('should filter by epic', () => {
			const results = queryEngine.query({ epic: 'EPIC-1234' });
			
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});

		it('should filter by component', () => {
			const results = queryEngine.query({ component: 'database' });
			
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(2);
		});

		it('should filter by task type', () => {
			const results = queryEngine.query({ taskType: 'feature' });
			
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});

		it('should filter by assignee', () => {
			const results = queryEngine.query({ assignee: 'john.doe' });
			
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});

		it('should return empty for non-existent custom field values', () => {
			const results = queryEngine.query({ epic: 'EPIC-9999' });
			
			expect(results).toHaveLength(0);
		});

		it('should return empty for non-existent custom field names', () => {
			const results = queryEngine.query({ nonExistentField: 'value' });
			
			expect(results).toHaveLength(0);
		});
	});

	describe('Multiple custom field combinations', () => {
		it('should filter by multiple custom fields (AND logic)', () => {
			const results = queryEngine.query({
				epic: 'EPIC-1234',
				assignee: 'john.doe'
			});
			
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});

		it('should filter by epic and component', () => {
			const results = queryEngine.query({
				epic: 'EPIC-1234',
				component: 'auth'
			});
			
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(1);
		});

		it('should handle no matches for multiple fields', () => {
			const results = queryEngine.query({
				epic: 'EPIC-1234',
				component: 'database'  // No task has both
			});
			
			expect(results).toHaveLength(0);
		});

		it('should filter by three custom fields', () => {
			const results = queryEngine.query({
				epic: 'EPIC-1234',
				assignee: 'john.doe',
				taskType: 'feature'
			});
			
			expect(results).toHaveLength(2);
		});
	});

	describe('Mixed core and custom field queries', () => {
		it('should combine core status with custom epic', () => {
			const results = queryEngine.query({
				status: 'pending',
				epic: 'EPIC-1234'
			});
			
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});

		it('should combine core priority with custom component', () => {
			const results = queryEngine.query({
				priority: 'high',
				component: 'auth'
			});
			
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(1);
		});

		it('should filter tasks without custom fields when using core fields only', () => {
			const results = queryEngine.query({
				status: 'pending'
			});
			
			expect(results).toHaveLength(3); // Tasks 1, 3, and 4
			expect(results.map(r => r.id)).toEqual([1, 3, 4]);
		});

		it('should exclude tasks without custom fields when using custom field filters', () => {
			const results = queryEngine.query({
				status: 'pending',
				epic: 'EPIC-1234'
			});
			
			// Task 4 has status='pending' but no epic, so excluded
			expect(results).toHaveLength(2);
			expect(results.map(r => r.id)).toEqual([1, 3]);
		});
	});

	describe('Comma-separated value filtering', () => {
		it('should handle comma-separated custom field values', () => {
			const results = queryEngine.query({
				epic: 'EPIC-1234,EPIC-5678'
			});
			
			expect(results).toHaveLength(3); // All tasks with either epic
			expect(results.map(r => r.id)).toEqual([1, 2, 3]);
		});

		it('should handle comma-separated status with custom fields', () => {
			const results = queryEngine.query({
				status: 'pending,in-progress',
				component: 'auth,database'
			});
			
			expect(results).toHaveLength(2); // Tasks 1 and 2
			expect(results.map(r => r.id)).toEqual([1, 2]);
		});

		it('should handle comma-separated assignees', () => {
			const results = queryEngine.query({
				assignee: 'john.doe,jane.smith'
			});
			
			expect(results).toHaveLength(3);
			expect(results.map(r => r.id)).toEqual([1, 2, 3]);
		});
	});

	describe('Empty result handling', () => {
		it('should return empty array for no matches', () => {
			const results = queryEngine.query({
				epic: 'NONEXISTENT'
			});
			
			expect(results).toEqual([]);
		});

		it('should return empty array for impossible combinations', () => {
			const results = queryEngine.query({
				taskType: 'feature',
				component: 'database' // No feature tasks in database component
			});
			
			expect(results).toEqual([]);
		});

		it('should handle null/undefined custom field values', () => {
			// Add task with null custom field value
			const taskWithNulls = {
				id: 5,
				title: 'Task with null custom fields',
				description: 'Testing null handling',
				details: 'Details',
				testStrategy: 'Test',
				status: 'pending',
				customFields: {
					epic: null,
					component: undefined,
					assignee: ''
				}
			};
			
			queryEngine.tasks.push(taskWithNulls);
			
			const results = queryEngine.query({ epic: 'EPIC-1234' });
			
			// Should not include task with null epic
			expect(results.map(r => r.id)).not.toContain(5);
		});
	});

	describe('Subtask querying', () => {
		it('should find tasks by subtask custom fields', () => {
			const results = queryEngine.queryWithSubtasks({
				assignee: 'alice.jones'
			});
			
			// Should find task 2 because its subtask has assignee='alice.jones'
			expect(results.length).toBeGreaterThan(0);
			const parentTaskFound = results.some(r => r.id === 2);
			expect(parentTaskFound).toBe(true);
		});

		it('should find tasks by subtask component', () => {
			const results = queryEngine.queryWithSubtasks({
				component: 'database-analysis'
			});
			
			expect(results.length).toBeGreaterThan(0);
			const foundResult = results.find(r => r.id === 2);
			expect(foundResult).toBeDefined();
			expect(foundResult.matchedSubtask).toBeDefined();
		});

		it('should include both parent and subtask matches', () => {
			const results = queryEngine.queryWithSubtasks({
				component: 'database'
			});
			
			// Should find task 2 directly (parent has component='database')
			// and possibly through subtask matching
			expect(results.length).toBeGreaterThan(0);
			expect(results.some(r => r.id === 2)).toBe(true);
		});
	});

	describe('File-based querying integration', () => {
		it('should read from file and execute query', async () => {
			// Read tasks from file
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksData = JSON.parse(content);
			const fileQueryEngine = new CustomFieldQueryEngine(tasksData);
			
			const results = fileQueryEngine.query({ epic: 'EPIC-1234' });
			
			expect(results).toHaveLength(2);
		});

		it('should handle file updates and re-query', async () => {
			// Add new task to file
			const content = await fs.readFile(tasksFilePath, 'utf-8');
			const tasksData = JSON.parse(content);
			
			tasksData.tasks.push({
				id: 5,
				title: 'New task',
				description: 'Added after creation',
				details: 'Details',
				testStrategy: 'Test',
				status: 'pending',
				customFields: {
					epic: 'EPIC-1234',
					component: 'new-component'
				}
			});
			
			await fs.writeFile(tasksFilePath, JSON.stringify(tasksData, null, 2));
			
			// Re-read and query
			const updatedContent = await fs.readFile(tasksFilePath, 'utf-8');
			const updatedTasksData = JSON.parse(updatedContent);
			const updatedQueryEngine = new CustomFieldQueryEngine(updatedTasksData);
			
			const results = updatedQueryEngine.query({ epic: 'EPIC-1234' });
			
			expect(results).toHaveLength(3); // Now includes the new task
		});
	});

	describe('Query performance', () => {
		it('should handle large datasets efficiently', () => {
			// Create large dataset
			const largeTasks = [];
			for (let i = 0; i < 1000; i++) {
				largeTasks.push({
					id: i,
					title: `Task ${i}`,
					description: `Description ${i}`,
					details: `Details ${i}`,
					testStrategy: `Test ${i}`,
					status: 'pending',
					customFields: {
						epic: `EPIC-${Math.floor(i / 10)}`,
						component: ['auth', 'api', 'database'][i % 3],
						assignee: `user${i % 20}@example.com`
					}
				});
			}
			
			const largeQueryEngine = new CustomFieldQueryEngine({ tasks: largeTasks });
			
			const startTime = Date.now();
			const results = largeQueryEngine.query({ epic: 'EPIC-50' });
			const endTime = Date.now();
			
			expect(results.length).toBeGreaterThan(0);
			expect(endTime - startTime).toBeLessThan(50); // Should be fast
		});
	});
});

// Export for use in other tests
export { CustomFieldQueryEngine };