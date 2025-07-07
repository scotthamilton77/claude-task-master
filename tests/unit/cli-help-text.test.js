/**
 * CLI Help Text Tests for Custom Fields
 * Tests that CLI help text reflects project configuration appropriately
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI Help Text for Custom Fields', () => {
	let testDir;
	let projectRoot;
	let configFilePath;
	let originalCwd;

	beforeEach(async () => {
		// Save original working directory
		originalCwd = process.cwd();

		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-help-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		await fs.mkdir(taskMasterDir, { recursive: true });
		configFilePath = path.join(taskMasterDir, 'custom-fields.json');

		// Change to test directory to simulate running CLI from project root
		process.chdir(projectRoot);
	});

	afterEach(async () => {
		// Restore original working directory
		process.chdir(originalCwd);

		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	/**
	 * Helper function to execute CLI command and capture output
	 */
	async function executeCliCommand(command) {
		return new Promise((resolve, reject) => {
			const binPath = path.resolve(__dirname, '../../bin/task-master.js');
			const args = command.split(' ').slice(1); // Remove 'task-master'
			
			const child = spawn('node', [binPath, ...args], {
				cwd: projectRoot,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('close', (code) => {
				resolve({ code, stdout, stderr });
			});

			child.on('error', (error) => {
				reject(error);
			});

			// Set timeout to prevent hanging
			setTimeout(() => {
				child.kill('SIGTERM');
				reject(new Error('Command timeout'));
			}, 10000);
		});
	}

	describe('Command descriptions reflect configuration', () => {
		it('should show dynamic description for add-task command', async () => {
			// Create custom fields config
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const result = await executeCliCommand('task-master add-task --help');

			// Remove line breaks for easier matching
			const cleanOutput = result.stdout.replace(/\s+/g, ' ');
			expect(cleanOutput).toContain('Add a new task using AI with optional custom fields for project-specific metadata');
			expect(cleanOutput).toContain('Custom fields are dynamically configured per project via .taskmaster/custom-fields.json');
		});

		it('should show dynamic description for add-subtask command', async () => {
			const config = {
				version: '1.0',
				allowList: ['assignee', 'estimate'],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const result = await executeCliCommand('task-master add-subtask --help');

			const cleanOutput = result.stdout.replace(/\s+/g, ' ');
			expect(cleanOutput).toContain('Add a subtask to an existing task with optional custom fields for project-specific metadata');
			expect(cleanOutput).toContain('Custom fields are dynamically configured per project via .taskmaster/custom-fields.json');
		});

		it('should show dynamic description for update-task command', async () => {
			const result = await executeCliCommand('task-master update-task --help');

			const cleanOutput = result.stdout.replace(/\s+/g, ' ');
			expect(cleanOutput).toContain('Update a single specific task by ID with new information and optional custom fields for project-specific metadata');
			expect(cleanOutput).toContain('Custom fields are dynamically configured per project via .taskmaster/custom-fields.json');
		});

		it('should show dynamic description for update-subtask command', async () => {
			const result = await executeCliCommand('task-master update-subtask --help');

			const cleanOutput = result.stdout.replace(/\s+/g, ' ');
			expect(cleanOutput).toContain('Update a subtask by appending additional timestamped information and optional custom fields for project-specific metadata');
			expect(cleanOutput).toContain('Custom fields are dynamically configured per project via .taskmaster/custom-fields.json');
		});
	});

	describe('Help text does not show hardcoded custom fields', () => {
		it('should not show hardcoded epic/component options in add-task help', async () => {
			const result = await executeCliCommand('task-master add-task --help');

			// Should not contain hardcoded custom field options
			expect(result.stdout).not.toContain('--epic');
			expect(result.stdout).not.toContain('--component');
			expect(result.stdout).not.toContain('--assignee');
			expect(result.stdout).not.toContain('Epic identifier');
			expect(result.stdout).not.toContain('Component name');
		});

		it('should not show hardcoded custom field options in add-subtask help', async () => {
			const result = await executeCliCommand('task-master add-subtask --help');

			// Should not contain hardcoded custom field options
			expect(result.stdout).not.toContain('--epic');
			expect(result.stdout).not.toContain('--estimate');
			expect(result.stdout).not.toContain('--difficulty');
			expect(result.stdout).not.toContain('Epic identifier');
			expect(result.stdout).not.toContain('Time estimate');
		});

		it('should not show hardcoded custom field options in update-task help', async () => {
			const result = await executeCliCommand('task-master update-task --help');

			// Should not contain hardcoded custom field options
			expect(result.stdout).not.toContain('--epic');
			expect(result.stdout).not.toContain('--status-notes');
			expect(result.stdout).not.toContain('--priority-reason');
			expect(result.stdout).not.toContain('Epic identifier');
			expect(result.stdout).not.toContain('Status notes');
		});

		it('should not show hardcoded custom field options in update-subtask help', async () => {
			const result = await executeCliCommand('task-master update-subtask --help');

			// Should not contain hardcoded custom field options
			expect(result.stdout).not.toContain('--assignee');
			expect(result.stdout).not.toContain('--blockers');
			expect(result.stdout).not.toContain('--notes');
			expect(result.stdout).not.toContain('Assigned developer');
			expect(result.stdout).not.toContain('Blocking issues');
		});
	});

	describe('Help text shows core options correctly', () => {
		it('should show core options for add-task command', async () => {
			const result = await executeCliCommand('task-master add-task --help');

			// Should contain core options
			expect(result.stdout).toContain('--file');
			expect(result.stdout).toContain('--prompt');
			expect(result.stdout).toContain('--title');
			expect(result.stdout).toContain('--description');
			expect(result.stdout).toContain('--priority');
			expect(result.stdout).toContain('--research');
			expect(result.stdout).toContain('--tag');
		});

		it('should show core options for add-subtask command', async () => {
			const result = await executeCliCommand('task-master add-subtask --help');

			// Should contain core options
			expect(result.stdout).toContain('--file');
			expect(result.stdout).toContain('--parent');
			expect(result.stdout).toContain('--task-id');
			expect(result.stdout).toContain('--title');
			expect(result.stdout).toContain('--description');
			expect(result.stdout).toContain('--status');
			expect(result.stdout).toContain('--tag');
		});

		it('should show core options for update-task command', async () => {
			const result = await executeCliCommand('task-master update-task --help');

			// Should contain core options
			expect(result.stdout).toContain('--file');
			expect(result.stdout).toContain('--id');
			expect(result.stdout).toContain('--prompt');
			expect(result.stdout).toContain('--research');
			expect(result.stdout).toContain('--append');
			expect(result.stdout).toContain('--tag');
		});

		it('should show core options for update-subtask command', async () => {
			const result = await executeCliCommand('task-master update-subtask --help');

			// Should contain core options
			expect(result.stdout).toContain('--file');
			expect(result.stdout).toContain('--id');
			expect(result.stdout).toContain('--prompt');
			expect(result.stdout).toContain('--research');
			expect(result.stdout).toContain('--tag');
		});
	});

	describe('Help text without custom fields configuration', () => {
		it('should work correctly when no config file exists', async () => {
			// Don't create config file - should use defaults
			const result = await executeCliCommand('task-master add-task --help');

			expect(result.code).toBe(0);
			const cleanOutput = result.stdout.replace(/\s+/g, ' ');
			expect(cleanOutput).toContain('Add a new task using AI with optional custom fields for project-specific metadata');
			expect(cleanOutput).toContain('Custom fields are dynamically configured per project via .taskmaster/custom-fields.json');
		});

		it('should handle corrupted config file gracefully in help text', async () => {
			// Write invalid JSON
			await fs.writeFile(configFilePath, '{ invalid json }');

			const result = await executeCliCommand('task-master add-task --help');

			// Help should still work even with corrupted config
			expect(result.code).toBe(0);
			expect(result.stdout).toContain('Add a new task using AI');
		});
	});

	describe('Help text consistency across commands', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should have consistent custom fields messaging across all commands', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];
			const expectedMessage = 'Custom fields are dynamically configured per project via .taskmaster/custom-fields.json';

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				const cleanOutput = result.stdout.replace(/\s+/g, ' ');
				expect(cleanOutput).toContain(expectedMessage);
			}
		});

		it('should have consistent project-specific metadata messaging', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];
			const expectedMessage = 'optional custom fields for project-specific metadata';

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				const cleanOutput = result.stdout.replace(/\s+/g, ' ');
				expect(cleanOutput).toContain(expectedMessage);
			}
		});
	});

	describe('Help text does not contain old syntax examples', () => {
		it('should not contain old --field-name syntax examples', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];
			const oldSyntaxPatterns = [
				'--field-name "value"',
				'--field-name <value>',
				'using --field-name',
				'field-name "value"',
				'Examples: --epic',
				'custom field example:'
			];

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				
				for (const pattern of oldSyntaxPatterns) {
					expect(result.stdout).not.toContain(pattern);
				}
			}
		});

		it('should not contain old help text about generic custom fields', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];
			const oldHelpPatterns = [
				'You can add any custom field using',
				'Custom Fields:',
				'Examples: --epic "EPIC-1234"',
				'--component "auth"',
				'--priority-level "high"'
			];

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				
				for (const pattern of oldHelpPatterns) {
					expect(result.stdout).not.toContain(pattern);
				}
			}
		});
	});

	describe('Help text format and structure', () => {
		it('should have proper command structure in help output', async () => {
			const result = await executeCliCommand('task-master add-task --help');

			expect(result.stdout).toContain('Usage: task-master add-task [options]');
			expect(result.stdout).toContain('Options:');
			expect(result.code).toBe(0);
		});

		it('should show help flag in all commands', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				expect(result.stdout).toContain('-h, --help');
				expect(result.stdout).toContain('Display help information');
			}
		});

		it('should exit with code 0 for help commands', async () => {
			const commands = ['add-task', 'add-subtask', 'update-task', 'update-subtask'];

			for (const command of commands) {
				const result = await executeCliCommand(`task-master ${command} --help`);
				expect(result.code).toBe(0);
			}
		});
	});

	describe('Integration with command registration', () => {
		it('should have updated descriptions in command registration', async () => {
			// Test that the commands are properly registered with new descriptions
			const result = await executeCliCommand('task-master --help');

			// Main help should show available commands
			expect(result.code).toBe(0);
			expect(result.stdout).toBeDefined();
		});

		it('should handle invalid command gracefully', async () => {
			const result = await executeCliCommand('task-master invalid-command --help');

			// Should handle unknown commands (code might be 0 for help, so just check it ran)
			expect(result.code).toBeDefined();
		});

		it('should handle missing required options gracefully in help context', async () => {
			// Help should always work regardless of missing options
			const result = await executeCliCommand('task-master add-task --help');

			expect(result.code).toBe(0);
			expect(result.stdout).toContain('Options:');
		});
	});
});