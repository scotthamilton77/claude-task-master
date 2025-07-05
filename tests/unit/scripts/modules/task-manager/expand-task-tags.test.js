import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock AI service before importing modules
const mockGenerateTextService = jest.fn().mockResolvedValue({
	mainResult: JSON.stringify({
		subtasks: [
			{
				id: 1,
				title: 'Subtask 1',
				description: 'First subtask',
				dependencies: [],
				details: 'Implementation details for subtask 1',
				status: 'pending'
			},
			{
				id: 2,
				title: 'Subtask 2',
				description: 'Second subtask',
				dependencies: [1],
				details: 'Implementation details for subtask 2',
				status: 'pending'
			}
		]
	}),
	telemetryData: { model: 'test', tokensUsed: 100 }
});

jest.unstable_mockModule(
	'../../../../../scripts/modules/ai-services-unified.js',
	() => ({
		generateTextService: mockGenerateTextService,
		streamTextService: jest.fn(),
		generateObjectService: jest.fn(),
		logAiUsage: jest.fn()
	})
);

// Import after mocking
const { default: expandTask } = await import(
	'../../../../../scripts/modules/task-manager/expand-task.js'
);

describe('expand-task with multiple tags', () => {
	let tempDir;
	let tasksPath;
	let mockContext;

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskmaster-test-'));

		// Create .taskmaster directory
		const taskMasterDir = path.join(tempDir, '.taskmaster');
		await fs.mkdir(taskMasterDir);

		// Create state.json with current tag
		const statePath = path.join(taskMasterDir, 'state.json');
		await fs.writeFile(
			statePath,
			JSON.stringify({ currentTag: 'master' }, null, 2)
		);

		tasksPath = path.join(tempDir, 'tasks.json');

		// Mock context with mcpLog
		mockContext = {
			mcpLog: {
				info: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
				debug: jest.fn()
			},
			projectRoot: tempDir,
			tag: 'master'
		};
	});

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true });
		jest.resetModules();
		jest.clearAllMocks();
	});

	test('should preserve all tags when expanding task in master tag', async () => {
		// Create a multi-tag tasks.json file
		const multiTagData = {
			master: {
				metadata: {
					created: '2024-01-01T00:00:00Z',
					description: 'Master tag tasks'
				},
				tasks: [
					{
						id: 1,
						title: 'Task to expand',
						description: 'This task will get subtasks',
						status: 'pending',
						details: 'Task details'
					}
				]
			},
			feature: {
				metadata: {
					created: '2024-01-02T00:00:00Z',
					description: 'Feature branch tasks'
				},
				tasks: [
					{
						id: 1,
						title: 'Feature task',
						description: 'A task in feature branch',
						status: 'pending'
					}
				]
			},
			bugfix: {
				metadata: {
					created: '2024-01-03T00:00:00Z',
					description: 'Bugfix tasks'
				},
				tasks: [
					{
						id: 1,
						title: 'Bug fix task',
						description: 'Fix a bug',
						status: 'done'
					}
				]
			}
		};

		// Write the initial multi-tag file
		await fs.writeFile(tasksPath, JSON.stringify(multiTagData, null, 2));

		// Expand task 1 in master tag
		await expandTask(
			tasksPath,
			1, // taskId
			2, // numSubtasks
			false, // useResearch
			'', // additionalContext
			mockContext,
			false // force
		);

		// Read the file after expansion
		const resultData = JSON.parse(await fs.readFile(tasksPath, 'utf8'));

		// Verify all tags are still present
		expect(Object.keys(resultData)).toContain('master');
		expect(Object.keys(resultData)).toContain('feature');
		expect(Object.keys(resultData)).toContain('bugfix');

		// Verify master tag has the expanded task with subtasks
		expect(resultData.master.tasks[0].subtasks).toHaveLength(2);
		expect(resultData.master.tasks[0].subtasks[0].title).toBe('Subtask 1');
		expect(resultData.master.tasks[0].subtasks[1].title).toBe('Subtask 2');

		// Verify other tags are unchanged
		expect(resultData.feature.tasks).toHaveLength(1);
		expect(resultData.feature.tasks[0].title).toBe('Feature task');
		expect(resultData.bugfix.tasks).toHaveLength(1);
		expect(resultData.bugfix.tasks[0].title).toBe('Bug fix task');
	});

	test('should preserve all tags when expanding task in non-master tag', async () => {
		// Create a multi-tag tasks.json file
		const multiTagData = {
			master: {
				metadata: {
					created: '2024-01-01T00:00:00Z',
					description: 'Master tag tasks'
				},
				tasks: [
					{
						id: 1,
						title: 'Master task',
						description: 'Task in master',
						status: 'pending'
					}
				]
			},
			feature: {
				metadata: {
					created: '2024-01-02T00:00:00Z',
					description: 'Feature branch tasks'
				},
				tasks: [
					{
						id: 1,
						title: 'Feature task to expand',
						description: 'This will get subtasks',
						status: 'pending',
						details: 'Feature implementation'
					}
				]
			}
		};

		// Write the initial multi-tag file
		await fs.writeFile(tasksPath, JSON.stringify(multiTagData, null, 2));

		// Update context to use feature tag
		mockContext.tag = 'feature';

		// Update state.json to set current tag to feature
		const statePath = path.join(tempDir, '.taskmaster', 'state.json');
		await fs.writeFile(
			statePath,
			JSON.stringify({ currentTag: 'feature' }, null, 2)
		);

		// Expand task 1 in feature tag
		await expandTask(
			tasksPath,
			1, // taskId
			2, // numSubtasks
			false, // useResearch
			'', // additionalContext
			mockContext,
			false // force
		);

		// Read the file after expansion
		const resultData = JSON.parse(await fs.readFile(tasksPath, 'utf8'));

		// Verify all tags are still present
		expect(Object.keys(resultData)).toContain('master');
		expect(Object.keys(resultData)).toContain('feature');

		// Verify feature tag has the expanded task with subtasks
		expect(resultData.feature.tasks[0].subtasks).toHaveLength(2);

		// Verify master tag is unchanged
		expect(resultData.master.tasks).toHaveLength(1);
		expect(resultData.master.tasks[0].title).toBe('Master task');
		expect(resultData.master.tasks[0].subtasks).toBeUndefined();
	});
});
