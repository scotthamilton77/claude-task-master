/**
 * CLI Edge Cases Tests for Custom Fields
 * Tests edge cases, boundary conditions, and unusual scenarios
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock external dependencies
jest.mock('chalk', () => ({
	red: jest.fn((text) => text),
	blue: jest.fn((text) => text),
	green: jest.fn((text) => text),
	yellow: jest.fn((text) => text),
	white: jest.fn((text) => text),
	reset: jest.fn(() => '')
}));

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

jest.mock('../../scripts/modules/utils.js', () => ({
	findProjectRoot: jest.fn(),
	getCurrentTag: jest.fn(() => 'master'),
	readJSON: jest.fn(),
	writeJSON: jest.fn(),
	log: jest.fn()
}));

// Import after mocking
import { customFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';
import { findProjectRoot } from '../../scripts/modules/utils.js';

describe('CLI Custom Fields Edge Cases', () => {
	let testDir;
	let projectRoot;
	let configFilePath;
	let originalConsoleLog;
	let originalConsoleError;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-edge-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		await fs.mkdir(taskMasterDir, { recursive: true });
		configFilePath = path.join(taskMasterDir, 'custom-fields.json');

		// Mock console to prevent spam during tests
		originalConsoleLog = console.log;
		originalConsoleError = console.error;
		console.log = jest.fn();
		console.error = jest.fn();

		// We don't need to mock findProjectRoot for these tests since we're passing projectRoot directly

		// Clear config cache
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

		// Clear mocks and config cache
		jest.clearAllMocks();
		customFieldsConfig.clearCache();
	});

	describe('Configuration file edge cases', () => {
		it('should handle extremely large configuration files', async () => {
			// Create config with thousands of fields
			const largeAllowList = Array.from({ length: 5000 }, (_, i) => `field-${i}`);
			const largeBlockList = Array.from({ length: 2500 }, (_, i) => `blocked-${i}`);

			const config = {
				version: '1.0',
				allowList: largeAllowList,
				allowAdhoc: true,
				blockList: largeBlockList,
				description: 'A'.repeat(10000) // Very long description
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.allowList.length).toBe(5000);
			expect(loadedConfig.blockList.length).toBe(2500);
		});

		it('should handle configuration with unusual characters', async () => {
			const config = {
				version: '1.0',
				allowList: [
					'field-with-émojis-🚀',
					'field_with_underscores',
					'field.with.dots',
					'field with spaces',
					'field\nwith\nnewlines',
					'field\twith\ttabs',
					'field"with"quotes',
					"field'with'apostrophes",
					'field\\with\\backslashes',
					'field/with/slashes',
					'field|with|pipes',
					'field<with>brackets',
					'field[with]square-brackets',
					'field{with}curly-brackets',
					'field(with)parentheses',
					'特殊字符',
					'русский',
					'العربية',
					'😀😃😄😁😆'
				],
				allowAdhoc: true,
				blockList: ['نهى', '禁止', '🚫blocked🚫']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.allowList).toContain('field-with-émojis-🚀');
			expect(loadedConfig.allowList).toContain('特殊字符');
			expect(loadedConfig.blockList).toContain('🚫blocked🚫');
		});

		it('should handle configuration with null and undefined values', async () => {
			const config = {
				version: '1.0',
				allowList: ['valid-field', null, undefined, '', ' '],
				allowAdhoc: null,
				blockList: [undefined, null, 'valid-blocked'],
				description: null
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();

			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.allowList).toContain('valid-field');
			expect(loadedConfig.blockList).toContain('valid-blocked');
		});

		it('should handle configuration with circular references in strings', async () => {
			const config = {
				version: '1.0',
				allowList: ['field1', 'field2'],
				allowAdhoc: true,
				blockList: [],
				description: 'field1 references field2 which references field1'
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();
		});

		it('should handle configuration with extremely nested structure', async () => {
			const config = {
				version: '1.0',
				allowList: ['simple-field'],
				allowAdhoc: true,
				blockList: [],
				metadata: {
					nested: {
						very: {
							deeply: {
								nested: {
									structure: {
										that: {
											goes: {
												many: {
													levels: {
														deep: 'value'
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(projectRoot);
			}).not.toThrow();
		});
	});

	describe('CLI argument edge cases', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should handle arguments with extreme lengths', () => {
			const veryLongFieldName = 'a'.repeat(1000);
			const veryLongValue = 'b'.repeat(10000);

			const cliOptions = {
				prompt: 'Create a task',
				[`custom:${veryLongFieldName}`]: veryLongValue,
				epic: 'EPIC-1234'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields[veryLongFieldName]).toBe(veryLongValue);
			expect(customFields.epic).toBe('EPIC-1234');
		});

		it('should handle arguments with unusual spacing', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:field-with-spaces': '   value with many    spaces   ',
				'custom:field-with-tabs': '\tvalue\twith\ttabs\t',
				'custom:field-with-newlines': 'value\nwith\nnewlines',
				epic: '  EPIC-1234  ' // allow-listed field with spaces
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields['field-with-spaces']).toBe('   value with many    spaces   ');
			expect(customFields['field-with-tabs']).toBe('\tvalue\twith\ttabs\t');
			expect(customFields['field-with-newlines']).toBe('value\nwith\nnewlines');
			expect(customFields.epic).toBe('  EPIC-1234  ');
		});

		it('should handle arguments with special characters in field names', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:field_with_underscores': 'value1',
				'custom:field-with-dashes': 'value2',
				'custom:field.with.dots': 'value3',
				'custom:field123numbers456': 'value4',
				'custom:field@with#special$chars%': 'value5',
				'custom:field🚀with📱emojis': 'value6'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields['field_with_underscores']).toBe('value1');
			expect(customFields['field-with-dashes']).toBe('value2');
			expect(customFields['field.with.dots']).toBe('value3');
			expect(customFields['field123numbers456']).toBe('value4');
			expect(customFields['field@with#special$chars%']).toBe('value5');
			expect(customFields['field🚀with📱emojis']).toBe('value6');
		});

		it('should handle empty and whitespace-only values', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:empty-field': '',
				'custom:space-field': ' ',
				'custom:tab-field': '\t',
				'custom:newline-field': '\n',
				'custom:multiple-spaces': '   ',
				epic: '' // allow-listed field with empty value
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields['empty-field']).toBe('');
			expect(customFields['space-field']).toBe(' ');
			expect(customFields['tab-field']).toBe('\t');
			expect(customFields['newline-field']).toBe('\n');
			expect(customFields['multiple-spaces']).toBe('   ');
			expect(customFields.epic).toBe('');
		});

		it('should handle malformed custom field syntax gracefully', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:valid-field': 'valid-value',
				'custom': 'missing-field-name',
				'custom:': 'empty-field-name',
				'custom::': 'double-colon',
				'custom:field:with:multiple:colons': 'multiple-colons-value',
				'customfield:old-syntax': 'old-prefix',
				'custom-field-no-colon': 'no-colon'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			// Should only parse valid syntax
			expect(customFields['valid-field']).toBe('valid-value');
			expect(customFields['field:with:multiple:colons']).toBe('multiple-colons-value');

			// Should ignore malformed syntax
			expect(customFields).not.toHaveProperty('');
			expect(customFields).not.toHaveProperty('custom');
			expect(customFields).not.toHaveProperty('custom-field-no-colon');
		});
	});

	describe('Memory and performance edge cases', () => {
		it('should handle thousands of custom fields without memory issues', async () => {
			const config = {
				version: '1.0',
				allowList: [],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			// Create options with many custom fields
			const cliOptions = { prompt: 'Create a task' };
			for (let i = 0; i < 1000; i++) {
				cliOptions[`custom:field-${i}`] = `value-${i}`;
			}

			const startTime = Date.now();
			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			const endTime = Date.now();

			// Should complete in reasonable time (less than 1 second)
			expect(endTime - startTime).toBeLessThan(1000);

			// Should have all fields
			expect(Object.keys(customFields).length).toBe(1000);
			expect(customFields['field-0']).toBe('value-0');
			expect(customFields['field-999']).toBe('value-999');
		});

		it('should handle repeated parsing operations efficiently', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:reviewer': 'jane.doe'
			};

			const startTime = Date.now();

			// Parse same options many times
			for (let i = 0; i < 1000; i++) {
				const customFields = customFieldsConfig.parseCustomFields(cliOptions);
				expect(customFields.epic).toBe('EPIC-1234');
				expect(customFields.reviewer).toBe('jane.doe');
			}

			const endTime = Date.now();

			// Should complete efficiently (less than 1 second for 1000 operations)
			expect(endTime - startTime).toBeLessThan(1000);
		});
	});

	describe('Concurrency and race condition edge cases', () => {
		it('should handle concurrent config loading', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Load config concurrently from multiple "threads"
			const promises = Array.from({ length: 10 }, () => {
				return new Promise(resolve => {
					setTimeout(() => {
						const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
						resolve(loadedConfig);
					}, Math.random() * 100);
				});
			});

			const results = await Promise.all(promises);

			// All results should be identical (cached)
			results.forEach(result => {
				expect(result.allowList).toEqual(['epic']);
				expect(result.allowAdhoc).toBe(true);
			});

			// All results should be the same object reference (cached)
			const firstResult = results[0];
			results.forEach(result => {
				expect(result).toBe(firstResult);
			});
		});

		it('should handle concurrent parsing operations', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:reviewer': 'jane.doe'
			};

			// Parse concurrently
			const promises = Array.from({ length: 50 }, (_, i) => {
				return new Promise(resolve => {
					setTimeout(() => {
						const customFields = customFieldsConfig.parseCustomFields({
							...cliOptions,
							'custom:index': `${i}`
						});
						resolve(customFields);
					}, Math.random() * 50);
				});
			});

			const results = await Promise.all(promises);

			// All results should have correct base fields
			results.forEach((result, index) => {
				expect(result.epic).toBe('EPIC-1234');
				expect(result.reviewer).toBe('jane.doe');
				expect(result.index).toBe(`${index}`);
			});
		});
	});

	describe('File system edge cases', () => {
		it('should handle config file deletion during operation', async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

			// Load config first
			const loadedConfig = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig.allowList).toEqual(['epic']);

			// Delete config file
			await fs.unlink(configFilePath);

			// Parsing should still work with cached config
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields.epic).toBe('EPIC-1234');
		});

		it('should handle config file modification during operation', async () => {
			const config1 = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config1, null, 2));

			// Load initial config
			const loadedConfig1 = customFieldsConfig.loadConfig(projectRoot);
			expect(loadedConfig1.allowList).toEqual(['epic']);
			expect(loadedConfig1.allowAdhoc).toBe(false);

			// Modify config file
			const config2 = {
				version: '1.0',
				allowList: ['component'],
				allowAdhoc: true,
				blockList: ['password']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config2, null, 2));

			// Should still use cached config until cache is cleared
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:reviewer': 'jane.doe'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields.epic).toBe('EPIC-1234'); // Still works with cached config
			expect(customFields).not.toHaveProperty('reviewer'); // allowAdhoc was false in cached config
		});

		it('should handle extremely long file paths', async () => {
			// Create deeply nested directory structure
			const deepPath = path.join(testDir, ...Array(20).fill('very-long-directory-name'));
			await fs.mkdir(deepPath, { recursive: true });

			const deepConfigPath = path.join(deepPath, 'custom-fields.json');
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(deepConfigPath, JSON.stringify(config, null, 2));

			expect(() => {
				customFieldsConfig.loadConfig(deepPath);
			}).not.toThrow();
		});
	});

	describe('Edge cases in field validation', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['valid-field'],
				allowAdhoc: true,
				blockList: ['blocked-field']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should handle isFieldAllowed with extreme field names', () => {
			const extremeFieldNames = [
				'',
				' ',
				'\n',
				'\t',
				'a'.repeat(10000),
				'field🚀with📱emojis',
				'field\nwith\nnewlines',
				'field\twith\ttabs',
				'field with spaces',
				'field"with"quotes',
				"field'with'apostrophes",
				'field\\with\\backslashes',
				'field/with/slashes'
			];

			extremeFieldNames.forEach(fieldName => {
				expect(() => {
					customFieldsConfig.isFieldAllowed(fieldName);
				}).not.toThrow();
			});
		});

		it('should handle validateAllowList with extreme inputs', () => {
			const extremeAllowList = [
				'',
				' ',
				null,
				undefined,
				'a'.repeat(1000),
				'field🚀with📱emojis',
				...Array(1000).fill().map((_, i) => `field-${i}`)
			];

			expect(() => {
				customFieldsConfig.validateAllowList(extremeAllowList);
			}).not.toThrow();

			const result = customFieldsConfig.validateAllowList(extremeAllowList);
			expect(result).toHaveProperty('validFields');
			expect(result).toHaveProperty('conflictingFields');
		});
	});
});