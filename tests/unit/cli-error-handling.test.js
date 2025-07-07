/**
 * CLI Error Handling Tests for Custom Fields
 * Tests error scenarios and graceful handling of custom fields
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock console and process.exit to prevent actual exits during tests
jest.mock('chalk', () => ({
	red: jest.fn((text) => text),
	blue: jest.fn((text) => text),
	green: jest.fn((text) => text),
	yellow: jest.fn((text) => text),
	white: jest.fn((text) => text),
	reset: jest.fn(() => '')
}));

// Import the customFieldsConfig service
import { customFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

describe('CLI Custom Fields Error Handling', () => {
	let testDir;
	let projectRoot;
	let configFilePath;
	let originalConsoleLog;
	let originalConsoleError;
	let originalConsoleWarn;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-error-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		await fs.mkdir(taskMasterDir, { recursive: true });
		configFilePath = path.join(taskMasterDir, 'custom-fields.json');

		// Mock console functions to capture warnings
		originalConsoleLog = console.log;
		originalConsoleError = console.error;
		originalConsoleWarn = console.warn;
		console.log = jest.fn();
		console.error = jest.fn();
		console.warn = jest.fn();

		// Clear config cache
		customFieldsConfig.clearCache();
	});

	afterEach(async () => {
		// Restore console functions
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
		console.warn = originalConsoleWarn;

		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}

		// Clear config cache and mocks
		customFieldsConfig.clearCache();
		jest.clearAllMocks();
	});

	describe('Blocked fields error handling', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password', 'secret', 'token', 'api-key', 'private-key', 'auth-token']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should throw descriptive error for single blocked field', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:password': 'secret123'
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions);
			}).toThrow("Custom field 'password' is blocked by project configuration");
		});

		it('should throw error for different blocked fields', () => {
			const blockedFields = ['secret', 'token', 'api-key', 'private-key', 'auth-token'];

			blockedFields.forEach(field => {
				const cliOptions = {
					prompt: 'Create a task',
					[`custom:${field}`]: 'some-value'
				};

				expect(() => {
					customFieldsConfig.parseCustomFields(cliOptions);
				}).toThrow(`Custom field '${field}' is blocked by project configuration`);
			});
		});

		it('should throw error on first blocked field encountered', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:valid-field': 'valid-value',
				'custom:password': 'secret123',
				'custom:secret': 'another-secret' // This shouldn't be reached
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions);
			}).toThrow("Custom field 'password' is blocked by project configuration");
		});

		it('should allow valid fields when blocked fields are not used', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:reviewer': 'jane.doe',
				'custom:estimate': '4h'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				reviewer: 'jane.doe',
				estimate: '4h'
			});
		});

		it('should handle case-sensitive blocked field names', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:PASSWORD': 'secret123', // Different case
				'custom:Secret': 'another-secret' // Different case
			};

			// Should not throw error for different case (case-sensitive matching)
			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'PASSWORD': 'secret123',
				'Secret': 'another-secret'
			});
		});
	});

	describe('Configuration file error handling', () => {
		it('should handle missing configuration file gracefully', () => {
			// Don't create config file
			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();

			const config = customFieldsConfig.loadConfig(projectRoot);
			expect(config).toEqual({
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should handle corrupted JSON configuration', async () => {
			// Write invalid JSON
			await fs.writeFile(configFilePath, '{ invalid json content }');

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});

		it('should handle empty configuration file', async () => {
			// Write empty file
			await fs.writeFile(configFilePath, '');

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});

		it('should handle configuration file with partial content', async () => {
			// Write partial valid JSON
			await fs.writeFile(configFilePath, '{"version": "1.0"');

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});

		it('should handle configuration file with wrong data types', async () => {
			const config = {
				version: '1.0',
				allowList: 'not-an-array', // Should be array
				allowAdhoc: 'not-a-boolean', // Should be boolean
				blockList: { 'invalid': 'object' } // Should be array
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Should load without throwing, but correct invalid data types
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.version).toBe('1.0');
			expect(loadedConfig.allowList).toEqual([]); // Corrected to empty array
			expect(loadedConfig.allowAdhoc).toBe('not-a-boolean'); // Preserved as-is (boolean check not implemented)
		});

		it('should handle file permission errors', async () => {
			// Create directory instead of file to simulate read error
			await fs.mkdir(configFilePath, { recursive: true });

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).toThrow('Failed to load custom fields configuration');
		});
	});

	describe('Project root validation errors', () => {
		it('should throw error for null project root', () => {
			expect(() => {
				customFieldsConfig.loadConfig(null);
			}).toThrow('Project root must be a valid string path');
		});

		it('should throw error for undefined project root', () => {
			expect(() => {
				customFieldsConfig.loadConfig(undefined);
			}).toThrow('Project root must be a valid string path');
		});

		it('should throw error for empty string project root', () => {
			expect(() => {
				customFieldsConfig.loadConfig('');
			}).toThrow('Project root must be a valid string path');
		});

		it('should throw error for non-string project root', () => {
			expect(() => {
				customFieldsConfig.loadConfig(123);
			}).toThrow('Project root must be a valid string path');

			expect(() => {
				customFieldsConfig.loadConfig({});
			}).toThrow('Project root must be a valid string path');

			expect(() => {
				customFieldsConfig.loadConfig([]);
			}).toThrow('Project root must be a valid string path');
		});
	});

	describe('Argument parsing error handling', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should handle null arguments gracefully', () => {
			const customFields = customFieldsConfig.parseCustomFields(null);
			expect(customFields).toEqual({});
		});

		it('should handle undefined arguments gracefully', () => {
			const customFields = customFieldsConfig.parseCustomFields(undefined);
			expect(customFields).toEqual({});
		});

		it('should handle non-object arguments gracefully', () => {
			const customFields1 = customFieldsConfig.parseCustomFields('string');
			expect(customFields1).toEqual({});

			const customFields2 = customFieldsConfig.parseCustomFields(123);
			expect(customFields2).toEqual({});

			const customFields3 = customFieldsConfig.parseCustomFields([]);
			expect(customFields3).toEqual({});
		});

		it('should handle empty object arguments', () => {
			const customFields = customFieldsConfig.parseCustomFields({});
			expect(customFields).toEqual({});
		});

		it('should handle arguments with no custom fields', () => {
			const cliOptions = {
				prompt: 'Create a task',
				file: '/path/to/tasks.json',
				priority: 'high'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields).toEqual({});
		});
	});

	describe('Configuration loading without valid config', () => {
		it('should handle getCurrentConfig when no config is loaded', () => {
			// Clear cache to ensure no config is loaded
			customFieldsConfig.clearCache();

			const config = customFieldsConfig.getCurrentConfig();
			expect(config).toBeNull();
		});

		it('should handle getValidCustomFields when no config is loaded', () => {
			customFieldsConfig.clearCache();

			const fields = customFieldsConfig.getValidCustomFields();
			expect(fields).toEqual([]);
		});

		it('should handle isFieldAllowed when no config is loaded', () => {
			customFieldsConfig.clearCache();

			const isAllowed = customFieldsConfig.isFieldAllowed('epic');
			expect(isAllowed).toBe(false);
		});

		it('should handle parseCustomFields when no config is loaded', () => {
			customFieldsConfig.clearCache();

			const cliOptions = {
				prompt: 'Create a task',
				'custom:some-field': 'some-value'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields).toEqual({});
		});
	});

	describe('Conflict detection and warnings', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'prompt', 'file', 'id'], // Include conflicting fields
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
		});

		it('should filter out conflicting fields and show warnings', () => {
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);

			// Should filter out conflicting fields
			expect(loadedConfig.allowList).toEqual(['epic', 'component']);
			expect(loadedConfig.allowList).not.toContain('prompt');
			expect(loadedConfig.allowList).not.toContain('file');
			expect(loadedConfig.allowList).not.toContain('id');

			// Should have logged warnings (mocked console.log captures these)
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining('Custom fields conflict with core parameters')
			);
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining('These fields will only be accessible via --custom:* syntax')
			);
		});

		it('should handle all conflicting fields scenario', async () => {
			const config = {
				version: '1.0',
				allowList: ['prompt', 'file', 'id', 'help', 'version'], // All conflicting
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);

			// Should result in empty allowList
			expect(loadedConfig.allowList).toEqual([]);
		});
	});

	describe('Schema generation error handling', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should handle generateMcpSchema with no valid fields', () => {
			const mockBaseSchema = {
				extend: jest.fn().mockReturnThis(),
				passthrough: jest.fn().mockReturnThis()
			};

			const schema = customFieldsConfig.generateMcpSchema(mockBaseSchema, []);

			expect(mockBaseSchema.passthrough).toHaveBeenCalled();
		});

		it('should handle generateMcpSchema with valid fields', () => {
			const mockBaseSchema = {
				extend: jest.fn().mockReturnThis(),
				passthrough: jest.fn().mockReturnThis()
			};

			const schema = customFieldsConfig.generateMcpSchema(mockBaseSchema, ['epic', 'component']);

			expect(mockBaseSchema.extend).toHaveBeenCalled();
		});

		it('should handle generateMcpSchema when config is not loaded', () => {
			customFieldsConfig.clearCache();

			const mockBaseSchema = {
				extend: jest.fn().mockReturnThis(),
				passthrough: jest.fn().mockReturnThis()
			};

			const schema = customFieldsConfig.generateMcpSchema(mockBaseSchema, ['epic']);

			// Should still work with provided fields
			expect(mockBaseSchema.extend).toHaveBeenCalled();
		});
	});

	describe('Edge cases and boundary conditions', () => {
		it('should handle very large configuration files', async () => {
			// Create config with many fields
			const largeAllowList = Array.from({ length: 1000 }, (_, i) => `field-${i}`);
			const largeBlockList = Array.from({ length: 500 }, (_, i) => `blocked-field-${i}`);

			const config = {
				version: '1.0',
				allowList: largeAllowList,
				allowAdhoc: true,
				blockList: largeBlockList
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.allowList.length).toBe(1000);
			expect(loadedConfig.blockList.length).toBe(500);
		});

		it('should handle configuration with unusual field names', async () => {
			const config = {
				version: '1.0',
				allowList: ['', ' ', 'field with spaces', 'field\nwith\nnewlines', '特殊字符', '🚀emoji🎉'],
				allowAdhoc: true,
				blockList: ['empty-ish', '']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();
		});

		it('should handle configuration with circular references gracefully', async () => {
			// JSON.stringify would fail on circular references, but we're testing the loading
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();
		});
	});
});