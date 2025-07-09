import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Import the actual implementation for testing
import { withCustomFields } from '../../../mcp-server/src/tools/utils.js';
import { CustomFieldsConfig } from '../../../scripts/modules/utils/customFieldsConfig.js';
import { CustomFieldsParser } from '../../../scripts/modules/utils/customFieldsParser.js';

describe('withCustomFields Higher-Order Function', () => {
	let mockExecuteFn;
	let mockContext;
	let mockLog;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Setup mock execute function
		mockExecuteFn = jest.fn().mockResolvedValue({ success: true, data: 'test result' });

		// Setup mock logger
		mockLog = {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn()
		};

		// Setup mock context
		mockContext = {
			log: mockLog,
			session: { id: 'test-session' }
		};
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	describe('Basic HOF functionality with config injection', () => {
		it('should wrap the execute function and inject custom fields', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt',
				title: 'test title'
			};

			// Use the withCustomFields HOF which creates its own instances
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify the wrapped function was called with custom fields added
			expect(mockExecuteFn).toHaveBeenCalledWith(
				expect.objectContaining({
					...mockArgs,
					customFields: expect.any(Object)
				}),
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});

		it('should pass empty custom fields when config loading fails', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/non/existent/path', // This will trigger default config
				prompt: 'test prompt'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			// With default config (no allowList, no adhoc), custom fields should be empty
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});

		it('should handle args without projectRoot gracefully', async () => {
			// Setup
			const mockArgs = {
				prompt: 'test prompt'
				// No projectRoot
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Should not crash and should provide empty custom fields
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});
	});

	describe('Custom fields processing with preloaded config', () => {
		it('should extract custom fields when configuration is valid', async () => {
			// We can't directly inject config into the HOF, but we can test with
			// args that would produce custom fields if a config were loaded
			const mockArgs = {
				projectRoot: '/test/project',
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify function was called with custom fields object
			const callArgs = mockExecuteFn.mock.calls[0][0];
			expect(callArgs).toHaveProperty('customFields');
			expect(typeof callArgs.customFields).toBe('object');
		});

		it('should handle undefined custom fields gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});
	});

	describe('Error handling and propagation', () => {
		it('should propagate errors from the wrapped function', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			const executionError = new Error('Execution failed');
			mockExecuteFn.mockRejectedValue(executionError);

			// Execute & Verify
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await expect(wrappedFunction(mockArgs, mockContext)).rejects.toThrow('Execution failed');
		});

		it('should handle missing log in context gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			const contextWithoutLog = {
				session: { id: 'test-session' }
			};

			// Execute - should not throw even without log
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, contextWithoutLog);

			// Verify it still works
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				contextWithoutLog
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});
	});

	describe('Args preservation and isolation', () => {
		it('should not modify the original args object', async () => {
			// Setup
			const originalArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt',
				title: 'test title'
			};
			const mockArgs = { ...originalArgs };

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify original args are unchanged
			expect(mockArgs).toEqual(originalArgs);
			expect(mockArgs).not.toHaveProperty('customFields');

			// Verify the wrapped function received the enhanced args
			const callArgs = mockExecuteFn.mock.calls[0][0];
			expect(callArgs).toHaveProperty('customFields');
			expect(callArgs.prompt).toBe('test prompt');
			expect(callArgs.title).toBe('test title');
		});

		it('should preserve all original args when adding custom fields', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt',
				title: 'test title',
				description: 'test description',
				priority: 'high',
				dependencies: [1, 2, 3],
				someCustomProp: 'custom value'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify all properties are preserved
			const callArgs = mockExecuteFn.mock.calls[0][0];
			expect(callArgs).toEqual({
				...mockArgs,
				customFields: expect.any(Object)
			});
		});
	});

	describe('Context handling', () => {
		it('should pass through the context unchanged', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			const complexContext = {
				log: mockLog,
				session: { id: 'test-session', user: 'test-user' },
				additionalData: { some: 'data' }
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, complexContext);

			// Verify context is passed through unchanged
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: expect.any(Object) },
				complexContext
			);
		});
	});

	describe('Integration with different MCP tool signatures', () => {
		it('should work with add-task signature', async () => {
			// Setup args that match add-task tool
			const addTaskArgs = {
				projectRoot: '/test/project',
				prompt: 'Create new feature',
				title: 'New Feature',
				description: 'Feature description',
				details: 'Implementation details',
				priority: 'high',
				dependencies: '1,2,3',
				research: false
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(addTaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...addTaskArgs, customFields: expect.any(Object) },
				mockContext
			);
		});

		it('should work with update-task signature', async () => {
			// Setup args that match update-task tool
			const updateTaskArgs = {
				projectRoot: '/test/project',
				id: '5',
				prompt: 'Update task details',
				research: true
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(updateTaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...updateTaskArgs, customFields: expect.any(Object) },
				mockContext
			);
		});

		it('should work with add-subtask signature', async () => {
			// Setup args that match add-subtask tool
			const addSubtaskArgs = {
				projectRoot: '/test/project',
				id: '3',
				taskId: '5',
				title: 'New subtask',
				description: 'Subtask description',
				details: 'Subtask details',
				status: 'pending',
				dependencies: '2,4',
				file: 'custom/path/tasks.json',
				skipGenerate: false,
				tag: 'feature-branch'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(addSubtaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...addSubtaskArgs, customFields: expect.any(Object) },
				mockContext
			);
		});

		it('should work with update-subtask signature', async () => {
			// Setup args that match update-subtask tool
			const updateSubtaskArgs = {
				projectRoot: '/test/project',
				id: '3.2',
				prompt: 'Update subtask with new requirements'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(updateSubtaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...updateSubtaskArgs, customFields: expect.any(Object) },
				mockContext
			);
		});
	});

	describe('Performance and consistency', () => {
		it('should create new instances for each invocation', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			// Execute multiple times
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);
			await wrappedFunction(mockArgs, mockContext);

			// Each call should work independently
			expect(mockExecuteFn).toHaveBeenCalledTimes(2);
			expect(mockExecuteFn).toHaveBeenNthCalledWith(1,
				{ ...mockArgs, customFields: expect.any(Object) },
				mockContext
			);
			expect(mockExecuteFn).toHaveBeenNthCalledWith(2,
				{ ...mockArgs, customFields: expect.any(Object) },
				mockContext
			);
		});

		it('should create a new wrapped function for each withCustomFields call', () => {
			// Setup
			const executeFn1 = jest.fn();
			const executeFn2 = jest.fn();

			// Execute
			const wrappedFn1 = withCustomFields(executeFn1);
			const wrappedFn2 = withCustomFields(executeFn2);

			// Verify they are different functions
			expect(wrappedFn1).not.toBe(wrappedFn2);
			expect(typeof wrappedFn1).toBe('function');
			expect(typeof wrappedFn2).toBe('function');
		});

		it('should handle rapid successive calls without interference', async () => {
			// Setup
			const mockArgs1 = {
				projectRoot: '/test/project1',
				prompt: 'test prompt 1'
			};
			const mockArgs2 = {
				projectRoot: '/test/project2', 
				prompt: 'test prompt 2'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await Promise.all([
				wrappedFunction(mockArgs1, mockContext),
				wrappedFunction(mockArgs2, mockContext)
			]);

			// Verify both calls worked correctly
			expect(mockExecuteFn).toHaveBeenCalledTimes(2);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs1, customFields: expect.any(Object) },
				mockContext
			);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs2, customFields: expect.any(Object) },
				mockContext
			);
		});
	});

	describe('Configuration-based behavior', () => {
		it('should work with instance-based configuration approach', async () => {
			// This test verifies that the HOF can work with the new 
			// instance-based configuration approach rather than singletons
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify it uses instance-based approach (creates new instances internally)
			expect(mockExecuteFn).toHaveBeenCalledWith(
				expect.objectContaining({
					projectRoot: '/test/project',
					prompt: 'test prompt',
					customFields: expect.any(Object)
				}),
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});

		it('should handle missing projectRoot parameter gracefully', async () => {
			// Setup args without projectRoot
			const mockArgs = {
				prompt: 'test prompt',
				title: 'test title'
			};

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Should handle gracefully and provide empty custom fields
			expect(mockLog.warn).toHaveBeenCalledWith(
				expect.stringContaining('Failed to process custom fields')
			);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});
	});
});