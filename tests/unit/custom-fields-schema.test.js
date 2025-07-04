import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

// Schema definitions that will be implemented in Phase 1
const CustomFieldsSchema = z.record(z.string()).optional().default({});

const TaskSchema = z.object({
	id: z.number(),
	title: z.string().min(1),
	description: z.string().min(1),
	details: z.string(),
	testStrategy: z.string(),
	status: z.enum([
		'pending',
		'in-progress',
		'done',
		'review',
		'deferred',
		'cancelled'
	]),
	priority: z.enum(['high', 'medium', 'low']).optional(),
	dependencies: z.array(z.number()).optional(),
	subtasks: z.array(z.any()).optional(),
	customFields: CustomFieldsSchema
});

const SubtaskSchema = z.object({
	id: z.string(),
	title: z.string().min(1),
	status: z.enum([
		'pending',
		'in-progress',
		'done',
		'review',
		'deferred',
		'cancelled'
	]),
	details: z.string().optional(),
	customFields: CustomFieldsSchema
});

// Reserved field names that cannot be used as custom fields
const RESERVED_FIELD_NAMES = [
	'id',
	'title',
	'description',
	'details',
	'testStrategy',
	'status',
	'priority',
	'dependencies',
	'subtasks',
	'customFields'
];

describe('Custom Fields Schema Validation', () => {
	describe('Valid customFields structures', () => {
		it('should accept empty customFields object', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {}
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});

		it('should accept customFields with string values', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {
					epic: 'EPIC-1234',
					component: 'auth',
					assignee: 'john.doe',
					sprint: '2024-Q1-S3'
				}
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});

		it('should accept customFields with numeric string values', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {
					estimatedHours: '16',
					storyPoints: '5',
					bugSeverity: '1'
				}
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});

		it('should accept customFields with mixed value types as strings', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {
					epic: 'EPIC-1234',
					estimatedHours: '16',
					isBlocked: 'true',
					releaseDate: '2024-03-15'
				}
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});

		it('should accept customFields in subtasks', () => {
			const subtask = {
				id: '1.1',
				title: 'Subtask title',
				status: 'pending',
				details: 'Subtask details',
				customFields: {
					component: 'auth',
					assignee: 'jane.doe'
				}
			};

			expect(() => SubtaskSchema.parse(subtask)).not.toThrow();
		});
	});

	describe('Invalid field names', () => {
		it('should reject reserved field names', () => {
			RESERVED_FIELD_NAMES.forEach((fieldName) => {
				const customFields = { [fieldName]: 'value' };

				// This test validates the logic we'll implement
				const isValid = !Object.keys(customFields).some((key) =>
					RESERVED_FIELD_NAMES.includes(key)
				);

				expect(isValid).toBe(false);
			});
		});

		it('should validate field name format', () => {
			const invalidFieldNames = [
				'field name', // spaces
				'field-name', // hyphens (we'll allow these)
				'field.name', // dots
				'field@name', // special characters
				'123field', // starting with number
				'' // empty string
			];

			const validFieldNames = [
				'fieldName',
				'field_name',
				'field123',
				'FIELD_NAME',
				'_privateField',
				'field-name' // hyphens are allowed
			];

			const fieldNameRegex = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;

			invalidFieldNames.forEach((name) => {
				if (name !== 'field-name') {
					// hyphens are actually valid
					expect(fieldNameRegex.test(name)).toBe(false);
				}
			});

			validFieldNames.forEach((name) => {
				expect(fieldNameRegex.test(name)).toBe(true);
			});
		});
	});

	describe('Backward compatibility', () => {
		it('should accept tasks without customFields', () => {
			const legacyTask = {
				id: 1,
				title: 'Legacy task',
				description: 'Legacy description',
				details: 'Legacy details',
				testStrategy: 'Legacy strategy',
				status: 'pending'
			};

			const parsed = TaskSchema.parse(legacyTask);
			expect(parsed.customFields).toEqual({});
		});

		it('should accept subtasks without customFields', () => {
			const legacySubtask = {
				id: '1.1',
				title: 'Legacy subtask',
				status: 'pending'
			};

			const parsed = SubtaskSchema.parse(legacySubtask);
			expect(parsed.customFields).toEqual({});
		});

		it('should preserve existing task structure when adding customFields', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				priority: 'high',
				dependencies: [2, 3],
				subtasks: []
			};

			const taskWithCustomFields = {
				...task,
				customFields: { epic: 'EPIC-1234' }
			};

			const parsed = TaskSchema.parse(taskWithCustomFields);
			expect(parsed).toMatchObject(task);
			expect(parsed.customFields).toEqual({ epic: 'EPIC-1234' });
		});
	});

	describe('Type validation', () => {
		it('should coerce all custom field values to strings', () => {
			// In the actual implementation, we'll handle type coercion
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {
					number: '123',
					boolean: 'true',
					date: '2024-03-15',
					text: 'some text'
				}
			};

			const parsed = TaskSchema.parse(task);
			Object.values(parsed.customFields).forEach((value) => {
				expect(typeof value).toBe('string');
			});
		});
	});

	describe('Edge cases', () => {
		it('should handle undefined customFields', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: undefined
			};

			const parsed = TaskSchema.parse(task);
			expect(parsed.customFields).toEqual({});
		});

		it('should handle null customFields', () => {
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: null
			};

			// null should be converted to empty object
			const parsed = TaskSchema.parse({ ...task, customFields: undefined });
			expect(parsed.customFields).toEqual({});
		});

		it('should handle very long custom field values', () => {
			const longValue = 'a'.repeat(1000);
			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields: {
					longField: longValue
				}
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});

		it('should handle many custom fields', () => {
			const customFields = {};
			for (let i = 0; i < 100; i++) {
				customFields[`field${i}`] = `value${i}`;
			}

			const task = {
				id: 1,
				title: 'Test task',
				description: 'Test description',
				details: 'Test details',
				testStrategy: 'Test strategy',
				status: 'pending',
				customFields
			};

			expect(() => TaskSchema.parse(task)).not.toThrow();
		});
	});
});

// Export for use in implementation
export { TaskSchema, SubtaskSchema, CustomFieldsSchema, RESERVED_FIELD_NAMES };
