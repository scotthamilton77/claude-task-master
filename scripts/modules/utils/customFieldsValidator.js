/**
 * customFieldsValidator.js
 * 
 * Shared validation utilities for custom fields across TaskMaster.
 * This module provides centralized validation logic to ensure consistency
 * and reduce code duplication across task creation, updating, and querying operations.
 * 
 * @fileoverview Custom fields validation utilities
 * @author TaskMaster AI Enhancement
 * @since 0.18.1
 */

import { z } from 'zod';

/**
 * Zod schema for custom fields validation
 * Ensures all custom field values are strings and the object structure is valid
 */
export const CustomFieldsSchema = z.record(z.string()).optional().default({});

/**
 * Reserved field names that cannot be used as custom fields
 * These are core TaskMaster fields that must not be overridden
 */
export const RESERVED_FIELD_NAMES = [
	'id', 'title', 'description', 'details', 'testStrategy',
	'status', 'priority', 'dependencies', 'subtasks', 'customFields',
	'parentTaskId' // Additional reserved field for subtasks
];

/**
 * Regular expression for valid custom field names
 * Field names must:
 * - Start with a letter, underscore, or hyphen
 * - Contain only letters, numbers, underscores, and hyphens
 * - Be at least 1 character long
 */
export const FIELD_NAME_REGEX = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;

/**
 * Validates and parses custom fields using Zod schema
 * 
 * @param {Object} customFields - Raw custom fields object
 * @returns {Object} Validated custom fields object
 * @throws {Error} If validation fails
 */
export function validateCustomFieldsSchema(customFields) {
	try {
		return CustomFieldsSchema.parse(customFields);
	} catch (error) {
		throw new Error(`Custom fields schema validation failed: ${error.message}`);
	}
}

/**
 * Validates custom field names against reserved words and format requirements
 * 
 * @param {Object} customFields - Custom fields object to validate
 * @returns {Object} Validation result
 * @returns {boolean} result.isValid - Whether all field names are valid
 * @returns {string[]} result.reservedErrors - List of reserved field name errors
 * @returns {string[]} result.formatErrors - List of format validation errors
 * @returns {string} result.errorMessage - Combined error message if validation fails
 */
export function validateCustomFieldNames(customFields) {
	const fieldNames = Object.keys(customFields);
	const reservedErrors = [];
	const formatErrors = [];
	
	fieldNames.forEach(fieldName => {
		// Check for reserved field names
		if (RESERVED_FIELD_NAMES.includes(fieldName)) {
			reservedErrors.push(fieldName);
		}
		
		// Check field name format
		if (!FIELD_NAME_REGEX.test(fieldName)) {
			formatErrors.push(fieldName);
		}
	});
	
	const isValid = reservedErrors.length === 0 && formatErrors.length === 0;
	let errorMessage = '';
	
	if (!isValid) {
		const errors = [];
		
		if (reservedErrors.length > 0) {
			errors.push(`Invalid custom field names (reserved): ${reservedErrors.join(', ')}`);
		}
		
		if (formatErrors.length > 0) {
			errors.push(`Invalid custom field name format: ${formatErrors.join(', ')}. Field names must start with a letter, underscore, or hyphen, and contain only letters, numbers, underscores, and hyphens.`);
		}
		
		errorMessage = errors.join('; ');
	}
	
	return {
		isValid,
		reservedErrors,
		formatErrors,
		errorMessage
	};
}

/**
 * Complete validation of custom fields including schema and name validation
 * This is the main validation function that should be used in most cases
 * 
 * @param {Object} customFields - Custom fields object to validate
 * @returns {Object} Validated custom fields object
 * @throws {Error} If any validation fails
 */
export function validateCustomFields(customFields) {
	// First validate the schema
	const validatedFields = validateCustomFieldsSchema(customFields);
	
	// Then validate field names
	const nameValidation = validateCustomFieldNames(validatedFields);
	
	if (!nameValidation.isValid) {
		throw new Error(nameValidation.errorMessage);
	}
	
	return validatedFields;
}

/**
 * Validates custom fields and logs the validation process
 * Useful for functions that need to log validation steps
 * 
 * @param {Object} customFields - Custom fields object to validate
 * @param {Function} logFn - Logging function that accepts (level, message)
 * @returns {Object} Validated custom fields object
 * @throws {Error} If validation fails
 */
export function validateCustomFieldsWithLogging(customFields, logFn) {
	if (Object.keys(customFields).length > 0) {
		logFn('info', `Validating custom fields: ${JSON.stringify(customFields)}`);
	}
	
	try {
		const validatedFields = validateCustomFields(customFields);
		
		if (Object.keys(validatedFields).length > 0) {
			logFn('info', `Custom fields validation successful: ${JSON.stringify(validatedFields)}`);
		}
		
		return validatedFields;
	} catch (error) {
		logFn('error', `Custom fields validation failed: ${error.message}`);
		throw error;
	}
}

/**
 * Ensures an object has a customFields property with an empty object default
 * Used for backward compatibility when reading existing tasks/subtasks
 * 
 * @param {Object} item - Task or subtask object
 * @returns {Object} Item with guaranteed customFields property
 */
export function ensureCustomFields(item) {
	return {
		...item,
		customFields: item.customFields || {}
	};
}

/**
 * Recursively ensures customFields on tasks and their subtasks
 * Used for backward compatibility during data migration
 * 
 * @param {Object[]} tasks - Array of task objects
 * @returns {Object[]} Tasks with ensured customFields
 */
export function ensureCustomFieldsOnTasks(tasks) {
	return tasks.map(task => ({
		...ensureCustomFields(task),
		subtasks: task.subtasks ? task.subtasks.map(ensureCustomFields) : (task.subtasks || [])
	}));
}

/**
 * Type guard to check if an object has valid custom fields
 * 
 * @param {any} obj - Object to check
 * @returns {boolean} True if object has valid customFields property
 */
export function hasCustomFields(obj) {
	return obj && typeof obj === 'object' && typeof obj.customFields === 'object';
}

/**
 * Extracts custom field names from an array of tasks (including subtasks)
 * Useful for understanding what custom fields are available in a dataset
 * 
 * @param {Object[]} tasks - Array of task objects
 * @returns {string[]} Array of unique custom field names
 */
export function extractCustomFieldNames(tasks) {
	const fieldNames = new Set();
	
	tasks.forEach(task => {
		if (hasCustomFields(task)) {
			Object.keys(task.customFields).forEach(field => fieldNames.add(field));
		}
		
		if (task.subtasks) {
			task.subtasks.forEach(subtask => {
				if (hasCustomFields(subtask)) {
					Object.keys(subtask.customFields).forEach(field => fieldNames.add(field));
				}
			});
		}
	});
	
	return Array.from(fieldNames);
}

/**
 * Creates a summary of custom field usage across tasks
 * Useful for analytics and debugging
 * 
 * @param {Object[]} tasks - Array of task objects
 * @returns {Object} Summary object with field usage statistics
 */
export function createCustomFieldsSummary(tasks) {
	const fieldCounts = new Map();
	let tasksWithCustomFields = 0;
	let subtasksWithCustomFields = 0;
	
	tasks.forEach(task => {
		if (hasCustomFields(task) && Object.keys(task.customFields).length > 0) {
			tasksWithCustomFields++;
			Object.keys(task.customFields).forEach(field => {
				fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
			});
		}
		
		if (task.subtasks) {
			task.subtasks.forEach(subtask => {
				if (hasCustomFields(subtask) && Object.keys(subtask.customFields).length > 0) {
					subtasksWithCustomFields++;
					Object.keys(subtask.customFields).forEach(field => {
						fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
					});
				}
			});
		}
	});
	
	return {
		totalTasks: tasks.length,
		tasksWithCustomFields,
		subtasksWithCustomFields,
		uniqueFieldNames: Array.from(fieldCounts.keys()),
		fieldUsageCounts: Object.fromEntries(fieldCounts),
		mostUsedField: fieldCounts.size > 0 ? 
			Array.from(fieldCounts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0] : null
	};
}