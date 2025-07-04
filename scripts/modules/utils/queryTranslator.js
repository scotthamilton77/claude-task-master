import { z } from 'zod';

// Core field names that are built into TaskMaster
const CORE_FIELDS = [
	'id', 'title', 'description', 'details', 'testStrategy',
	'status', 'priority', 'dependencies', 'subtasks', 'customFields',
	'file', 'projectRoot', 'tag', 'withSubtasks', 'complexityReport'
];

// Reserved field names that cannot be used as custom fields
const RESERVED_FIELD_NAMES = [
	'id', 'title', 'description', 'details', 'testStrategy',
	'status', 'priority', 'dependencies', 'subtasks', 'customFields'
];

/**
 * Translates query parameters into core and custom field filters
 * @param {Object} params - Query parameters
 * @returns {Object} - Translated query with coreFields and customFields
 */
function translateQueryParameters(params) {
	const translated = {
		coreFields: {},
		customFields: {}
	};
	
	Object.entries(params).forEach(([key, value]) => {
		if (CORE_FIELDS.includes(key)) {
			translated.coreFields[key] = value;
		} else {
			translated.customFields[key] = value;
		}
	});
	
	return translated;
}

/**
 * Validates a custom field name
 * @param {string} fieldName - Field name to validate
 * @returns {Object} - Validation result with valid boolean and optional error info
 */
function validateFieldName(fieldName) {
	// Check if it's a reserved/core field
	if (RESERVED_FIELD_NAMES.includes(fieldName)) {
		return { 
			valid: false, 
			reason: 'reserved', 
			suggestion: `Use a different name, '${fieldName}' is a reserved field` 
		};
	}
	
	// Check field name format
	const fieldNameRegex = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;
	if (!fieldNameRegex.test(fieldName)) {
		return { 
			valid: false, 
			reason: 'format', 
			suggestion: 'Field names must start with a letter, underscore, or hyphen, and contain only letters, numbers, underscores, and hyphens' 
		};
	}
	
	return { valid: true };
}

/**
 * Suggests a field name based on input and available fields
 * @param {string} input - Input field name
 * @param {Array} availableFields - Available custom field names
 * @returns {string|null} - Suggested field name or null
 */
function suggestFieldName(input, availableFields) {
	const lowercaseInput = input.toLowerCase();
	
	// Exact match (case-insensitive)
	const exactMatch = availableFields.find(field => field.toLowerCase() === lowercaseInput);
	if (exactMatch) return exactMatch;
	
	// Prefix match
	const prefixMatch = availableFields.find(field => field.toLowerCase().startsWith(lowercaseInput));
	if (prefixMatch) return prefixMatch;
	
	// Contains match
	const containsMatch = availableFields.find(field => field.toLowerCase().includes(lowercaseInput));
	if (containsMatch) return containsMatch;
	
	// Levenshtein distance for close matches
	const closeMatch = availableFields
		.map(field => ({ field, distance: levenshteinDistance(lowercaseInput, field.toLowerCase()) }))
		.filter(({ distance }) => distance <= 2)
		.sort((a, b) => a.distance - b.distance)[0];
	
	return closeMatch ? closeMatch.field : null;
}

/**
 * Simple Levenshtein distance implementation
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(a, b) {
	const matrix = [];
	
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}
	
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1
				);
			}
		}
	}
	
	return matrix[b.length][a.length];
}

/**
 * Filters tasks based on core and custom field criteria
 * @param {Array} tasks - Array of task objects
 * @param {Object} filters - Translated filters object
 * @returns {Array} - Filtered tasks
 */
function filterTasks(tasks, filters) {
	let results = [...tasks];
	
	// Apply core field filters
	Object.entries(filters.coreFields).forEach(([field, value]) => {
		results = results.filter(task => {
			if (field === 'status' && value.includes(',')) {
				// Handle comma-separated status values
				const statuses = value.split(',').map(s => s.trim());
				return statuses.includes(task[field]);
			}
			return task[field] === value || (task[field] && task[field].toString().includes(value));
		});
	});
	
	// Apply custom field filters
	Object.entries(filters.customFields).forEach(([field, value]) => {
		results = results.filter(task => {
			if (!task.customFields || !task.customFields[field]) {
				return false;
			}
			
			if (value.includes(',')) {
				// Handle comma-separated values
				const values = value.split(',').map(v => v.trim());
				return values.includes(task.customFields[field]);
			}
			
			return task.customFields[field] === value || 
				   task.customFields[field].includes(value);
		});
	});
	
	return results;
}

/**
 * Extracts all custom field names from an array of tasks
 * @param {Array} tasks - Array of task objects
 * @returns {Array} - Array of unique custom field names
 */
function extractCustomFieldNames(tasks) {
	const fieldNames = new Set();
	
	tasks.forEach(task => {
		if (task.customFields) {
			Object.keys(task.customFields).forEach(field => fieldNames.add(field));
		}
		
		// Also check subtasks
		if (task.subtasks) {
			task.subtasks.forEach(subtask => {
				if (subtask.customFields) {
					Object.keys(subtask.customFields).forEach(field => fieldNames.add(field));
				}
			});
		}
	});
	
	return Array.from(fieldNames);
}

/**
 * Main query function that combines translation and filtering
 * @param {Array} tasks - Array of task objects
 * @param {Object} params - Query parameters
 * @returns {Array} - Filtered tasks
 */
function queryTasks(tasks, params) {
	const filters = translateQueryParameters(params);
	return filterTasks(tasks, filters);
}

/**
 * Validates query parameters and provides helpful error messages
 * @param {Object} params - Query parameters
 * @param {Array} availableCustomFields - Available custom field names
 * @returns {Object} - Validation result
 */
function validateQueryParameters(params, availableCustomFields) {
	const errors = [];
	const warnings = [];
	const suggestions = [];
	
	const { coreFields, customFields } = translateQueryParameters(params);
	
	// Validate custom field names
	Object.keys(customFields).forEach(fieldName => {
		const validation = validateFieldName(fieldName);
		if (!validation.valid) {
			if (validation.reason === 'reserved') {
				errors.push(`Field '${fieldName}' is reserved and cannot be used as a custom field`);
			} else {
				errors.push(`Invalid field name format: '${fieldName}'. ${validation.suggestion}`);
			}
		} else if (!availableCustomFields.includes(fieldName)) {
			// Field name is valid but doesn't exist in data
			const suggestion = suggestFieldName(fieldName, availableCustomFields);
			if (suggestion) {
				warnings.push(`Custom field '${fieldName}' not found`);
				suggestions.push(`Did you mean '${suggestion}'?`);
			} else {
				warnings.push(`Custom field '${fieldName}' not found in any tasks`);
			}
		}
	});
	
	return {
		valid: errors.length === 0,
		errors,
		warnings,
		suggestions
	};
}

export {
	translateQueryParameters,
	validateFieldName,
	suggestFieldName,
	filterTasks,
	extractCustomFieldNames,
	queryTasks,
	validateQueryParameters,
	CORE_FIELDS,
	RESERVED_FIELD_NAMES
};