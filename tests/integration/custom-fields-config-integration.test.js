import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CustomFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CustomFieldsConfig Integration Tests', () => {
	let customFieldsConfig;
	let testProjectRoot;
	let testConfigPath;

	beforeEach(() => {
		customFieldsConfig = new CustomFieldsConfig();
		testProjectRoot = path.join(__dirname, '../fixtures/test-project');
		testConfigPath = path.join(
			testProjectRoot,
			'.taskmaster',
			'custom-fields.json'
		);

		// Ensure test directory exists
		fs.mkdirSync(path.dirname(testConfigPath), { recursive: true });
	});

	afterEach(() => {
		// Clean up test files
		if (fs.existsSync(testConfigPath)) {
			fs.unlinkSync(testConfigPath);
		}
		customFieldsConfig.clearCache();
	});

	describe('Configuration loading', () => {
		it('should load valid configuration from file', () => {
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'secret'],
				description: 'Test configuration'
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(mockConfig, null, 2));

			const config = customFieldsConfig.loadConfig(testProjectRoot);

			expect(config).toEqual(mockConfig);
			expect(customFieldsConfig.getValidCustomFields()).toEqual([
				'epic',
				'component',
				'assignee'
			]);
		});

		it('should return default config when file does not exist', () => {
			const config = customFieldsConfig.loadConfig(testProjectRoot);

			expect(config).toEqual({
				version: '1.0',
				allowList: [],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
			expect(customFieldsConfig.getValidCustomFields()).toEqual([]);
		});

		it('should apply defaults for missing properties', () => {
			const partialConfig = {
				allowList: ['epic']
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig));

			const config = customFieldsConfig.loadConfig(testProjectRoot);

			expect(config).toEqual({
				version: '1.0',
				allowList: ['epic'],
				allowAdhoc: false,
				blockList: [],
				description: ''
			});
		});

		it('should throw error for invalid JSON', () => {
			fs.writeFileSync(testConfigPath, 'invalid json');

			expect(() => customFieldsConfig.loadConfig(testProjectRoot)).toThrow(
				'Invalid JSON in custom-fields.json'
			);
		});

		it('should throw error for invalid schema', () => {
			const invalidConfig = {
				allowList: 'not-an-array'
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

			expect(() => customFieldsConfig.loadConfig(testProjectRoot)).toThrow(
				'Invalid custom-fields.json schema'
			);
		});
	});

	describe('Conflict detection and validation', () => {
		beforeEach(() => {
			const configWithConflicts = {
				allowList: ['epic', 'prompt', 'file', 'assignee', 'project-root'],
				allowAdhoc: false,
				blockList: []
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(configWithConflicts));
		});

		it('should detect and filter conflicting fields', () => {
			const config = customFieldsConfig.loadConfig(testProjectRoot);

			// Should have original allow list
			expect(config.allowList).toEqual([
				'epic',
				'prompt',
				'file',
				'assignee',
				'project-root'
			]);

			// But valid fields should exclude conflicts
			const validFields = customFieldsConfig.getValidCustomFields();
			expect(validFields).toEqual(['epic', 'assignee']);
			expect(validFields).not.toContain('prompt');
			expect(validFields).not.toContain('file');
			expect(validFields).not.toContain('project-root'); // kebab-case conflict
		});
	});

	describe('Custom field parsing', () => {
		beforeEach(() => {
			const config = {
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token']
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(config));
			customFieldsConfig.loadConfig(testProjectRoot);
		});

		it('should extract allow-listed fields', () => {
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
			const args = {
				custom: ['url:https://example.com:8080']
			};

			const customFields = customFieldsConfig.parseCustomFields(args);

			expect(customFields).toEqual({
				url: 'https://example.com:8080'
			});
		});

		it('should throw error for block-listed fields', () => {
			const args = {
				custom: ['password:12345']
			};

			expect(() => customFieldsConfig.parseCustomFields(args)).toThrow(
				"Field 'password' is not allowed"
			);
		});
	});

	describe('Configuration caching', () => {
		it('should cache configurations per project', () => {
			const config1 = {
				allowList: ['epic']
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(config1));

			// Load config first time
			const firstLoad = customFieldsConfig.loadConfig(testProjectRoot);
			expect(firstLoad.allowList).toEqual(['epic']);

			// Modify file
			const config2 = {
				allowList: ['component']
			};
			fs.writeFileSync(testConfigPath, JSON.stringify(config2));

			// Load config second time - should use cache
			const secondLoad = customFieldsConfig.loadConfig(testProjectRoot);
			expect(secondLoad.allowList).toEqual(['epic']); // Still cached

			// Clear cache and reload
			customFieldsConfig.clearCache();
			const thirdLoad = customFieldsConfig.loadConfig(testProjectRoot);
			expect(thirdLoad.allowList).toEqual(['component']); // Now updated
		});
	});

	describe('Helper methods', () => {
		beforeEach(() => {
			const config = {
				allowList: ['epic', 'component'],
				allowAdhoc: true,
				blockList: ['password', 'secret']
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(config));
			customFieldsConfig.loadConfig(testProjectRoot);
		});

		it('should check if field is allowed', () => {
			expect(customFieldsConfig.isAllowed('epic')).toBe(true);
			expect(customFieldsConfig.isAllowed('component')).toBe(true);
			expect(customFieldsConfig.isAllowed('custom-field')).toBe(true); // ad-hoc enabled
			expect(customFieldsConfig.isAllowed('password')).toBe(false); // blocked
			expect(customFieldsConfig.isAllowed('secret')).toBe(false); // blocked
		});

		it('should convert kebab-case to camelCase', () => {
			const instance = new CustomFieldsConfig();
			expect(instance.kebabToCamel('project-root')).toBe('projectRoot');
			expect(instance.kebabToCamel('status-notes')).toBe('statusNotes');
			expect(instance.kebabToCamel('priority-level')).toBe('priorityLevel');
			expect(instance.kebabToCamel('epic')).toBe('epic'); // no hyphens
		});
	});

	describe('Integration workflow', () => {
		it('should handle full configuration workflow', () => {
			// Step 1: Load config
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token'],
				description: ''
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(mockConfig));
			const config = customFieldsConfig.loadConfig(testProjectRoot);

			expect(config).toEqual(mockConfig);

			// Step 2: Get valid fields (should filter conflicts)
			const validFields = customFieldsConfig.getValidCustomFields();
			expect(validFields).toEqual(['epic', 'component', 'assignee']);

			// Step 3: Parse fields from CLI args
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

			// Step 4: Check field permissions
			expect(customFieldsConfig.isAllowed('epic')).toBe(true);
			expect(customFieldsConfig.isAllowed('custom-field')).toBe(true);
			expect(customFieldsConfig.isAllowed('password')).toBe(false);
		});
	});
});
