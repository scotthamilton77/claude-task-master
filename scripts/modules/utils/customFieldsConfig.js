/**
 * customFieldsConfig.js
 * Instance-based custom fields configuration service
 * 
 * This module provides a CustomFieldsConfig class that manages project-specific
 * custom field configurations. Each instance operates independently with its own
 * cache and configuration state.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { CustomFieldsParser } from './customFieldsParser.js';

/**
 * Core parameters that cannot be used as custom field names
 */
const CORE_PARAMETERS = [
	'help',
	'version',
	'silent',
	'debug',
	'config',
	'force',
	'yes',
	'no',
	'id',
	'prompt',
	'title',
	'description',
	'details',
	'status',
	'priority',
	'dependencies',
	'file',
	'projectRoot',
	'research',
	'append',
	'output',
	'tag',
	'from',
	'to',
	'num',
	'maxResults',
	'withSubtasks',
	'all',
	'testStrategy',
	'subtasks',
	'customFields',
	'parentTaskId'
];

/**
 * CustomFieldsConfig class for managing project-specific custom field configurations.
 * 
 * This class uses an instance-based approach where each instance maintains its own
 * configuration state and cache. This design improves testability and prevents
 * state sharing between different operations.
 * 
 * @example
 * // For production use
 * const config = new CustomFieldsConfig();
 * config.loadConfig('/path/to/project');
 * 
 * @example
 * // For testing with custom configuration
 * const testConfig = { allowList: ['epic'], allowAdhoc: false };
 * const config = new CustomFieldsConfig(testConfig);
 */
class CustomFieldsConfig {
	/**
	 * Constructor
	 * @param {Object|null} preloadedConfig - Optional pre-loaded configuration object for testing
	 */
	constructor(preloadedConfig = null) {
		this.cache = new Map();
		this.preloadedConfig = preloadedConfig;
		this.defaultConfig = {
			version: '1.0',
			allowList: [],
			allowAdhoc: false,
			blockList: [],
			description: ''
		};
	}

	/**
	 * Load configuration from custom-fields.json or use preloaded config
	 * @param {string} projectRoot - Project root directory
	 * @returns {Object} Configuration object
	 */
	loadConfig(projectRoot) {
		if (!projectRoot || typeof projectRoot !== 'string') {
			throw new Error('Project root must be a valid string path');
		}

		// Check cache first
		const cacheKey = path.resolve(projectRoot);
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey);
		}

		const configPath = path.join(
			projectRoot,
			'.taskmaster',
			'custom-fields.json'
		);
		let config;

		try {
			// Use preloaded config if provided (for testing)
			if (this.preloadedConfig) {
				// Merge with defaults
				config = { ...this.defaultConfig, ...this.preloadedConfig };
				console.log('[INFO] Using preloaded custom fields configuration');
			} else {
				if (fs.existsSync(configPath)) {
					const configContent = fs.readFileSync(configPath, 'utf8');
					let parsedConfig;
					
					try {
						parsedConfig = JSON.parse(configContent);
					} catch (jsonError) {
						throw new Error('Invalid JSON in custom-fields.json');
					}

					// Basic schema validation
					if (typeof parsedConfig !== 'object' || parsedConfig === null) {
						throw new Error('Invalid custom-fields.json schema');
					}
					
					if (parsedConfig.allowList !== undefined && !Array.isArray(parsedConfig.allowList)) {
						throw new Error('Invalid custom-fields.json schema');
					}
					
					if (parsedConfig.blockList !== undefined && !Array.isArray(parsedConfig.blockList)) {
						throw new Error('Invalid custom-fields.json schema');
					}
					
					if (parsedConfig.allowAdhoc !== undefined && typeof parsedConfig.allowAdhoc !== 'boolean') {
						throw new Error('Invalid custom-fields.json schema');
					}

					// Merge with defaults
					config = { ...this.defaultConfig, ...parsedConfig };

					console.log(
						`[INFO] Loaded custom fields configuration from ${configPath}`
					);
				} else {
					// No config file - use defaults (no custom fields allowed)
					config = { ...this.defaultConfig };
				}
			}

			// Validate allow-list for conflicts (but don't modify the original list)
			const { validFields, conflictingFields } = this.validateAllowList(
				config.allowList
			);

			if (conflictingFields.length > 0) {
				console.log(
					`[WARN] ⚠️  Custom fields conflict with core parameters: ${conflictingFields.join(', ')}`
				);
				console.log(
					`[WARN]    These fields will only be accessible via --custom:* syntax`
				);
			}

			// Validate block-list for conflicts
			const { validFields: validBlockFields, conflictingFields: conflictingBlockFields } = this.validateBlockList(
				config.blockList
			);
			config.blockList = validBlockFields;

			if (conflictingBlockFields.length > 0) {
				console.log(
					`[WARN] ⚠️  Block list contains core parameters: ${conflictingBlockFields.join(', ')}`
				);
				console.log(
					`[WARN]    These entries are redundant (core parameters are already blocked)`
				);
			}

			// Log configuration summary
			if (config.allowList.length > 0) {
				console.log(
					`[INFO] Allow-listed custom fields: ${config.allowList.join(', ')}`
				);
			}
			if (config.allowAdhoc) {
				console.log(
					`[INFO] Ad-hoc custom fields enabled via --custom:* syntax`
				);
			}
			if (config.blockList.length > 0) {
				console.log(
					`[INFO] Blocked custom fields: ${config.blockList.join(', ')}`
				);
			}

			// Cache the result
			this.cache.set(cacheKey, config);
			return config;
		} catch (error) {
			throw new Error(
				`Failed to load custom fields configuration: ${error.message}`
			);
		}
	}

	/**
	 * Validate allow-list fields against core parameters
	 * @param {string[]} allowList - Array of custom field names
	 * @param {string[]} coreParameters - Array of core parameter names
	 * @returns {Object} Object with validFields and conflictingFields arrays
	 */
	validateAllowList(allowList = [], coreParameters = null) {
		// Use instance core parameters if not provided
		if (!coreParameters) {
			coreParameters = this.coreParameters || CORE_PARAMETERS;
		}
		const validFields = [];
		const conflictingFields = [];

		// Ensure allowList is an array
		if (!Array.isArray(allowList)) {
			return { validFields: [], conflictingFields: [] };
		}

		for (const field of allowList) {
			// Check for direct conflicts
			if (coreParameters && coreParameters.includes(field)) {
				conflictingFields.push(field);
			} 
			// Check for kebab-case to camelCase conflicts
			else if (coreParameters && coreParameters.includes(this.kebabToCamel(field))) {
				conflictingFields.push(field);
			} else {
				validFields.push(field);
			}
		}

		return { validFields, conflictingFields };
	}

	/**
	 * Validate block-list fields against core parameters
	 * @param {string[]} blockList - Array of custom field names to block
	 * @param {string[]} coreParameters - Array of core parameter names
	 * @returns {Object} Object with validFields and conflictingFields arrays
	 */
	validateBlockList(blockList = [], coreParameters = null) {
		// Use instance core parameters if not provided
		if (!coreParameters) {
			coreParameters = this.coreParameters || CORE_PARAMETERS;
		}
		const validFields = [];
		const conflictingFields = [];

		// Ensure blockList is an array
		if (!Array.isArray(blockList)) {
			return { validFields: [], conflictingFields: [] };
		}

		for (const field of blockList) {
			if (coreParameters && coreParameters.includes(field)) {
				conflictingFields.push(field);
			} else {
				validFields.push(field);
			}
		}

		return { validFields, conflictingFields };
	}

	/**
	 * Create a parser instance for this configuration
	 * @returns {CustomFieldsParser} Parser instance
	 */
	createParser() {
		return new CustomFieldsParser(this);
	}

	/**
	 * Parse custom fields from command arguments (backward compatibility method)
	 * @param {Object} args - Command arguments object
	 * @returns {Object} Extracted custom fields object
	 * @deprecated Use createParser().parseCustomFields() instead
	 */
	parseCustomFields(args) {
		const parser = this.createParser();
		return parser.parseCustomFields(args);
	}

	/**
	 * Get the current loaded configuration (helper method)
	 * @returns {Object|null} Current configuration or null if none loaded
	 */
	getCurrentConfig() {
		// Return the first cached configuration (there should typically be only one in use)
		const configs = Array.from(this.cache.values());
		return configs.length > 0 ? configs[0] : null;
	}

	/**
	 * Get valid custom fields from current configuration
	 * @returns {string[]} Array of valid custom field names
	 */
	getValidCustomFields() {
		const config = this.getCurrentConfig();
		if (!config) return [];
		
		// Filter out conflicts with core parameters
		const { validFields } = this.validateAllowList(config.allowList || []);
		return validFields;
	}

	/**
	 * Generate MCP schema with custom fields
	 * @param {Object} baseSchema - Base Zod schema object
	 * @param {string[]} validCustomFields - Array of valid custom field names
	 * @returns {Object} Extended schema with custom fields
	 */
	generateMcpSchema(baseSchema, validCustomFields = []) {
		// If no custom fields, return base schema with passthrough for ad-hoc fields
		if (!validCustomFields || validCustomFields.length === 0) {
			return baseSchema.passthrough();
		}

		// Use the imported z from top of file

		// Create an object of custom field schemas
		const customFieldSchemas = {};
		validCustomFields.forEach((field) => {
			customFieldSchemas[field] = z
				.string()
				.optional()
				.describe(`Custom field: ${field}`);
		});

		// Extend the base schema with custom fields
		const extendedSchema = baseSchema.extend(customFieldSchemas);

		// Add passthrough to allow ad-hoc fields if configured
		const config = this.getCurrentConfig();
		if (config && config.allowAdhoc) {
			return extendedSchema.passthrough();
		}

		return extendedSchema;
	}

	/**
	 * Check if a field name is allowed as a custom field
	 * @param {string} fieldName - Field name to check
	 * @returns {boolean} True if field is allowed
	 */
	isFieldAllowed(fieldName) {
		const config = this.getCurrentConfig();
		if (!config) return false;

		// Check if it's in the allow-list
		if (config.allowList.includes(fieldName)) {
			return true;
		}

		// Check if ad-hoc is enabled and field is not blocked
		if (config.allowAdhoc && !config.blockList.includes(fieldName)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if a field name is allowed as a custom field (alias for isFieldAllowed)
	 * @param {string} fieldName - Field name to check
	 * @returns {boolean} True if field is allowed
	 */
	isAllowed(fieldName) {
		return this.isFieldAllowed(fieldName);
	}

	/**
	 * Clear configuration cache
	 */
	clearCache() {
		this.cache.clear();
	}

	/**
	 * Convert kebab-case to camelCase (helper method)
	 * @param {string} str - String to convert
	 * @returns {string} Converted string
	 */
	kebabToCamel(str) {
		return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
	}
}

export { CORE_PARAMETERS, CustomFieldsConfig };
