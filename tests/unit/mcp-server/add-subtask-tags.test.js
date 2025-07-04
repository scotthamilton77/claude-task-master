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
			}
		]
	}),
	telemetryData: { model: 'test', tokensUsed: 100 }
});

jest.unstable_mockModule('../../../scripts/modules/ai-services-unified.js', () => ({
	generateTextService: mockGenerateTextService,
	streamTextService: jest.fn(),
	generateObjectService: jest.fn(),
	logAiUsage: jest.fn()
}));

// Import after mocking
const { addSubtaskDirect } = await import('../../../mcp-server/src/core/direct-functions/add-subtask.js');

describe('add-subtask with multiple tags', () => {
	let tempDir;
	let tasksPath;
	let mockLog;

	beforeEach(async () => {
		// Create a temporary directory for test files
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskmaster-test-'));
		
		// Create .taskmaster directory
		const taskMasterDir = path.join(tempDir, '.taskmaster');
		await fs.mkdir(taskMasterDir);
		
		// Create state.json with current tag
		const statePath = path.join(taskMasterDir, 'state.json');
		await fs.writeFile(statePath, JSON.stringify({ currentTag: 'master' }, null, 2));
		
		tasksPath = path.join(tempDir, 'tasks.json');

		// Mock log object
		mockLog = {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn()
		};
	});

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true });
		jest.resetModules();
		jest.clearAllMocks();
	});

	test('should preserve all tags when adding subtask in master tag', async () => {
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
						title: 'Parent task',
						description: 'This task will get a subtask',
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

		// Add subtask to task 1 in master tag
		const result = await addSubtaskDirect({
			tasksJsonPath: tasksPath,
			id: '1',
			title: 'New subtask',
			description: 'A new subtask added via MCP',
			details: 'Subtask implementation details',
			status: 'pending',
			projectRoot: tempDir,
			tag: 'master'
		}, mockLog);

		// Check that the operation succeeded
		expect(result.success).toBe(true);

		// Read the file after adding subtask
		const resultData = JSON.parse(await fs.readFile(tasksPath, 'utf8'));

		// Verify all tags are still present
		expect(Object.keys(resultData)).toContain('master');
		expect(Object.keys(resultData)).toContain('feature');
		expect(Object.keys(resultData)).toContain('bugfix');

		// Verify master tag has the task with the new subtask
		expect(resultData.master.tasks[0].subtasks).toHaveLength(1);
		expect(resultData.master.tasks[0].subtasks[0].title).toBe('New subtask');

		// Verify other tags are unchanged
		expect(resultData.feature.tasks).toHaveLength(1);
		expect(resultData.feature.tasks[0].title).toBe('Feature task');
		expect(resultData.bugfix.tasks).toHaveLength(1);
		expect(resultData.bugfix.tasks[0].title).toBe('Bug fix task');
	});

	test('should preserve all tags when adding subtask in non-master tag', async () => {
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
						title: 'Feature task to get subtask',
						description: 'This will get a subtask',
						status: 'pending',
						details: 'Feature implementation'
					}
				]
			}
		};

		// Write the initial multi-tag file
		await fs.writeFile(tasksPath, JSON.stringify(multiTagData, null, 2));
		
		// Update state.json to set current tag to feature
		const statePath = path.join(tempDir, '.taskmaster', 'state.json');
		await fs.writeFile(statePath, JSON.stringify({ currentTag: 'feature' }, null, 2));

		// Add subtask to task 1 in feature tag
		const result = await addSubtaskDirect({
			tasksJsonPath: tasksPath,
			id: '1',
			title: 'Feature subtask',
			description: 'A subtask for the feature',
			details: 'Feature subtask implementation',
			status: 'pending',
			projectRoot: tempDir,
			tag: 'feature'
		}, mockLog);

		// Check that the operation succeeded
		expect(result.success).toBe(true);

		// Read the file after adding subtask
		const resultData = JSON.parse(await fs.readFile(tasksPath, 'utf8'));

		// Verify all tags are still present
		expect(Object.keys(resultData)).toContain('master');
		expect(Object.keys(resultData)).toContain('feature');

		// Verify feature tag has the task with the new subtask
		expect(resultData.feature.tasks[0].subtasks).toHaveLength(1);
		expect(resultData.feature.tasks[0].subtasks[0].title).toBe('Feature subtask');

		// Verify master tag is unchanged
		expect(resultData.master.tasks).toHaveLength(1);
		expect(resultData.master.tasks[0].title).toBe('Master task');
		expect(resultData.master.tasks[0].subtasks).toBeUndefined();
	});
});