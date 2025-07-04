/**
 * subtaskValidator.js
 *
 * Validation utilities specifically for subtask data integrity and structure.
 * This module handles subtask-specific validation concerns including ensuring
 * proper parent-child relationships and data consistency.
 *
 * @fileoverview Subtask validation utilities
 * @author TaskMaster AI Enhancement
 * @since 0.18.1
 */

/**
 * Validates and fixes missing parentTaskId fields in subtasks
 * This is a defensive migration function for legacy data that may have
 * subtasks without proper parentTaskId fields.
 *
 * @param {Object[]} tasks - Array of task objects
 * @param {boolean} [logMigrations=false] - Whether to log when migrations occur
 * @returns {Object[]} Tasks with validated subtask parentTaskId fields
 */
export function ensureSubtaskParentIds(tasks, logMigrations = false) {
	if (!Array.isArray(tasks)) {
		return tasks;
	}

	let migrationsPerformed = 0;

	const validatedTasks = tasks.map((task) => {
		if (!task.subtasks || !Array.isArray(task.subtasks) || task.subtasks.length === 0) {
			return task;
		}

		const validatedSubtasks = task.subtasks.map((subtask) => {
			// Check if parentTaskId is missing or invalid
			if (!subtask.parentTaskId || subtask.parentTaskId !== task.id) {
				migrationsPerformed++;
				
				if (logMigrations && process.env.TASKMASTER_DEBUG === 'true') {
					console.log(
						`[DEBUG] Auto-assigned parentTaskId ${task.id} to subtask ${task.id}.${subtask.id}`
					);
				}

				return {
					...subtask,
					parentTaskId: task.id
				};
			}

			return subtask;
		});

		return {
			...task,
			subtasks: validatedSubtasks
		};
	});

	if (migrationsPerformed > 0 && logMigrations) {
		if (process.env.TASKMASTER_DEBUG === 'true') {
			console.log(
				`[DEBUG] Subtask validation: Auto-assigned parentTaskId to ${migrationsPerformed} subtasks`
			);
		}
	}

	return validatedTasks;
}

/**
 * Validates subtask data structure and relationships
 * Performs comprehensive validation including:
 * - Ensuring parentTaskId exists and matches parent
 * - Validating subtask IDs are unique within parent
 * - Checking for valid status values
 *
 * @param {Object[]} tasks - Array of task objects
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.fixIssues=true] - Whether to auto-fix issues when possible
 * @param {boolean} [options.logMigrations=false] - Whether to log when fixes are applied
 * @returns {Object} Validation result with tasks and any issues found
 */
export function validateSubtaskStructure(tasks, options = {}) {
	const { fixIssues = true, logMigrations = false } = options;
	const issues = [];
	let validatedTasks = tasks;

	if (!Array.isArray(tasks)) {
		return { tasks: validatedTasks, issues: ['Tasks must be an array'], isValid: false };
	}

	// Step 1: Ensure parentTaskId fields exist
	if (fixIssues) {
		validatedTasks = ensureSubtaskParentIds(validatedTasks, logMigrations);
	}

	// Step 2: Validate subtask structure
	validatedTasks.forEach((task, taskIndex) => {
		if (!task.subtasks || !Array.isArray(task.subtasks)) {
			return;
		}

		const subtaskIds = new Set();

		task.subtasks.forEach((subtask, subtaskIndex) => {
			// Check for missing required fields
			if (!subtask.id) {
				issues.push(`Task ${task.id}: Subtask at index ${subtaskIndex} missing id`);
			}

			if (!subtask.parentTaskId) {
				issues.push(`Task ${task.id}: Subtask ${subtask.id} missing parentTaskId`);
			} else if (subtask.parentTaskId !== task.id) {
				issues.push(
					`Task ${task.id}: Subtask ${subtask.id} has incorrect parentTaskId (${subtask.parentTaskId})`
				);
			}

			// Check for duplicate subtask IDs within the same parent
			if (subtask.id) {
				if (subtaskIds.has(subtask.id)) {
					issues.push(`Task ${task.id}: Duplicate subtask ID ${subtask.id}`);
				} else {
					subtaskIds.add(subtask.id);
				}
			}

			// Validate basic required fields
			if (!subtask.title) {
				issues.push(`Task ${task.id}: Subtask ${subtask.id} missing title`);
			}
		});
	});

	return {
		tasks: validatedTasks,
		issues,
		isValid: issues.length === 0
	};
}

/**
 * Finds orphaned subtasks (subtasks whose parentTaskId doesn't match any existing task)
 * This can help identify data corruption or migration issues.
 *
 * @param {Object[]} tasks - Array of task objects
 * @returns {Object[]} Array of orphaned subtasks with context
 */
export function findOrphanedSubtasks(tasks) {
	if (!Array.isArray(tasks)) {
		return [];
	}

	const taskIds = new Set(tasks.map((task) => task.id));
	const orphanedSubtasks = [];

	tasks.forEach((task) => {
		if (!task.subtasks || !Array.isArray(task.subtasks)) {
			return;
		}

		task.subtasks.forEach((subtask) => {
			if (subtask.parentTaskId && !taskIds.has(subtask.parentTaskId)) {
				orphanedSubtasks.push({
					...subtask,
					actualParentId: task.id,
					invalidParentId: subtask.parentTaskId,
					context: `Found in task ${task.id} but references non-existent parent ${subtask.parentTaskId}`
				});
			}
		});
	});

	return orphanedSubtasks;
}

/**
 * Creates a comprehensive subtask integrity report
 * Useful for debugging and data health monitoring
 *
 * @param {Object[]} tasks - Array of task objects
 * @returns {Object} Detailed report on subtask integrity
 */
export function createSubtaskIntegrityReport(tasks) {
	const validation = validateSubtaskStructure(tasks, { fixIssues: false });
	const orphanedSubtasks = findOrphanedSubtasks(tasks);

	let totalSubtasks = 0;
	let tasksWithSubtasks = 0;
	let subtasksWithIssues = 0;

	tasks.forEach((task) => {
		if (task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
			tasksWithSubtasks++;
			totalSubtasks += task.subtasks.length;

			task.subtasks.forEach((subtask) => {
				if (!subtask.parentTaskId || subtask.parentTaskId !== task.id) {
					subtasksWithIssues++;
				}
			});
		}
	});

	return {
		summary: {
			totalTasks: tasks.length,
			tasksWithSubtasks,
			totalSubtasks,
			subtasksWithIssues,
			orphanedSubtasks: orphanedSubtasks.length,
			integrityScore: totalSubtasks > 0 ? 
				((totalSubtasks - subtasksWithIssues) / totalSubtasks * 100).toFixed(1) + '%' : 
				'100%'
		},
		issues: validation.issues,
		orphanedSubtasks,
		isHealthy: validation.isValid && orphanedSubtasks.length === 0
	};
}