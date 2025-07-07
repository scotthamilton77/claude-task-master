/**
 * CLI Argument Parsing Tests for Custom Fields
 * Tests the --custom:fieldname syntax parsing and validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Import the customFieldsConfig service
import { customFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

describe('CLI Argument Parsing for Custom Fields', () => {
	let testDir;
	let projectRoot;
	let configFilePath;

	beforeEach(async () => {
		// Create temporary directory for test
		testDir = await fs.mkdtemp(path.join(tmpdir(), 'taskmaster-cli-parsing-'));
		projectRoot = testDir;

		// Create .taskmaster directory structure
		const taskMasterDir = path.join(projectRoot, '.taskmaster');
		await fs.mkdir(taskMasterDir, { recursive: true });
		configFilePath = path.join(taskMasterDir, 'custom-fields.json');

		// Clear config cache
		customFieldsConfig.clearCache();
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}

		// Clear config cache
		customFieldsConfig.clearCache();
	});

	describe('--custom:fieldname syntax parsing', () => {
		beforeEach(async () => {
			// Create config with ad-hoc fields enabled
			const config = {
				version: '1.0',
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password', 'secret', 'token']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should parse simple --custom:fieldname arguments', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:priority-level': 'P1',
				'custom:reviewer': 'john.doe',
				'custom:estimate': '4h'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'priority-level': 'P1',
				'reviewer': 'john.doe',
				'estimate': '4h'
			});
		});

		it('should parse --custom:fieldname with complex values', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:requirements': 'Must support OAuth 2.0 and JWT tokens',
				'custom:acceptance-criteria': 'User can login, logout, and view profile',
				'custom:related-tickets': 'JIRA-123, JIRA-456',
				'custom:environment': 'staging,production'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'requirements': 'Must support OAuth 2.0 and JWT tokens',
				'acceptance-criteria': 'User can login, logout, and view profile',
				'related-tickets': 'JIRA-123, JIRA-456',
				'environment': 'staging,production'
			});
		});

		it('should parse --custom:fieldname with special characters in field names', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:priority_level': 'high',
				'custom:sub-component': 'auth-service',
				'custom:test-type': 'integration',
				'custom:api-version': 'v2.1'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'priority_level': 'high',
				'sub-component': 'auth-service',
				'test-type': 'integration',
				'api-version': 'v2.1'
			});
		});

		it('should handle empty values in --custom:fieldname arguments', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:notes': '',
				'custom:reviewer': 'john.doe',
				'custom:empty-field': ''
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'notes': '',
				'reviewer': 'john.doe',
				'empty-field': ''
			});
		});

		it('should handle numeric and boolean-like values', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:story-points': '8',
				'custom:is-blocked': 'true',
				'custom:confidence': '0.85',
				'custom:iteration': '12'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'story-points': '8',
				'is-blocked': 'true',
				'confidence': '0.85',
				'iteration': '12'
			});
		});

		it('should ignore malformed custom field syntax', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:valid-field': 'valid-value',
				'custom': 'invalid-syntax', // Missing colon and field name
				'customfield:old-syntax': 'should-be-ignored', // Wrong prefix
				'custom:': 'empty-field-name' // Empty field name after colon
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			// Should only parse the valid custom field
			expect(customFields).toEqual({
				'valid-field': 'valid-value'
			});
		});
	});

	describe('Allow-listed field parsing', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee', 'priority-level'],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should parse allow-listed fields as direct options', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				component: 'auth-service',
				assignee: 'john.doe',
				'priority-level': 'P1',
				file: '/path/to/tasks.json' // core parameter, should be ignored
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth-service',
				assignee: 'john.doe',
				'priority-level': 'P1'
			});

			// Should not include core parameters
			expect(customFields).not.toHaveProperty('file');
			expect(customFields).not.toHaveProperty('prompt');
		});

		it('should ignore non-allow-listed fields when allowAdhoc is false', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234', // allow-listed, should be included
				component: 'auth', // allow-listed, should be included
				'custom:reviewer': 'jane.doe', // ad-hoc, should be ignored
				'random-field': 'value' // not allow-listed, should be ignored
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth'
			});

			expect(customFields).not.toHaveProperty('reviewer');
			expect(customFields).not.toHaveProperty('random-field');
		});
	});

	describe('Mixed allow-listed and ad-hoc field parsing', () => {
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

		it('should parse both allow-listed and ad-hoc fields', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234', // allow-listed
				component: 'auth', // allow-listed
				'custom:reviewer': 'jane.doe', // ad-hoc
				'custom:estimate': '2h', // ad-hoc
				file: '/path/to/tasks.json' // core parameter
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth',
				reviewer: 'jane.doe',
				estimate: '2h'
			});
		});

		it('should handle field name conflicts between allow-listed and ad-hoc', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234', // allow-listed
				'custom:epic': 'EPIC-5678' // ad-hoc with same name
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			// Allow-listed should take precedence, but both should be preserved
			// The parsing should handle this gracefully
			expect(customFields.epic).toBeDefined();
		});
	});

	describe('Block list validation', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password', 'secret', 'token', 'api-key']
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should reject blocked fields in ad-hoc custom fields', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:password': 'secret123'
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions);
			}).toThrow("Custom field 'password' is blocked by project configuration");
		});

		it('should reject multiple blocked fields', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:secret': 'my-secret'
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions);
			}).toThrow("Custom field 'secret' is blocked by project configuration");

			const cliOptions2 = {
				prompt: 'Create a task',
				'custom:api-key': 'sk-1234567890'
			};

			expect(() => {
				customFieldsConfig.parseCustomFields(cliOptions2);
			}).toThrow("Custom field 'api-key' is blocked by project configuration");
		});

		it('should allow non-blocked fields alongside blocked field rejection', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:reviewer': 'jane.doe',
				'custom:estimate': '3h'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				reviewer: 'jane.doe',
				estimate: '3h'
			});
		});
	});

	describe('Configuration edge cases', () => {
		it('should handle missing configuration file', () => {
			// Don't create config file
			customFieldsConfig.loadConfig(projectRoot);

			const cliOptions = {
				prompt: 'Create a task',
				'custom:some-field': 'some-value',
				'random-field': 'random-value'
			};

			// Should return empty object (default config has allowAdhoc: false)
			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields).toEqual({});
		});

		it('should handle empty allow list and disabled ad-hoc', async () => {
			const config = {
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);

			const cliOptions = {
				prompt: 'Create a task',
				'some-field': 'some-value',
				'custom:other-field': 'other-value'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields).toEqual({});
		});

		it('should handle undefined and null values gracefully', () => {
			const customFields1 = customFieldsConfig.parseCustomFields(undefined);
			expect(customFields1).toEqual({});

			const customFields2 = customFieldsConfig.parseCustomFields(null);
			expect(customFields2).toEqual({});

			const customFields3 = customFieldsConfig.parseCustomFields({});
			expect(customFields3).toEqual({});
		});
	});

	describe('Field name validation', () => {
		beforeEach(async () => {
			const config = {
				version: '1.0',
				allowList: [],
				allowAdhoc: true,
				blockList: []
			};

			await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
			customFieldsConfig.loadConfig(projectRoot);
		});

		it('should handle very long field names', () => {
			const longFieldName = 'very-long-field-name-that-exceeds-normal-length-expectations-and-keeps-going';
			const cliOptions = {
				prompt: 'Create a task',
				[`custom:${longFieldName}`]: 'some-value'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields[longFieldName]).toBe('some-value');
		});

		it('should handle field names with various special characters', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:field_with_underscores': 'value1',
				'custom:field-with-dashes': 'value2',
				'custom:field.with.dots': 'value3',
				'custom:field123with456numbers': 'value4'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'field_with_underscores': 'value1',
				'field-with-dashes': 'value2',
				'field.with.dots': 'value3',
				'field123with456numbers': 'value4'
			});
		});

		it('should handle empty field names gracefully', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:': 'value-with-empty-field-name',
				'custom:valid-field': 'valid-value'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			// Should only include valid field
			expect(customFields).toEqual({
				'valid-field': 'valid-value'
			});
		});
	});

	describe('Value handling', () => {
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

		it('should preserve various value types as strings', () => {
			const cliOptions = {
				prompt: 'Create a task',
				epic: 'EPIC-1234',
				'custom:number-value': '42',
				'custom:boolean-value': 'true',
				'custom:float-value': '3.14159',
				'custom:json-like': '{"key": "value"}',
				'custom:array-like': '[1, 2, 3]'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				epic: 'EPIC-1234',
				'number-value': '42',
				'boolean-value': 'true',
				'float-value': '3.14159',
				'json-like': '{"key": "value"}',
				'array-like': '[1, 2, 3]'
			});

			// All values should be strings
			Object.values(customFields).forEach(value => {
				expect(typeof value).toBe('string');
			});
		});

		it('should handle very long values', () => {
			const longValue = 'This is a very long value that might be used for detailed descriptions or requirements that span multiple sentences and contain a lot of information about the task or feature being implemented.';
			
			const cliOptions = {
				prompt: 'Create a task',
				'custom:long-description': longValue
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);
			expect(customFields['long-description']).toBe(longValue);
		});

		it('should handle values with special characters and whitespace', () => {
			const cliOptions = {
				prompt: 'Create a task',
				'custom:special-chars': 'Value with !@#$%^&*()_+{}|:<>?',
				'custom:whitespace': '  Value with   multiple   spaces  ',
				'custom:newlines': 'Value\\nwith\\nnewlines',
				'custom:unicode': 'Value with émojis 🚀 and ünïcödé'
			};

			const customFields = customFieldsConfig.parseCustomFields(cliOptions);

			expect(customFields).toEqual({
				'special-chars': 'Value with !@#$%^&*()_+{}|:<>?',
				'whitespace': '  Value with   multiple   spaces  ',
				'newlines': 'Value\\nwith\\nnewlines',
				'unicode': 'Value with émojis 🚀 and ünïcödé'
			});
		});
	});
});