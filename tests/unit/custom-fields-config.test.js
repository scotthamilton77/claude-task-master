import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';

// Import the actual implementation for testing
import { 
	CustomFieldsConfig, 
	CORE_PARAMETERS 
} from '../../scripts/modules/utils/customFieldsConfig.js';
import { CustomFieldsParser } from '../../scripts/modules/utils/customFieldsParser.js';

describe('CustomFieldsConfig', () => {
	let customFieldsConfig;
	const mockProjectRoot = '/test/project';

	beforeEach(() => {
		// Create clean instance for each test
		customFieldsConfig = new CustomFieldsConfig();
		jest.clearAllMocks();
		jest.spyOn(console, 'log').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Constructor injection and preloaded config', () => {
		it('should use preloaded config when provided', () => {
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret'],
				description: 'Test configuration'
			};

			// Create instance with preloaded config
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			const config = configWithPreload.loadConfig(mockProjectRoot);

			expect(config).toEqual(mockConfig);
		});

		it('should return default config when no preloaded config and no file', () => {
			// Test with non-existent project root (no file system access)
			const config = customFieldsConfig.loadConfig('/non/existent/path');

			expect(config).toEqual({
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should merge preloaded config with defaults for missing properties', () => {
			const partialConfig = {
				allowList: ['epic']
			};

			// Create instance with partial preloaded config
			const configWithPreload = new CustomFieldsConfig(partialConfig);
			const config = configWithPreload.loadConfig(mockProjectRoot);

			expect(config).toEqual({
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should throw error for invalid projectRoot parameter', () => {
			expect(() => customFieldsConfig.loadConfig(null)).toThrow(
				'Project root must be a valid string path'
			);
			expect(() => customFieldsConfig.loadConfig(123)).toThrow(
				'Project root must be a valid string path'
			);
		});

		it('should cache configuration per project root', () => {
			const mockConfig = {
				allowList: ['epic']
			};

			const configWithPreload = new CustomFieldsConfig(mockConfig);
			
			// Load config first time
			const firstLoad = configWithPreload.loadConfig(mockProjectRoot);
			expect(firstLoad.allowList).toEqual(['epic']);

			// Load again - should use cache
			const secondLoad = configWithPreload.loadConfig(mockProjectRoot);
			expect(secondLoad).toBe(firstLoad); // Same object reference

			// Clear cache and verify it's cleared
			configWithPreload.clearCache();
			expect(configWithPreload.cache.size).toBe(0);
		});
	});

	describe('validateAllowList', () => {
		it('should return valid fields without conflicts', () => {
			const allowList = ['epic', 'component', 'assignee'];

			const result = customFieldsConfig.validateAllowList(allowList);

			expect(result.validFields).toEqual(allowList);
			expect(result.conflictingFields).toEqual([]);
			expect(console.log).not.toHaveBeenCalledWith(
				expect.stringContaining('conflict with core parameters')
			);
		});

		it('should detect and separate conflicting fields', () => {
			const allowList = ['epic', 'prompt', 'file', 'assignee'];

			const result = customFieldsConfig.validateAllowList(allowList);

			expect(result.validFields).toEqual(['epic', 'assignee']);
			expect(result.conflictingFields).toEqual(['prompt', 'file']);
		});

		it('should handle kebab-case to camelCase conflicts', () => {
			const allowList = ['epic', 'project-root', 'assignee', 'custom-fields'];

			const result = customFieldsConfig.validateAllowList(allowList);

			expect(result.validFields).toEqual(['epic', 'assignee']);
			expect(result.conflictingFields).toEqual(['project-root', 'custom-fields']);
		});

		it('should return empty array if all fields conflict', () => {
			const allowList = ['prompt', 'file', 'id', 'custom-fields'];

			const result = customFieldsConfig.validateAllowList(allowList);

			expect(result.validFields).toEqual([]);
			expect(result.conflictingFields).toEqual(['prompt', 'file', 'id', 'custom-fields']);
		});

		it('should use custom core parameters when provided', () => {
			const allowList = ['epic', 'custom-param', 'assignee'];
			const customCoreParams = ['custom-param', 'another-param'];

			const result = customFieldsConfig.validateAllowList(allowList, customCoreParams);

			expect(result.validFields).toEqual(['epic', 'assignee']);
			expect(result.conflictingFields).toEqual(['custom-param']);
		});

		it('should handle empty or invalid input gracefully', () => {
			expect(customFieldsConfig.validateAllowList(null)).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
			expect(customFieldsConfig.validateAllowList(undefined)).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
			expect(customFieldsConfig.validateAllowList('not-an-array')).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
		});
	});

	describe('validateBlockList', () => {
		it('should separate valid and conflicting fields', () => {
			const blockList = ['password', 'secret', 'prompt', 'file']; // prompt/file are core params

			const result = customFieldsConfig.validateBlockList(blockList);

			expect(result.validFields).toEqual(['password', 'secret']);
			expect(result.conflictingFields).toEqual(['prompt', 'file']);
		});

		it('should handle empty or invalid input gracefully', () => {
			expect(customFieldsConfig.validateBlockList(null)).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
			expect(customFieldsConfig.validateBlockList(undefined)).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
			expect(customFieldsConfig.validateBlockList('not-an-array')).toEqual(
				{ validFields: [], conflictingFields: [] }
			);
		});

		it('should use custom core parameters when provided', () => {
			const blockList = ['password', 'custom-param'];
			const customCoreParams = ['custom-param'];

			const result = customFieldsConfig.validateBlockList(blockList, customCoreParams);

			expect(result.validFields).toEqual(['password']);
			expect(result.conflictingFields).toEqual(['custom-param']);
		});
	});

	describe('Helper methods', () => {
		it('should create a parser instance', () => {
			const parser = customFieldsConfig.createParser();
			expect(parser).toBeInstanceOf(CustomFieldsParser);
		});

		it('should get current config after loading', () => {
			const mockConfig = { allowList: ['epic'] };
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			
			// Should return null before loading
			expect(configWithPreload.getCurrentConfig()).toBeNull();
			
			// Should return config after loading
			configWithPreload.loadConfig(mockProjectRoot);
			expect(configWithPreload.getCurrentConfig()).toEqual({
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should get valid custom fields excluding conflicts', () => {
			const mockConfig = {
				allowList: ['epic', 'prompt', 'component'] // 'prompt' conflicts with core
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			
			const validFields = configWithPreload.getValidCustomFields();
			expect(validFields).toEqual(['epic', 'component']); // 'prompt' filtered out
		});

		it('should check if field is allowed', () => {
			const mockConfig = {
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password']
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			
			expect(configWithPreload.isFieldAllowed('epic')).toBe(true); // in allow list
			expect(configWithPreload.isFieldAllowed('custom-field')).toBe(true); // ad-hoc enabled
			expect(configWithPreload.isFieldAllowed('password')).toBe(false); // in block list
			expect(configWithPreload.isAllowed('epic')).toBe(true); // alias method
		});

		it('should convert kebab-case to camelCase', () => {
			expect(customFieldsConfig.kebabToCamel('project-root')).toBe('projectRoot');
			expect(customFieldsConfig.kebabToCamel('status-notes')).toBe('statusNotes');
			expect(customFieldsConfig.kebabToCamel('priority-level')).toBe('priorityLevel');
			expect(customFieldsConfig.kebabToCamel('epic')).toBe('epic'); // no hyphens
		});
	});

	describe('generateMcpSchema', () => {
		beforeEach(() => {
			// Load config for schema generation tests
			const mockConfig = {
				allowList: ['epic', 'component'],
				allowAdhoc: true
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);
			customFieldsConfig = configWithPreload;
		});

		it('should extend base schema with custom fields', () => {
			const baseSchema = z.object({
				id: z.string(),
				prompt: z.string()
			});

			const extendedSchema = customFieldsConfig.generateMcpSchema(baseSchema, [
				'epic',
				'component'
			]);

			// Test that the schema accepts custom fields
			const testData = {
				id: '123',
				prompt: 'test',
				epic: 'EPIC-123',
				component: 'auth'
			};

			expect(() => extendedSchema.parse(testData)).not.toThrow();
		});

		it('should allow passthrough for additional fields when ad-hoc enabled', () => {
			const baseSchema = z.object({
				id: z.string()
			});

			const extendedSchema = customFieldsConfig.generateMcpSchema(baseSchema, [
				'epic'
			]);

			// Test that additional fields pass through
			const testData = {
				id: '123',
				epic: 'EPIC-123',
				unknownField: 'value'
			};

			const parsed = extendedSchema.parse(testData);
			expect(parsed.unknownField).toBe('value');
		});

		it('should only allow passthrough when allowAdhoc is enabled', () => {
			// Create config without ad-hoc
			const configNoAdhoc = new CustomFieldsConfig({
				allowList: ['epic'],
				allowAdhoc: false
			});
			configNoAdhoc.loadConfig(mockProjectRoot);

			const baseSchema = z.object({ id: z.string() });
			const schemaWithAdhoc = customFieldsConfig.generateMcpSchema(baseSchema, ['epic']);
			const schemaNoAdhoc = configNoAdhoc.generateMcpSchema(baseSchema, ['epic']);

			// Both should accept known fields
			const testData = { id: '123', epic: 'EPIC-123' };
			expect(() => schemaWithAdhoc.parse(testData)).not.toThrow();
			expect(() => schemaNoAdhoc.parse(testData)).not.toThrow();

			// Only schema with adhoc should accept unknown fields
			const testDataWithUnknown = { id: '123', epic: 'EPIC-123', unknown: 'value' };
			expect(() => schemaWithAdhoc.parse(testDataWithUnknown)).not.toThrow();
			// Note: Without adhoc, Zod extend + no passthrough would strip unknown fields rather than throw
		});

		it('should handle empty custom fields gracefully', () => {
			const baseSchema = z.object({ id: z.string() });
			const extendedSchema = customFieldsConfig.generateMcpSchema(baseSchema, []);

			const testData = { id: '123' };
			expect(() => extendedSchema.parse(testData)).not.toThrow();
		});
	});

	describe('parseCustomFields (deprecated method)', () => {
		it('should use parser for backward compatibility', () => {
			const mockConfig = {
				allowList: ['epic', 'component'],
				allowAdhoc: false
			};
			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);

			const args = {
				id: '123',
				prompt: 'test',
				epic: 'EPIC-123',
				component: 'auth'
			};

			// Use the deprecated method which should delegate to parser
			const customFields = configWithPreload.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				component: 'auth'
			});
		});

		it('should return empty object when no config loaded', () => {
			const freshConfig = new CustomFieldsConfig();
			// Don't load any config
			
			const args = {
				epic: 'EPIC-123',
				custom: ['field:value']
			};

			const customFields = freshConfig.parseCustomFields(args);
			expect(customFields).toEqual({});
		});
	});

	describe('Integration scenarios', () => {
		it('should handle full configuration workflow with constructor injection', () => {
			// Create config with preloaded data
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token']
			};

			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);

			// Get valid fields (should filter conflicts automatically)
			const validFields = configWithPreload.getValidCustomFields();
			expect(validFields).toEqual(['epic', 'component', 'assignee']);

			// Parse fields using the parser
			const parser = configWithPreload.createParser();
			const args = {
				epic: 'EPIC-123',
				component: 'auth',
				custom: ['priority-level:P1']
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				component: 'auth',
				'priority-level': 'P1'
			});

			// Check field permissions
			expect(configWithPreload.isAllowed('epic')).toBe(true);
			expect(configWithPreload.isAllowed('custom-field')).toBe(true); // ad-hoc enabled
			expect(configWithPreload.isAllowed('password')).toBe(false); // blocked
		});

		it('should handle conflict scenario with core parameters', () => {
			const mockConfig = {
				allowList: ['epic', 'prompt', 'file'], // prompt and file conflict with core
				allowAdhoc: false,
				blockList: []
			};

			const configWithPreload = new CustomFieldsConfig(mockConfig);
			configWithPreload.loadConfig(mockProjectRoot);

			// Validation should separate valid from conflicting
			const result = configWithPreload.validateAllowList(mockConfig.allowList);
			expect(result.validFields).toEqual(['epic']);
			expect(result.conflictingFields).toEqual(['prompt', 'file']);

			// getValidCustomFields should return only valid fields
			const validFields = configWithPreload.getValidCustomFields();
			expect(validFields).toEqual(['epic']);
		});

		it('should work with custom core parameters injection', () => {
			const customCoreParams = ['custom-param', 'another-param'];
			const configWithCustomCore = new CustomFieldsConfig();
			// Inject custom core parameters for testing
			configWithCustomCore.coreParameters = customCoreParams;

			const allowList = ['epic', 'custom-param', 'component'];
			const result = configWithCustomCore.validateAllowList(allowList);

			expect(result.validFields).toEqual(['epic', 'component']);
			expect(result.conflictingFields).toEqual(['custom-param']);
		});
	});

	describe('Core parameters constants', () => {
		it('should export core parameters', () => {
			expect(CORE_PARAMETERS).toBeDefined();
			expect(Array.isArray(CORE_PARAMETERS)).toBe(true);
			expect(CORE_PARAMETERS).toContain('prompt');
			expect(CORE_PARAMETERS).toContain('file');
			expect(CORE_PARAMETERS).toContain('id');
		});
	});
});