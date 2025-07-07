/**
 * CLI Custom Fields Tests
 * Tests the integration of custom fields with CLI commands
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock modules before importing
jest.mock('chalk', () => ({
	red: jest.fn((text) => text),
	blue: jest.fn((text) => text),
	green: jest.fn((text) => text),
	yellow: jest.fn((text) => text),
	white: jest.fn((text) => text),
	reset: jest.fn(() => '')
}));

jest.mock('boxen', () => jest.fn((text) => text));

jest.mock('../../scripts/modules/ui.js', () => ({
	displayCurrentTagIndicator: jest.fn(),
	getStatusWithColor: jest.fn((status) => status),
	startLoadingIndicator: jest.fn(() => ({ stop: jest.fn() })),
	stopLoadingIndicator: jest.fn(),
	displayAiUsageSummary: jest.fn()
}));

jest.mock('../../scripts/modules/config-manager.js', () => ({
	getDebugFlag: jest.fn(() => false),
	isApiKeySet: jest.fn(() => true),
	getLogLevel: jest.fn(() => 'info')
}));

// Import after mocking
import { customFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

describe('CLI Custom Fields Integration', () => {
	let testDir;
	let projectRoot;
	let configFilePath;
	let tasksFilePath;
	let originalConsoleLog;
	let originalConsoleError;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-test-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		const tasksDir = path.join(taskMasterDir, 'tasks');
		await fs.mkdir(taskMasterDir, { recursive: true });
		await fs.mkdir(tasksDir, { recursive: true });

		configFilePath = path.join(taskMasterDir, 'custom-fields.json');
		tasksFilePath = path.join(tasksDir, 'tasks.json');

		// Initialize empty tasks file
		await fs.writeFile(
			tasksFilePath,
			JSON.stringify({
				master: {
					tasks: [],
					metadata: {
						created: new Date().toISOString(),
						description: 'Test tasks for master context'
					}
				}
			}, null, 2)
		);

		// Mock console to prevent spam during tests
		originalConsoleLog = console.log;
		originalConsoleError = console.error;
		console.log = jest.fn();
		console.error = jest.fn();

		// Clear custom fields config cache
		customFieldsConfig.clearCache();
	});

	afterEach(async () => {
		// Restore console
		console.log = originalConsoleLog;
		console.error = originalConsoleError;

		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}

		// Clear config cache
		customFieldsConfig.clearCache();
	});

	describe('Custom Fields Configuration Loading', () => {
		it('should load custom fields configuration in CLI commands', async () => {
			// Create custom fields config
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret'],
				description: 'Test configuration'
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Load configuration
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);

			expect(loadedConfig.allowList).toEqual(['epic', 'component', 'assignee']);
			expect(loadedConfig.allowAdhoc).toBe(true);
			expect(loadedConfig.blockList).toEqual(['password', 'secret']);
		});

		it('should use default configuration when no config file exists', () => {
			const config = customFieldsConfig.loadConfig(projectRoot);

			expect(config.allowList).toEqual([]);
			expect(config.allowAdhoc).toBe(false);
			expect(config.blockList).toEqual([]);
		});

		it('should filter conflicting fields from allowList', async () => {
			// Create config with fields that conflict with core parameters
			const config = {
				version: '1.0',
				allowList: ['epic', 'prompt', 'file', 'component'], // prompt and file conflict
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);

			// Should filter out conflicting fields
			expect(loadedConfig.allowList).toEqual(['epic', 'component']);
			expect(loadedConfig.allowList).not.toContain('prompt');
			expect(loadedConfig.allowList).not.toContain('file');
		});
	});

	describe('Custom Fields Argument Parsing', () => {
		beforeEach(async () => {
			// Create custom fields config for parsing tests
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should parse allow-listed custom fields from CLI options', () => {
			const cliOptions = {
				prompt: 'Create a new task',
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe',
				file: '/path/to/tasks.json',
				tag: 'feature'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe'
			});

			// Should not include core parameters
			expect(customFields).not.toHaveProperty('prompt');
			expect(customFields).not.toHaveProperty('file');
			expect(customFields).not.toHaveProperty('tag');
		});

		it('should parse ad-hoc custom fields with custom: prefix', () => {
			const cliOptions = {
				prompt: 'Create a new task',
				'custom:priority-level': 'P1',
				'custom:reviewer': 'jane.doe',
				'custom:estimate': '4h',
				file: '/path/to/tasks.json'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'priority-level': 'P1',
				'reviewer': 'jane.doe',
				'estimate': '4h'
			});
		});

		it('should combine allow-listed and ad-hoc custom fields', () => {
			const cliOptions = {
				prompt: 'Create a new task',
				epic: 'EPIC-1234', // allow-listed
				component: 'ui', // allow-listed
				'custom:priority-level': 'P1', // ad-hoc
				'custom:reviewer': 'jane.doe', // ad-hoc
				file: '/path/to/tasks.json'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'ui',
				'priority-level': 'P1',
				'reviewer': 'jane.doe'
			});
		});

		it('should reject blocked fields in ad-hoc custom fields', () => {
			const cliOptions = {
				prompt: 'Create a new task',
				'custom:password': 'secret123', // blocked field
				'custom:valid-field': 'valid-value'
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions);
			}).toThrow("Custom field 'password' is blocked by project configuration");
		});

		it('should return empty object when allowAdhoc is false and no allow-listed fields', async () => {
			// Create config with allowAdhoc disabled
			const config = {
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			
			// Clear cache to ensure fresh load
			customFieldsConfig.clearCache();
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			
			// Verify config was loaded correctly
			expect(loadedConfig.allowAdhoc).toBe(false);
			expect(loadedConfig.allowList).toEqual([]);

			const cliOptions = {
				prompt: 'Create a new task',
				'custom:some-field': 'some-value',  // Should be ignored when allowAdhoc is false
				file: '/path/to/tasks.json'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({});
		});
	});

	describe('Custom Fields Validation', () => {
		it('should validate field names for conflicts with core parameters', () => {
			const { validFields, conflictingFields } = customFieldsConfig.validateAllowList([
				'epic',
				'component',
				'prompt', // conflicts
				'file', // conflicts
				'assignee',
				'id' // conflicts
			]);

			expect(validFields).toEqual(['epic', 'component', 'assignee']);
			expect(conflictingFields).toEqual(['prompt', 'file', 'id']);
		});

		it('should check if field is allowed based on configuration', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			// Allow-listed fields should be allowed
			expect(customFieldsConfig.isFieldAllowed('epic')).toBe(true);
			expect(customFieldsConfig.isFieldAllowed('component')).toBe(true);

			// Ad-hoc fields should be allowed when not blocked
			expect(customFieldsConfig.isFieldAllowed('priority-level')).toBe(true);
			expect(customFieldsConfig.isFieldAllowed('reviewer')).toBe(true);

			// Blocked fields should not be allowed
			expect(customFieldsConfig.isFieldAllowed('password')).toBe(false);
		});

		it('should not allow ad-hoc fields when allowAdhoc is false', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			// Allow-listed field should be allowed
			expect(customFieldsConfig.isFieldAllowed('epic')).toBe(true);

			// Non-allow-listed fields should not be allowed when allowAdhoc is false
			expect(customFieldsConfig.isFieldAllowed('priority-level')).toBe(false);
			expect(customFieldsConfig.isFieldAllowed('reviewer')).toBe(false);
		});
	});

	describe('CLI Commands Integration', () => {
		it('should properly integrate custom fields config loading in CLI commands', async () => {
			// Create custom fields config
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Test that loadConfig can be called (simulating CLI command)
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig).toBeDefined();
			expect(loadedConfig.allowList).toEqual(['epic', 'component']);

			// Test that parseCustomFields works with CLI-style options
			const cliOptions = {
				prompt: 'Test task',
				epic: 'EPIC-1234',
				'custom:priority': 'high',
				file: tasksFilePath
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				priority: 'high'
			});
		});

		it('should handle missing project root gracefully', () => {
			expect(() => {
				customFieldsConfig.loadConfig(null);
			}).toThrow('Project root must be a valid string path');

			expect(() => {
				customFieldsConfig.loadConfig('');
			}).toThrow('Project root must be a valid string path');
		});

		it('should handle invalid JSON in config file', async () => {
			// Write invalid JSON
			await fs.writeFile(configFilePath, '{ invalid json }');

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});
	});

	describe('Configuration Caching', () => {
		it('should cache configuration by project root', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Load config first time
			const config1 = customFieldsConfig.loadConfig(projectRoot);
			
			// Load config second time (should use cache)
			const config2 = customFieldsConfig.loadConfig(projectRoot);

			expect(config1).toBe(config2); // Should be same object reference
		});

		it('should clear cache when requested', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Load config
			customFieldsConfig.loadConfig(projectRoot);

			// Clear cache
			customFieldsConfig.clearCache();

			// Should be able to load again
			const reloadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(reloadedConfig).toBeDefined();
		});
	});

	describe('Error Handling', () => {
		it('should handle file read errors gracefully', async () => {
			// Create directory instead of file to cause read error
			await fs.mkdir(configFilePath, { recursive: true });

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});

		it('should handle empty custom fields object gracefully', () => {
			const customFields = customFieldsConfig.parseCustomFields({});
			expect(customFields).toEqual({});
		});

		it('should handle null/undefined arguments gracefully', () => {
			const customFields1 = customFieldsConfig.parseCustomFields(null);
			expect(customFields1).toEqual({});

			const customFields2 = customFieldsConfig.parseCustomFields(undefined);
			expect(customFields2).toEqual({});
		});
	});
});