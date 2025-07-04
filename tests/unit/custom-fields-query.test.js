import { describe, it, expect } from '@jest/globals';

// Core field names that are built into TaskMaster
const CORE_FIELDS = [
	'id', 'title', 'description', 'details', 'testStrategy',
	'status', 'priority', 'dependencies', 'subtasks', 'customFields',
	'file', 'projectRoot', 'tag', 'withSubtasks', 'complexityReport'
];

// Query translator function that will be implemented in Phase 2
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

// Field name validator
function validateFieldName(fieldName) {
	// Check if it's a reserved/core field
	if (CORE_FIELDS.includes(fieldName)) {
		return { valid: false, reason: 'reserved', suggestion: `Use a different name, '${fieldName}' is a reserved field` };
	}
	
	// Check field name format
	const fieldNameRegex = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;
	if (!fieldNameRegex.test(fieldName)) {
		return { valid: false, reason: 'format', suggestion: 'Field names must start with a letter, underscore, or hyphen, and contain only letters, numbers, underscores, and hyphens' };
	}
	
	return { valid: true };
}

// Fuzzy field name suggester
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

// Simple Levenshtein distance implementation
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

describe('Custom Fields Query Translation', () => {
	describe('Core field vs custom field detection', () => {
		it('should correctly identify core fields', () => {
			const params = {
				status: 'pending',
				priority: 'high',
				id: '15',
				withSubtasks: true
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields).toEqual(params);
			expect(translated.customFields).toEqual({});
		});

		it('should correctly identify custom fields', () => {
			const params = {
				epic: 'EPIC-1234',
				component: 'auth',
				sprint: '2024-Q1-S3',
				assignee: 'john.doe'
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields).toEqual({});
			expect(translated.customFields).toEqual(params);
		});

		it('should handle mixed core and custom fields', () => {
			const params = {
				status: 'pending',
				priority: 'high',
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe'
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields).toEqual({
				status: 'pending',
				priority: 'high'
			});
			expect(translated.customFields).toEqual({
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe'
			});
		});
	});

	describe('Query parameter translation accuracy', () => {
		it('should preserve value types during translation', () => {
			const params = {
				status: 'pending,in-progress',
				epic: 'EPIC-1234',
				estimatedHours: '16',
				isUrgent: 'true'
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields.status).toBe('pending,in-progress');
			expect(translated.customFields.epic).toBe('EPIC-1234');
			expect(translated.customFields.estimatedHours).toBe('16');
			expect(translated.customFields.isUrgent).toBe('true');
		});

		it('should handle empty parameter values', () => {
			const params = {
				status: '',
				epic: '',
				component: undefined,
				sprint: null
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields.status).toBe('');
			expect(translated.customFields.epic).toBe('');
			expect(translated.customFields.component).toBeUndefined();
			expect(translated.customFields.sprint).toBeNull();
		});
	});

	describe('Invalid field name handling', () => {
		it('should reject reserved field names', () => {
			CORE_FIELDS.forEach(fieldName => {
				const result = validateFieldName(fieldName);
				expect(result.valid).toBe(false);
				expect(result.reason).toBe('reserved');
			});
		});

		it('should reject invalid field name formats', () => {
			const invalidNames = [
				'123field',      // starts with number
				'field name',    // contains space
				'field@name',    // contains special char
				'field.name',    // contains dot
				'',              // empty
				'field!',        // exclamation
				'field#tag'      // hash
			];
			
			invalidNames.forEach(name => {
				const result = validateFieldName(name);
				expect(result.valid).toBe(false);
				expect(result.reason).toBe('format');
			});
		});

		it('should accept valid field name formats', () => {
			const validNames = [
				'epic',
				'epicName',
				'epic_name',
				'epic-name',
				'_epic',
				'-epic',
				'EPIC',
				'epic123',
				'epic_123'
			];
			
			validNames.forEach(name => {
				const result = validateFieldName(name);
				expect(result.valid).toBe(true);
			});
		});
	});

	describe('Field name suggestions', () => {
		const availableFields = ['epic', 'component', 'sprint', 'assignee', 'taskType', 'riskLevel'];

		it('should suggest exact matches (case-insensitive)', () => {
			expect(suggestFieldName('EPIC', availableFields)).toBe('epic');
			expect(suggestFieldName('Component', availableFields)).toBe('component');
		});

		it('should suggest prefix matches', () => {
			expect(suggestFieldName('epi', availableFields)).toBe('epic');
			expect(suggestFieldName('comp', availableFields)).toBe('component');
			expect(suggestFieldName('spr', availableFields)).toBe('sprint');
		});

		it('should suggest contains matches', () => {
			expect(suggestFieldName('sign', availableFields)).toBe('assignee');
			expect(suggestFieldName('Type', availableFields)).toBe('taskType');
		});

		it('should suggest close matches with typos', () => {
			expect(suggestFieldName('epci', availableFields)).toBe('epic'); // transposition
			expect(suggestFieldName('spint', availableFields)).toBe('sprint'); // typo
			expect(suggestFieldName('asignee', availableFields)).toBe('assignee'); // missing s
		});

		it('should return null for no close matches', () => {
			expect(suggestFieldName('xyz', availableFields)).toBeNull();
			expect(suggestFieldName('unknown', availableFields)).toBeNull();
		});
	});

	describe('Complex query combinations', () => {
		it('should handle multiple custom fields with operators', () => {
			const params = {
				status: 'pending,in-progress',
				priority: 'high',
				epic: 'EPIC-1234,EPIC-5678',
				component: 'auth,database',
				sprint: '2024-Q1-S3'
			};
			
			const translated = translateQueryParameters(params);
			
			expect(translated.coreFields).toEqual({
				status: 'pending,in-progress',
				priority: 'high'
			});
			expect(translated.customFields).toEqual({
				epic: 'EPIC-1234,EPIC-5678',
				component: 'auth,database',
				sprint: '2024-Q1-S3'
			});
		});

		it('should handle query with all parameter types', () => {
			const params = {
				// Core fields
				status: 'pending',
				priority: 'high',
				withSubtasks: true,
				file: 'tasks.json',
				projectRoot: '/path/to/project',
				
				// Custom fields
				epic: 'EPIC-1234',
				component: 'auth',
				assignee: 'john.doe',
				taskType: 'story',
				estimatedHours: '16'
			};
			
			const translated = translateQueryParameters(params);
			
			expect(Object.keys(translated.coreFields)).toHaveLength(5);
			expect(Object.keys(translated.customFields)).toHaveLength(5);
		});
	});

	describe('Error messages and helpful feedback', () => {
		it('should provide helpful error for reserved fields', () => {
			const result = validateFieldName('status');
			expect(result.suggestion).toContain("'status' is a reserved field");
		});

		it('should provide format requirements for invalid names', () => {
			const result = validateFieldName('123invalid');
			expect(result.suggestion).toContain('must start with a letter');
		});
	});

	describe('Case sensitivity handling', () => {
		it('should handle case-sensitive custom field names', () => {
			const params = {
				Epic: 'EPIC-1234',      // capital E
				COMPONENT: 'auth',      // all caps
				assignee: 'john.doe'    // lowercase
			};
			
			const translated = translateQueryParameters(params);
			
			// Custom fields should preserve case
			expect(translated.customFields).toEqual({
				Epic: 'EPIC-1234',
				COMPONENT: 'auth',
				assignee: 'john.doe'
			});
		});
	});
});

// Export for use in implementation
export { translateQueryParameters, validateFieldName, suggestFieldName, CORE_FIELDS };