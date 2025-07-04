/**
 * backwardCompatibility.js
 *
 * Utilities for maintaining backward compatibility when reading and processing
 * tasks data, particularly for ensuring customFields are present on all tasks and subtasks.
 *
 * This module centralizes backward compatibility logic to reduce code duplication
 * and ensure consistent handling across the application.
 *
 * @fileoverview Backward compatibility utilities for tasks data
 * @author TaskMaster AI Enhancement
 * @since 0.18.1
 */

import { ensureCustomFieldsOnTasks } from './customFieldsValidator.js';

/**
 * Ensures backward compatibility for tasks by adding customFields where missing
 * This function processes task data to guarantee all tasks and subtasks have
 * a customFields property, even if it's an empty object.
 *
 * @param {Object[]} tasks - Array of task objects
 * @returns {Object[]} Tasks with ensured customFields
 */
export function ensureTasksBackwardCompatibility(tasks) {
	return ensureCustomFieldsOnTasks(tasks);
}

/**
 * Processes tag data to ensure backward compatibility
 * Handles both individual tag data and full tagged data structures
 *
 * @param {Object} tagData - Tag data object containing tasks array
 * @returns {Object} Tag data with backward compatibility ensured
 */
export function ensureTagDataBackwardCompatibility(tagData) {
	if (!tagData || !tagData.tasks) {
		return tagData;
	}

	return {
		...tagData,
		tasks: ensureTasksBackwardCompatibility(tagData.tasks)
	};
}

/**
 * Legacy format migration helper
 * Converts old task format to new tagged format with customFields support
 *
 * @param {Object} legacyData - Legacy tasks data with tasks array at root
 * @returns {Object} Migrated data in tagged format with customFields
 */
export function migrateLegacyFormatWithCustomFields(legacyData) {
	// Ensure all tasks have customFields for backward compatibility
	const tasksWithCustomFields = ensureTasksBackwardCompatibility(
		legacyData.tasks
	);

	return {
		master: {
			tasks: tasksWithCustomFields,
			metadata: legacyData.metadata || {
				created: new Date().toISOString(),
				updated: new Date().toISOString(),
				description: 'Tasks for master context'
			}
		}
	};
}

/**
 * Processes raw data to ensure backward compatibility across all scenarios
 * This is the main function that should be used when processing any tasks data
 *
 * @param {Object} data - Raw data that may need backward compatibility processing
 * @param {boolean} isLegacyFormat - Whether the data is in legacy format
 * @returns {Object} Data with backward compatibility ensured
 */
export function ensureDataBackwardCompatibility(data, isLegacyFormat = false) {
	if (!data) {
		return data;
	}

	if (isLegacyFormat) {
		return migrateLegacyFormatWithCustomFields(data);
	}

	// Handle tagged format - process each tag's data
	const processedData = {};

	for (const tagName in data) {
		if (
			Object.prototype.hasOwnProperty.call(data, tagName) &&
			typeof data[tagName] === 'object' &&
			data[tagName].tasks
		) {
			processedData[tagName] = ensureTagDataBackwardCompatibility(
				data[tagName]
			);
		} else {
			// Non-tag data, preserve as-is
			processedData[tagName] = data[tagName];
		}
	}

	return processedData;
}

/**
 * Checks if data is in legacy format (tasks array at root level)
 *
 * @param {Object} data - Data to check
 * @returns {boolean} True if data appears to be in legacy format
 */
export function isLegacyFormat(data) {
	return (
		data &&
		Array.isArray(data.tasks) &&
		!data._rawTaggedData &&
		!hasTaggedStructure(data)
	);
}

/**
 * Checks if data has a tagged structure
 * Helper function to determine if data is already in tagged format
 *
 * @param {Object} data - Data to check
 * @returns {boolean} True if data has tagged structure
 */
function hasTaggedStructure(data) {
	if (!data || typeof data !== 'object') {
		return false;
	}

	// Check if any properties look like tag structures
	for (const key in data) {
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			const value = data[key];
			if (value && typeof value === 'object' && Array.isArray(value.tasks)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Creates a result object with backward compatibility applied
 * Used when returning data from readJSON operations
 *
 * @param {Object} tagData - Tag data to process
 * @param {string} resolvedTag - The resolved tag name
 * @param {Object} originalTaggedData - Original raw tagged data
 * @returns {Object} Result object with backward compatibility
 */
export function createBackwardCompatibleResult(
	tagData,
	resolvedTag,
	originalTaggedData
) {
	const compatibleTagData = ensureTagDataBackwardCompatibility(tagData);

	return {
		...compatibleTagData,
		tag: resolvedTag,
		_rawTaggedData: originalTaggedData
	};
}

/**
 * Processes master data fallback with backward compatibility
 * Used when a specific tag is not found and falling back to master
 *
 * @param {Object} masterData - Master tag data
 * @param {Object} originalTaggedData - Original raw tagged data
 * @returns {Object} Master data with backward compatibility
 */
export function createMasterFallbackResult(masterData, originalTaggedData) {
	const compatibleMasterData = ensureTagDataBackwardCompatibility(masterData);

	return {
		...compatibleMasterData,
		tag: 'master',
		_rawTaggedData: originalTaggedData
	};
}
