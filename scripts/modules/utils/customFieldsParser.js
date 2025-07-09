/**
 * customFieldsParser.js
 * Parser for custom fields from CLI/MCP arguments
 */

/**
 * CustomFieldsParser class for parsing custom fields from command arguments
 * Works with a CustomFieldsConfig instance to validate and extract custom fields
 */
class CustomFieldsParser {
	/**
	 * Constructor
	 * @param {CustomFieldsConfig} config - CustomFieldsConfig instance for validation
	 */
	constructor(config) {
		if (!config) {
			throw new Error('CustomFieldsConfig instance is required');
		}
		this.config = config;
	}

	/**
	 * Parse custom fields from command arguments
	 * @param {Object} args - Command arguments object
	 * @returns {Object} Extracted custom fields object
	 */
	parseCustomFields(args) {
		if (!args || typeof args !== 'object') {
			return {};
		}

		// Get current project's configuration (must be loaded first)
		const config = this.config.getCurrentConfig();
		if (!config) {
			return {};
		}

		const customFields = {};

		// Extract allow-listed fields directly from args (excluding conflicts)
		const validFields = this.config.getValidCustomFields();
		for (const field of validFields) {
			if (args[field] !== undefined) {
				customFields[field] = args[field];
			}
		}

		// Extract ad-hoc fields if enabled
		if (config.allowAdhoc) {
			// Handle --custom:fieldname format
			for (const [key, value] of Object.entries(args)) {
				if (key.startsWith('custom:')) {
					const fieldName = key.substring(7); // Remove 'custom:' prefix

					// Skip empty field names
					if (!fieldName || fieldName.trim() === '') {
						continue;
					}

					// Check if field is blocked
					if (config.blockList.includes(fieldName)) {
						throw new Error(
							`Field '${fieldName}' is not allowed`
						);
					}

					customFields[fieldName] = value;
				}
			}

			// Handle --custom field:value format (legacy)
			if (args.custom) {
				const customArgs = Array.isArray(args.custom) ? args.custom : [args.custom];
				for (const customArg of customArgs) {
					const [fieldName, ...valueParts] = customArg.split(':');
					const value = valueParts.join(':'); // Handle values with colons

					// Skip empty field names
					if (!fieldName || fieldName.trim() === '') {
						continue;
					}

					// Check if field is blocked
					if (config.blockList.includes(fieldName)) {
						throw new Error(
							`Field '${fieldName}' is not allowed`
						);
					}

					customFields[fieldName] = value;
				}
			}
		}

		return customFields;
	}

	/**
	 * Parse a single custom field argument
	 * @param {string} argument - Single argument string in format "field:value"
	 * @returns {Object} Object with fieldName and value properties
	 */
	parseArgument(argument) {
		if (!argument || typeof argument !== 'string') {
			return { fieldName: null, value: null };
		}

		const [fieldName, ...valueParts] = argument.split(':');
		const value = valueParts.join(':'); // Handle values with colons

		return {
			fieldName: fieldName && fieldName.trim() !== '' ? fieldName.trim() : null,
			value: value || ''
		};
	}

	/**
	 * Validate a field name for custom field usage
	 * @param {string} fieldName - Field name to validate
	 * @returns {Object} Validation result with isValid and reason properties
	 */
	validateFieldName(fieldName) {
		if (!fieldName || typeof fieldName !== 'string') {
			return { isValid: false, reason: 'Field name must be a non-empty string' };
		}

		const trimmedName = fieldName.trim();
		if (trimmedName === '') {
			return { isValid: false, reason: 'Field name cannot be empty' };
		}

		const config = this.config.getCurrentConfig();
		if (!config) {
			return { isValid: false, reason: 'No configuration loaded' };
		}

		// Check if field is blocked
		if (config.blockList.includes(trimmedName)) {
			return { isValid: false, reason: `Field '${trimmedName}' is blocked` };
		}

		// Check if field is allowed
		if (!this.config.isFieldAllowed(trimmedName)) {
			return { isValid: false, reason: `Field '${trimmedName}' is not allowed` };
		}

		return { isValid: true, reason: null };
	}

	/**
	 * Extract custom fields from args object using custom: prefix
	 * @param {Object} args - Command arguments object
	 * @returns {Object} Extracted custom fields object
	 */
	extractCustomPrefixFields(args) {
		if (!args || typeof args !== 'object') {
			return {};
		}

		const customFields = {};

		// Handle --custom:fieldname format
		for (const [key, value] of Object.entries(args)) {
			if (key.startsWith('custom:')) {
				const fieldName = key.substring(7); // Remove 'custom:' prefix

				// Skip empty field names
				if (!fieldName || fieldName.trim() === '') {
					continue;
				}

				// Validate field name
				const validation = this.validateFieldName(fieldName);
				if (!validation.isValid) {
					throw new Error(validation.reason);
				}

				customFields[fieldName] = value;
			}
		}

		return customFields;
	}

	/**
	 * Extract custom fields from legacy --custom format
	 * @param {Object} args - Command arguments object
	 * @returns {Object} Extracted custom fields object
	 */
	extractLegacyCustomFields(args) {
		if (!args || typeof args !== 'object' || !args.custom) {
			return {};
		}

		const customFields = {};
		const customArgs = Array.isArray(args.custom) ? args.custom : [args.custom];

		for (const customArg of customArgs) {
			const parsed = this.parseArgument(customArg);
			
			if (!parsed.fieldName) {
				continue;
			}

			// Validate field name
			const validation = this.validateFieldName(parsed.fieldName);
			if (!validation.isValid) {
				throw new Error(validation.reason);
			}

			customFields[parsed.fieldName] = parsed.value;
		}

		return customFields;
	}

	/**
	 * Extract allow-listed fields directly from args
	 * @param {Object} args - Command arguments object
	 * @returns {Object} Extracted custom fields object
	 */
	extractAllowListedFields(args) {
		if (!args || typeof args !== 'object') {
			return {};
		}

		const customFields = {};
		const validFields = this.config.getValidCustomFields();

		for (const field of validFields) {
			if (args[field] !== undefined) {
				customFields[field] = args[field];
			}
		}

		return customFields;
	}

	/**
	 * Convert kebab-case to camelCase
	 * @param {string} str - String to convert
	 * @returns {string} Converted string
	 */
	kebabToCamel(str) {
		return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
	}
}

export { CustomFieldsParser };