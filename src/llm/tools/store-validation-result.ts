import { z } from 'zod';
import { BaseTool } from './base.js';
import { ValidationStatus } from '../../task-planning/schemas.js';

/**
 * Zod schema for validation result
 */
const ValidationResultSchema = z.object({
  status: z.enum([ValidationStatus.PASSED, ValidationStatus.FAILED, ValidationStatus.PENDING])
    .describe('The status of the validation'),
  message: z.string().describe('A message explaining the validation result'),
  failedTasks: z.array(z.string()).optional()
    .describe('List of task IDs that failed validation'),
  suggestedFixes: z.string().optional()
    .describe('Suggested fixes for failed validations')
}).describe('Result of validating task execution');

/**
 * Tool for saving validation results from LLM
 */
export class StoreValidationResultTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'store_validation_result';

  /**
   * The description of the tool
   */
  description = 'Save the validation result. Pass the generated validation result as input to this tool. If this tool is provided it must be always called.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    validationResult: ValidationResultSchema.describe('The validation result to save'),
  });

  /**
   * The saved validation result
   */
  private savedValidationResult: z.infer<typeof ValidationResultSchema> | null = null;

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The saved validation result as a JSON string
   */
  async execute({ validationResult }: any): Promise<string> {
    // Save the validation result
    this.savedValidationResult = validationResult;

    // Return the validation result as a JSON string
    return JSON.stringify({
      result: 'validation result is saved, your mission is complete.'
    }, null, 2);
  }

  /**
   * Get the saved validation result
   * @returns The saved validation result
   */
  getValidationResult(): z.infer<typeof ValidationResultSchema> | null {
    return this.savedValidationResult;
  }
}