import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CustomFieldsConfig } from '../../scripts/modules/utils/customFieldsConfig.js';
import { CustomFieldsParser } from '../../scripts/modules/utils/customFieldsParser.js';

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

	describe('Configuration loading with file system', () => {
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

	describe('Constructor injection vs file system', () => {
		it('should prioritize preloaded config over file system', () => {
			// Write config to file system
			const fileConfig = {
				allowList: ['from-file'],
				allowAdhoc: false
			};
			fs.writeFileSync(testConfigPath, JSON.stringify(fileConfig));

			// Create instance with preloaded config
			const preloadedConfig = {
				allowList: ['from-constructor'],
				allowAdhoc: true
			};
			const configWithPreload = new CustomFieldsConfig(preloadedConfig);

			// Load config - should use preloaded, not file
			const config = configWithPreload.loadConfig(testProjectRoot);

			expect(config.allowList).toEqual(['from-constructor']);
			expect(config.allowAdhoc).toBe(true);
			expect(configWithPreload.getValidCustomFields()).toEqual(['from-constructor']);
		});

		it('should fall back to file system when no preloaded config', () => {
			const fileConfig = {
				allowList: ['from-file'],
				allowAdhoc: true
			};
			fs.writeFileSync(testConfigPath, JSON.stringify(fileConfig));

			// Create instance without preloaded config
			const config = customFieldsConfig.loadConfig(testProjectRoot);

			expect(config.allowList).toEqual(['from-file']);
			expect(config.allowAdhoc).toBe(true);
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

	describe('Custom field parsing with file-based config', () => {
		beforeEach(() => {
			const config = {
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token']
			};

			fs.writeFileSync(testConfigPath, JSON.stringify(config));
			customFieldsConfig.loadConfig(testProjectRoot);
		});

		it('should extract allow-listed fields using parser', () => {
			const parser = customFieldsConfig.createParser();
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

		it('should handle ad-hoc fields when enabled using parser', () => {
			const parser = customFieldsConfig.createParser();
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

		it('should handle custom: prefix fields using parser', () => {
			const parser = customFieldsConfig.createParser();
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

		it('should handle values with colons in ad-hoc fields', () => {
			const parser = customFieldsConfig.createParser();
			const args = {
				custom: ['url:https://example.com:8080']
			};

			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({
				url: 'https://example.com:8080'
			});
		});

		it('should throw error for block-listed fields', () => {
			const parser = customFieldsConfig.createParser();
			const args = {
				custom: ['password:12345']
			};

			expect(() => parser.parseCustomFields(args)).toThrow(
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

		it('should cache different configs for different project roots', () => {
			// Create second test directory
			const testProjectRoot2 = path.join(__dirname, '../fixtures/test-project2');
			const testConfigPath2 = path.join(
				testProjectRoot2,
				'.taskmaster',
				'custom-fields.json'
			);
			fs.mkdirSync(path.dirname(testConfigPath2), { recursive: true });

			try {
				// Write different configs
				fs.writeFileSync(testConfigPath, JSON.stringify({ allowList: ['epic'] }));
				fs.writeFileSync(testConfigPath2, JSON.stringify({ allowList: ['component'] }));

				// Load both configs
				const config1 = customFieldsConfig.loadConfig(testProjectRoot);
				const config2 = customFieldsConfig.loadConfig(testProjectRoot2);

				expect(config1.allowList).toEqual(['epic']);
				expect(config2.allowList).toEqual(['component']);

				// Both should be cached
				expect(customFieldsConfig.cache.size).toBe(2);

			} finally {
				// Clean up second test directory
				if (fs.existsSync(testConfigPath2)) {
					fs.unlinkSync(testConfigPath2);
				}
				if (fs.existsSync(path.dirname(testConfigPath2))) {
					fs.rmdirSync(path.dirname(testConfigPath2), { recursive: true });
				}
			}
		});
	});

	describe('Helper methods with file-based config', () => {
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

	describe('Mixed constructor injection and file system workflow', () => {
		it('should handle full configuration workflow with constructor injection', () => {
			// Test with preloaded config (no file system)
			const mockConfig = {
				version: '1.0',
				allowList: ['epic', 'component', 'assignee'],
				allowAdhoc: true,
				blockList: ['password', 'token']
			};

			const configWithPreload = new CustomFieldsConfig(mockConfig);
			const config = configWithPreload.loadConfig('/any/path'); // Path doesn't matter with preload

			expect(config).toEqual(mockConfig);

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

		it('should handle full configuration workflow with file system', () => {
			// Test with file system config
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

			// Get valid fields (should filter conflicts automatically)
			const validFields = customFieldsConfig.getValidCustomFields();
			expect(validFields).toEqual(['epic', 'component', 'assignee']);

			// Parse fields using the parser
			const parser = customFieldsConfig.createParser();
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
			expect(customFieldsConfig.isAllowed('epic')).toBe(true);
			expect(customFieldsConfig.isAllowed('custom-field')).toBe(true);
			expect(customFieldsConfig.isAllowed('password')).toBe(false);
		});

		it('should work with different instances for different test scenarios', () => {
			// Test isolation between instances
			const config1 = new CustomFieldsConfig({ allowList: ['epic'] });
			const config2 = new CustomFieldsConfig({ allowList: ['component'] });

			config1.loadConfig('/path1');
			config2.loadConfig('/path2');

			expect(config1.getValidCustomFields()).toEqual(['epic']);
			expect(config2.getValidCustomFields()).toEqual(['component']);

			// They should be independent
			expect(config1.getCurrentConfig().allowList).toEqual(['epic']);
			expect(config2.getCurrentConfig().allowList).toEqual(['component']);
		});
	});

	describe('Parser integration with different configs', () => {
		it('should work with parser created from file-based config', () => {
			const fileConfig = {
				allowList: ['epic'],
				allowAdhoc: false
			};
			fs.writeFileSync(testConfigPath, JSON.stringify(fileConfig));
			customFieldsConfig.loadConfig(testProjectRoot);

			const parser = customFieldsConfig.createParser();
			const args = { epic: 'EPIC-123', custom: ['ignored:value'] };
			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({ epic: 'EPIC-123' }); // custom ignored due to allowAdhoc: false
		});

		it('should work with parser created from constructor-injected config', () => {
			const injectedConfig = {
				allowList: ['component'],
				allowAdhoc: true
			};
			const configWithPreload = new CustomFieldsConfig(injectedConfig);
			configWithPreload.loadConfig('/any/path');

			const parser = configWithPreload.createParser();
			const args = { component: 'auth', custom: ['priority:high'] };
			const customFields = parser.parseCustomFields(args);

			expect(customFields).toEqual({ 
				component: 'auth',
				priority: 'high'
			}); // custom processed due to allowAdhoc: true
		});
	});
});