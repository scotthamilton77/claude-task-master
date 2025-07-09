import { describe, it, expect, beforeEach } from '@jest/globals';

// Import the actual implementation for testing
import { CustomFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';
import { CustomFieldsParser } from '../../scripts/modules/utils/customFieldsParser.js';

describe('CustomFieldsParser', () => {
	let config;
	let parser;
	const mockProjectRoot = '/test/project';

	beforeEach(() => {
		// Create clean instances for each test
		config = new CustomFieldsConfig();
		parser = new CustomFieldsParser(config);
	});

	describe('Constructor', () => {
		it('should require a CustomFieldsConfig instance', () => {
			expect(() => new CustomFieldsParser()).toThrow(
				'CustomFieldsConfig instance is required'
			);
			expect(() => new CustomFieldsParser(null)).toThrow(
				'CustomFieldsConfig instance is required'
			);
		});

		it('should accept a valid CustomFieldsConfig instance', () => {
			expect(() => new CustomFieldsParser(config)).not.toThrow();
			expect(parser.config).toBe(config);
		});
	});

	describe('parseCustomFields', () => {
		beforeEach(() => {
			// Load config with test data
			const mockConfig = {
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should extract allow-listed fields from args', () => {
			const args = {
				id: '123',
				prompt: 'test',
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe',
				unknownField: 'ignored'
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe'
			});
		});

		it('should handle custom: prefix fields when ad-hoc enabled', () => {
			const args = {
				epic: 'EPIC-123',
				'custom:priority-level': 'P1',
				'custom:review-board': 'architecture'
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				'priority-level': 'P1',
				'review-board': 'architecture'
			});
		});

		it('should handle legacy --custom field:value format', () => {
			const args = {
				epic: 'EPIC-123',
				custom: ['priority-level:P1', 'review-board:architecture']
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				'priority-level': 'P1',
				'review-board': 'architecture'
			});
		});

		it('should handle values with colons in custom fields', () => {
			const args = {
				'custom:url': 'https://example.com:8080',
				custom: ['endpoint:api://host:port/path']
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				url: 'https://example.com:8080',
				endpoint: 'api://host:port/path'
			});
		});

		it('should throw error for blocked fields', () => {
			const args = {
				'custom:password': '12345'
			};

			expect(() => parser.parseCustomFields(args)).toThrow(
				"Field 'password' is not allowed"
			);
		});

		it('should ignore empty field names', () => {
			const args = {
				'custom:': 'empty-field-name',
				custom: [':empty-field-name', '  :whitespace-only']
			};

			const customFields = parser.parseCustomFields(args);
			expect(customFields).toEqual({});
		});

		it('should handle single custom value as string', () => {
			const args = {
				custom: 'field:value'
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				field: 'value'
			});
		});

		it('should return empty object when no config loaded', () => {
			const freshConfig = new CustomFieldsConfig();
			const freshParser = new CustomFieldsParser(freshConfig);
			// Don't load any config
			
			const args = {
				epic: 'EPIC-123',
				custom: ['field:value']
			};

			const customFields = freshParser.parseCustomFields(args);
			expect(customFields).toEqual({});
		});

		it('should handle null or undefined args gracefully', () => {
			expect(parser.parseCustomFields(null)).toEqual({});
			expect(parser.parseCustomFields(undefined)).toEqual({});
			expect(parser.parseCustomFields('not-an-object')).toEqual({});
		});
	});

	describe('parseArgument', () => {
		it('should parse field:value format correctly', () => {
			const result = parser.parseArgument('priority:high');
			expect(result).toEqual({
				fieldName: 'priority',
				value: 'high'
			});
		});

		it('should handle values with colons', () => {
			const result = parser.parseArgument('url:https://example.com:8080');
			expect(result).toEqual({
				fieldName: 'url',
				value: 'https://example.com:8080'
			});
		});

		it('should handle empty values', () => {
			const result = parser.parseArgument('field:');
			expect(result).toEqual({
				fieldName: 'field',
				value: ''
			});
		});

		it('should handle invalid inputs', () => {
			expect(parser.parseArgument(null)).toEqual({
				fieldName: null,
				value: null
			});
			expect(parser.parseArgument('')).toEqual({
				fieldName: null,
				value: null
			});
			expect(parser.parseArgument('no-colon')).toEqual({
				fieldName: 'no-colon',
				value: ''
			});
		});

		it('should trim field names', () => {
			const result = parser.parseArgument('  field  :value');
			expect(result).toEqual({
				fieldName: 'field',
				value: 'value'
			});
		});
	});

	describe('validateFieldName', () => {
		beforeEach(() => {
			// Load config for validation tests
			const mockConfig = {
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password']
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should validate allowed field names', () => {
			const result = parser.validateFieldName('epic');
			expect(result).toEqual({
				isValid: true,
				reason: null
			});

			const adhocResult = parser.validateFieldName('custom-field');
			expect(adhocResult).toEqual({
				isValid: true,
				reason: null
			});
		});

		it('should reject blocked field names', () => {
			const result = parser.validateFieldName('password');
			expect(result).toEqual({
				isValid: false,
				reason: "Field 'password' is blocked"
			});
		});

		it('should reject empty field names', () => {
			expect(parser.validateFieldName('')).toEqual({
				isValid: false,
				reason: 'Field name must be a non-empty string'
			});
			expect(parser.validateFieldName('   ')).toEqual({
				isValid: false,
				reason: 'Field name cannot be empty'
			});
		});

		it('should reject invalid inputs', () => {
			expect(parser.validateFieldName(null)).toEqual({
				isValid: false,
				reason: 'Field name must be a non-empty string'
			});
			expect(parser.validateFieldName(123)).toEqual({
				isValid: false,
				reason: 'Field name must be a non-empty string'
			});
		});

		it('should handle no configuration gracefully', () => {
			const freshConfig = new CustomFieldsConfig();
			const freshParser = new CustomFieldsParser(freshConfig);
			
			const result = freshParser.validateFieldName('field');
			expect(result).toEqual({
				isValid: false,
				reason: 'No configuration loaded'
			});
		});
	});

	describe('extractCustomPrefixFields', () => {
		beforeEach(() => {
			const mockConfig = { allowList: [], allowAdhoc: true, blockList: ['secret'] };
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should extract custom: prefix fields', () => {
			const args = {
				'custom:epic': 'EPIC-123',
				'custom:priority': 'high',
				normalField: 'ignored'
			};

			const result = parser.extractCustomPrefixFields(args);
			expect(result).toEqual({
				epic: 'EPIC-123',
				priority: 'high'
			});
		});

		it('should skip empty field names', () => {
			const args = {
				'custom:': 'empty',
				'custom:valid': 'value'
			};

			const result = parser.extractCustomPrefixFields(args);
			expect(result).toEqual({
				valid: 'value'
			});
		});

		it('should throw for invalid field names', () => {
			const args = {
				'custom:secret': 'blocked-value'
			};

			expect(() => parser.extractCustomPrefixFields(args)).toThrow(
				"Field 'secret' is blocked"
			);
		});
	});

	describe('extractLegacyCustomFields', () => {
		beforeEach(() => {
			const mockConfig = { allowList: [], allowAdhoc: true, blockList: ['secret'] };
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should extract legacy custom fields', () => {
			const args = {
				custom: ['epic:EPIC-123', 'priority:high']
			};

			const result = parser.extractLegacyCustomFields(args);
			expect(result).toEqual({
				epic: 'EPIC-123',
				priority: 'high'
			});
		});

		it('should handle single string custom value', () => {
			const args = {
				custom: 'field:value'
			};

			const result = parser.extractLegacyCustomFields(args);
			expect(result).toEqual({
				field: 'value'
			});
		});

		it('should return empty object when no custom property', () => {
			const args = { other: 'value' };
			const result = parser.extractLegacyCustomFields(args);
			expect(result).toEqual({});
		});
	});

	describe('extractAllowListedFields', () => {
		beforeEach(() => {
			const mockConfig = { allowList: ['epic', 'component'], allowAdhoc: false };
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should extract only allow-listed fields', () => {
			const args = {
				epic: 'EPIC-123',
				component: 'auth',
				notAllowed: 'ignored',
				id: '123'
			};

			const result = parser.extractAllowListedFields(args);
			expect(result).toEqual({
				epic: 'EPIC-123',
				component: 'auth'
			});
		});

		it('should handle missing fields gracefully', () => {
			const args = {
				epic: 'EPIC-123'
				// component missing
			};

			const result = parser.extractAllowListedFields(args);
			expect(result).toEqual({
				epic: 'EPIC-123'
			});
		});
	});

	describe('Integration with disabled ad-hoc', () => {
		beforeEach(() => {
			const mockConfig = {
				allowList: ['epic'],
				allowAdhoc: false, // Disabled
				blockList: []
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			parser = new CustomFieldsParser(configWithPreload);
		});

		it('should ignore custom: prefix fields when ad-hoc disabled', () => {
			const args = {
				epic: 'EPIC-123',
				'custom:priority': 'high', // Should be ignored
				custom: ['field:value'] // Should be ignored
			};

			const customFields = parser.parseCustomFields(args);
			expect(customFields).toEqual({
				epic: 'EPIC-123'
			});
		});
	});
});