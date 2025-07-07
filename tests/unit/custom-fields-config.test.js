import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach
} from '@jest/globals';
import path from 'path';
import { z } from 'zod';

// Mock fs module
jest.mock('fs');

import fs from 'fs';

// This will be the actual implementation location
// import { CustomFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

// Mock implementation for testing
class CustomFieldsConfig {
	constructor() {
		this.config = null;
		this.projectRoot = null;
	}

	loadConfig(projectRoot) {
		this.projectRoot = projectRoot;
		const configPath = path.join(
			projectRoot,
			'.taskmaster',
			'custom-fields.json'
		);

		if (!fs.existsSync(configPath)) {
			// Default behavior: no custom fields without config
			this.config = {
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: [],
				description: ''
			};
			return this.config;
		}

		try {
			const rawConfig = fs.readFileSync(configPath, 'utf-8');
			const parsedConfig = JSON.parse(rawConfig);

			// Validate schema
			const configSchema = z.object({
				version: z.string().default('1.0'),
				allowList: z.array(z.string()).default([]),
				allowAdhoc: z.boolean().default(false),
				blockList: z.array(z.string()).default([]),
				description: z.string().optional().default('')
			});

			this.config = configSchema.parse(parsedConfig);
			return this.config;
		} catch (error) {
			throw new Error(
				`Failed to load custom fields configuration: ${error.message}`
			);
		}
	}

	validateAllowList(allowList, coreParameters) {
		const conflicts = allowList.filter(
			(field) =>
				coreParameters.has(field) ||
				coreParameters.has(this.kebabToCamel(field))
		);

		if (conflicts.length > 0) {
			console.warn(
				`⚠️  Custom fields conflict with core parameters: ${conflicts.join(', ')}`
			);
			console.warn(
				`   These fields will only be accessible via --custom:* syntax`
			);
			// TODO: Make this validation dynamic and future-proof
			return allowList.filter((field) => !conflicts.includes(field));
		}
		return allowList;
	}

	generateCliOptions(command, validCustomFields) {
		// Add allow-listed fields as native options
		validCustomFields.forEach((field) => {
			command.option(`--${field} <value>`, `Set ${field} custom field`);
		});

		// Add ad-hoc syntax if enabled
		if (this.config && this.config.allowAdhoc) {
			command.option(
				'--custom <field:value>',
				'Set custom field using field:value syntax (repeatable)',
				this.collect,
				[]
			);
		}
	}

	generateMcpSchema(baseSchema, validCustomFields) {
		// Add allow-listed fields to Zod schema
		const customFieldSchema = {};
		validCustomFields.forEach((field) => {
			customFieldSchema[field] = z
				.string()
				.optional()
				.describe(`${field} custom field`);
		});

		// Extend base schema
		return baseSchema.extend(customFieldSchema).passthrough();
	}

	parseCustomFields(args) {
		const customFields = {};

		if (!this.config) {
			return customFields;
		}

		// Extract allow-listed fields
		this.config.allowList.forEach((field) => {
			if (args[field] !== undefined) {
				customFields[field] = args[field];
			}
		});

		// Extract ad-hoc fields if enabled
		if (this.config.allowAdhoc && args.custom) {
			const customArgs = Array.isArray(args.custom)
				? args.custom
				: [args.custom];
			customArgs.forEach((customArg) => {
				const [field, ...valueParts] = customArg.split(':');
				const value = valueParts.join(':'); // Handle values with colons

				if (this.config.blockList.includes(field)) {
					throw new Error(`Field '${field}' is not allowed`);
				}
				customFields[field] = value;
			});
		}

		return customFields;
	}

	isAllowed(fieldName) {
		if (!this.config) return false;

		// Check block list first
		if (this.config.blockList.includes(fieldName)) {
			return false;
		}

		// Check allow list
		if (this.config.allowList.includes(fieldName)) {
			return true;
		}

		// Check ad-hoc if enabled
		return this.config.allowAdhoc;
	}

	kebabToCamel(str) {
		return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
	}

	collect(value, previous) {
		return previous.concat([value]);
	}
}

describe('CustomFieldsConfig', () => {
	let customFieldsConfig;
	const mockProjectRoot = '/test/project';
	const configPath = '/test/project/.taskmaster/custom-fields.json';

	beforeEach(() => {
		customFieldsConfig = new CustomFieldsConfig();
		jest.clearAllMocks();
		jest.spyOn(console, 'warn').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('loadConfig', () => {
		it('should load valid configuration from file', () => {
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret'],
				description: 'Test configuration'
			};

			fs.existsSync.mockReturnValue(true);
			fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

			const config = customFieldsConfig.loadConfig(mockProjectRoot);

			expect(fs.existsSync).toHaveBeenCalledWith(configPath);
			expect(fs.readFileSync).toHaveBeenCalledWith(configPath, 'utf-8');
			expect(config).toEqual(mockConfig);
		});

		it('should return default config when file does not exist', () => {
			fs.existsSync.mockReturnValue(false);

			const config = customFieldsConfig.loadConfig(mockProjectRoot);

			expect(config).toEqual({
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should apply defaults for missing properties', () => {
			const partialConfig = {
				allowList: ['epic']
			};

			fs.existsSync.mockReturnValue(true);
			fs.readFileSync.mockReturnValue(JSON.stringify(partialConfig));

			const config = customFieldsConfig.loadConfig(mockProjectRoot);

			expect(config).toEqual({
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should throw error for invalid JSON', () => {
			fs.existsSync.mockReturnValue(true);
			fs.readFileSync.mockReturnValue('invalid json');

			expect(() => customFieldsConfig.loadConfig(mockProjectRoot)).toThrow(
				'Failed to load custom fields configuration'
			);
		});

		it('should throw error for invalid schema', () => {
			const invalidConfig = {
				allowList: 'not-an-array'
			};

			fs.existsSync.mockReturnValue(true);
			fs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

			expect(() => customFieldsConfig.loadConfig(mockProjectRoot)).toThrow(
				'Failed to load custom fields configuration'
			);
		});
	});

	describe('validateAllowList', () => {
		const coreParameters = new Set([
			'file',
			'prompt',
			'id',
			'research',
			'projectRoot',
			'title',
			'description',
			'details',
			'dependencies'
		]);

		it('should return valid fields without conflicts', () => {
			const allowList = ['epic', 'component', 'assignee'];

			const validFields = customFieldsConfig.validateAllowList(
				allowList,
				coreParameters
			);

			expect(validFields).toEqual(allowList);
			expect(console.warn).not.toHaveBeenCalled();
		});

		it('should detect and filter conflicting fields', () => {
			const allowList = ['epic', 'prompt', 'file', 'assignee'];

			const validFields = customFieldsConfig.validateAllowList(
				allowList,
				coreParameters
			);

			expect(validFields).toEqual(['epic', 'assignee']);
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining('prompt, file')
			);
		});

		it('should handle kebab-case to camelCase conflicts', () => {
			const allowList = ['epic', 'project-root', 'assignee'];

			const validFields = customFieldsConfig.validateAllowList(
				allowList,
				coreParameters
			);

			expect(validFields).toEqual(['epic', 'assignee']);
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining('project-root')
			);
		});

		it('should return empty array if all fields conflict', () => {
			const allowList = ['prompt', 'file', 'id'];

			const validFields = customFieldsConfig.validateAllowList(
				allowList,
				coreParameters
			);

			expect(validFields).toEqual([]);
		});
	});

	describe('generateCliOptions', () => {
		let mockCommand;

		beforeEach(() => {
			mockCommand = {
				option: jest.fn()
			};
		});

		it('should generate options for allow-listed fields', () => {
			customFieldsConfig.config = {
				allowList: ['epic', 'component'],
				allowAdhoc: false
			};

			customFieldsConfig.generateCliOptions(mockCommand, ['epic', 'component']);

			expect(mockCommand.option).toHaveBeenCalledTimes(2);
			expect(mockCommand.option).toHaveBeenCalledWith(
				'--epic <value>',
				'Set epic custom field'
			);
			expect(mockCommand.option).toHaveBeenCalledWith(
				'--component <value>',
				'Set component custom field'
			);
		});

		it('should add custom option when allowAdhoc is true', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: true
			};

			customFieldsConfig.generateCliOptions(mockCommand, ['epic']);

			expect(mockCommand.option).toHaveBeenCalledTimes(2);
			expect(mockCommand.option).toHaveBeenCalledWith(
				'--custom <field:value>',
				'Set custom field using field:value syntax (repeatable)',
				expect.any(Function),
				[]
			);
		});

		it('should not add custom option when allowAdhoc is false', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: false
			};

			customFieldsConfig.generateCliOptions(mockCommand, ['epic']);

			expect(mockCommand.option).toHaveBeenCalledTimes(1);
			expect(mockCommand.option).not.toHaveBeenCalledWith(
				'--custom <field:value>',
				expect.any(String),
				expect.any(Function),
				expect.any(Array)
			);
		});
	});

	describe('generateMcpSchema', () => {
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

		it('should allow passthrough for additional fields', () => {
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
	});

	describe('parseCustomFields', () => {
		it('should extract allow-listed fields', () => {
			customFieldsConfig.config = {
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: false,
				blockList: []
			};

			const args = {
				id: '123',
				prompt: 'test',
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe',
				unknownField: 'ignored'
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe'
			});
		});

		it('should handle ad-hoc fields when enabled', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: []
			};

			const args = {
				epic: 'EPIC-123',
				custom: ['priority-level:P1', 'review-board:architecture']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				'priority-level': 'P1',
				'review-board': 'architecture'
			});
		});

		it('should handle values with colons in ad-hoc fields', () => {
			customFieldsConfig.config = {
				allowList: [],
				allowAdhoc: true,
				blockList: []
			};

			const args = {
				custom: ['url:https://example.com:8080']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				url: 'https://example.com:8080'
			});
		});

		it('should throw error for block-listed fields', () => {
			customFieldsConfig.config = {
				allowList: [],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			const args = {
				custom: ['password:12345']
			};

			expect(() => customFieldsConfig.parseCustomFields(args)).toThrow(
				"Field 'password' is not allowed"
			);
		});

		it('should ignore ad-hoc fields when disabled', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: []
			};

			const args = {
				epic: 'EPIC-123',
				custom: ['priority-level:P1']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123'
			});
		});

		it('should handle single custom value as string', () => {
			customFieldsConfig.config = {
				allowList: [],
				allowAdhoc: true,
				blockList: []
			};

			const args = {
				custom: 'field:value'
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				field: 'value'
			});
		});

		it('should return empty object when no config loaded', () => {
			customFieldsConfig.config = null;

			const args = {
				epic: 'EPIC-123',
				custom: ['field:value']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({});
		});
	});

	describe('isAllowed', () => {
		it('should allow fields in allowList', () => {
			customFieldsConfig.config = {
				allowList: ['epic', 'component'],
				allowAdhoc: false,
				blockList: []
			};

			expect(customFieldsConfig.isAllowed('epic')).toBe(true);
			expect(customFieldsConfig.isAllowed('component')).toBe(true);
		});

		it('should reject fields in blockList', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			expect(customFieldsConfig.isAllowed('password')).toBe(false);
			expect(customFieldsConfig.isAllowed('secret')).toBe(false);
		});

		it('should allow ad-hoc fields when enabled', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: true,
				blockList: ['password']
			};

			expect(customFieldsConfig.isAllowed('custom-field')).toBe(true);
			expect(customFieldsConfig.isAllowed('priority-level')).toBe(true);
		});

		it('should reject ad-hoc fields when disabled', () => {
			customFieldsConfig.config = {
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: []
			};

			expect(customFieldsConfig.isAllowed('custom-field')).toBe(false);
			expect(customFieldsConfig.isAllowed('priority-level')).toBe(false);
		});

		it('should return false when no config loaded', () => {
			customFieldsConfig.config = null;

			expect(customFieldsConfig.isAllowed('epic')).toBe(false);
		});
	});

	describe('kebabToCamel', () => {
		it('should convert kebab-case to camelCase', () => {
			expect(customFieldsConfig.kebabToCamel('project-root')).toBe(
				'projectRoot'
			);
			expect(customFieldsConfig.kebabToCamel('status-notes')).toBe(
				'statusNotes'
			);
			expect(customFieldsConfig.kebabToCamel('priority-level')).toBe(
				'priorityLevel'
			);
		});

		it('should handle strings without hyphens', () => {
			expect(customFieldsConfig.kebabToCamel('epic')).toBe('epic');
			expect(customFieldsConfig.kebabToCamel('component')).toBe('component');
		});
	});

	describe('Integration scenarios', () => {
		it('should handle full configuration workflow', () => {
			// Load config
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token']
			};

			mockFs.existsSync.mockReturnValue(true);
			mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

			customFieldsConfig.loadConfig(mockProjectRoot, mockFs);

			// Validate against core parameters
			const coreParams = new Set(['file', 'prompt', 'id']);
			const validFields = customFieldsConfig.validateAllowList(
				mockConfig.allowList,
				coreParams
			);

			expect(validFields).toEqual(['epic', 'component', 'assignee']);

			// Parse fields from CLI args
			const args = {
				epic: 'EPIC-123',
				component: 'auth',
				custom: ['priority-level:P1']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				epic: 'EPIC-123',
				component: 'auth',
				'priority-level': 'P1'
			});
		});

		it('should handle conflict scenario correctly', () => {
			const mockConfig = {
				allowList: ['epic', 'prompt', 'file'],
				allowAdhoc: false,
				blockList: []
			};

			mockFs.existsSync.mockReturnValue(true);
			mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

			customFieldsConfig.loadConfig(mockProjectRoot, mockFs);

			const coreParams = new Set(['file', 'prompt']);
			const validFields = customFieldsConfig.validateAllowList(
				mockConfig.allowList,
				coreParams
			);

			expect(validFields).toEqual(['epic']);
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining('prompt, file')
			);
		});
	});
});
