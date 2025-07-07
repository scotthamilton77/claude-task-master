import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('withCustomFields Higher-Order Function', () => {
	let mockExecuteFn;
	let mockContext;
	let mockLog;
	let customFieldsConfigMock;
	let withCustomFields;

	beforeEach(async () => {
		// Reset all mocks
		jest.clearAllMocks();

		// Create mock for customFieldsConfig
		customFieldsConfigMock = {
			loadConfig: jest.fn(),
			parseCustomFields: jest.fn()
		};

		// Mock the dynamic import in withCustomFields
		const originalImport = global.import;
		global.import = jest.fn().mockImplementation((module) => {
			if (module === '../../../scripts/modules/utils/customFieldsConfig.js') {
				return Promise.resolve({ customFieldsConfig: customFieldsConfigMock });
			}
			return originalImport(module);
		});

		// Import withCustomFields after setting up the mock
		const { withCustomFields: importedWithCustomFields } = await import('../../../mcp-server/src/tools/utils.js');
		withCustomFields = importedWithCustomFields;

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
		// Restore original import if it was modified
		if (global.import && global.import.mockRestore) {
			global.import.mockRestore();
		}
	});

	describe('Basic HOF functionality', () => {
		it('should wrap the execute function and call it with custom fields', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt',
				title: 'test title'
			};

			const mockCustomFields = {
				epic: 'EPIC-123',
				component: 'auth'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(customFieldsConfigMock.loadConfig).toHaveBeenCalledWith('/test/project');
			expect(customFieldsConfigMock.parseCustomFields).toHaveBeenCalledWith(mockArgs);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: mockCustomFields },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});

		it('should pass empty custom fields when config loading fails', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockImplementation(() => {
				throw new Error('Config loading failed');
			});

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockLog.warn).toHaveBeenCalledWith('Failed to process custom fields: Config loading failed');
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});

		it('should pass empty custom fields when parsing fails', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockImplementation(() => {
				throw new Error('Parsing failed');
			});

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockLog.warn).toHaveBeenCalledWith('Failed to process custom fields: Parsing failed');
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);
			expect(result).toEqual({ success: true, data: 'test result' });
		});
	});

	describe('Custom fields processing', () => {
		it('should log successful custom fields extraction', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe'
			};

			const mockCustomFields = {
				epic: 'EPIC-123',
				component: 'auth',
				assignee: 'john.doe'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockLog.info).toHaveBeenCalledWith(
				'Extracted custom fields: epic, component, assignee'
			);
		});

		it('should not log when no custom fields are extracted', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue({});

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify - should not log info about custom fields
			expect(mockLog.info).not.toHaveBeenCalledWith(
				expect.stringContaining('Extracted custom fields')
			);
		});

		it('should handle undefined custom fields gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(undefined);

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

		it('should handle null custom fields gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(null);

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

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue({});

			// Execute & Verify
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await expect(wrappedFunction(mockArgs, mockContext)).rejects.toThrow('Execution failed');
		});

		it('should handle circular import errors gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			// Mock a module import error
			const originalImport = global.import;
			global.import = jest.fn().mockRejectedValue(new Error('Circular dependency detected'));

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockLog.warn).toHaveBeenCalledWith(
				expect.stringContaining('Failed to process custom fields')
			);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
			);

			// Restore
			global.import = originalImport;
		});

		it('should handle configuration loading timeout gracefully', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			customFieldsConfigMock.loadConfig.mockImplementation(() => {
				throw new Error('ETIMEDOUT: Configuration loading timed out');
			});

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			const result = await wrappedFunction(mockArgs, mockContext);

			// Verify
			expect(mockLog.warn).toHaveBeenCalledWith(
				'Failed to process custom fields: ETIMEDOUT: Configuration loading timed out'
			);
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				mockContext
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

			const mockCustomFields = {
				epic: 'EPIC-123'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify original args are unchanged
			expect(mockArgs).toEqual(originalArgs);
			expect(mockArgs).not.toHaveProperty('customFields');

			// Verify the wrapped function received the enhanced args
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...originalArgs, customFields: mockCustomFields },
				mockContext
			);
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

			const mockCustomFields = {
				epic: 'EPIC-123',
				component: 'auth'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify all properties are preserved
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{
					...mockArgs,
					customFields: mockCustomFields
				},
				mockContext
			);
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

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue({});

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, complexContext);

			// Verify context is passed through unchanged
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...mockArgs, customFields: {} },
				complexContext
			);
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

			customFieldsConfigMock.loadConfig.mockImplementation(() => {
				throw new Error('Config error');
			});

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

			const mockCustomFields = {
				epic: 'EPIC-456',
				component: 'frontend'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(addTaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...addTaskArgs, customFields: mockCustomFields },
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

			const mockCustomFields = {
				assignee: 'jane.doe',
				sprint: '2024-Q2-S1'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(updateTaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...updateTaskArgs, customFields: mockCustomFields },
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

			const mockCustomFields = {
				subComponent: 'auth-module',
				estimate: '3 days'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(addSubtaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...addSubtaskArgs, customFields: mockCustomFields },
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

			const mockCustomFields = {
				difficulty: 'hard',
				reviewer: 'senior.dev'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(updateSubtaskArgs, mockContext);

			// Verify
			expect(mockExecuteFn).toHaveBeenCalledWith(
				{ ...updateSubtaskArgs, customFields: mockCustomFields },
				mockContext
			);
		});
	});

	describe('Performance and caching', () => {
		it('should call loadConfig and parseCustomFields only once per invocation', async () => {
			// Setup
			const mockArgs = {
				projectRoot: '/test/project',
				prompt: 'test prompt'
			};

			const mockCustomFields = {
				epic: 'EPIC-123'
			};

			customFieldsConfigMock.loadConfig.mockReturnValue(undefined);
			customFieldsConfigMock.parseCustomFields.mockReturnValue(mockCustomFields);

			// Execute
			const wrappedFunction = withCustomFields(mockExecuteFn);
			await wrappedFunction(mockArgs, mockContext);

			// Verify each method called exactly once
			expect(customFieldsConfigMock.loadConfig).toHaveBeenCalledTimes(1);
			expect(customFieldsConfigMock.parseCustomFields).toHaveBeenCalledTimes(1);
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
	});
});