import { z } from 'zod';
import { BaseTool } from './base.js';
import { ComplexityLevel, Subtask } from '../../task-planning/schemas.js';

/**
 * Zod schema for a file to read
 */
const FileToReadSchema = z.object({
  path: z.string().describe('The file path to read'),
  syntax: z.string().describe('The syntax/language of the file (e.g., "typescript", "python")')
}).describe('Information about a file that needs to be read');

/**
 * Zod schema for a subtask
 */
const SubtaskSchema = z.object({
  id: z.string().optional().describe('Unique identifier for the subtask'),
  specification: z.string().describe('Detailed content defined by <subtask_specification_template>'),
  complexity: z.enum([ComplexityLevel.LOW, ComplexityLevel.MEDIUM, ComplexityLevel.HIGH])
    .default(ComplexityLevel.MEDIUM)
    .describe('The estimated complexity level of the subtask'),
  dependencies: z.array(z.string()).default([]).describe('IDs of other subtasks that must be completed before this one'),
  filesToRead: z.array(FileToReadSchema).optional().describe('List of files that need to be read to complete this subtask')
}).describe('A single unit of work within a larger task plan');

const TaskPlanSchema = z.object({
  subtasks: z.array(SubtaskSchema).describe('List of subtasks that make up the complete task').min(1),
  executionOrder: z.array(z.string()).optional().describe('The recommended order of subtask execution by ID'),
  overallComplexity: z.enum([ComplexityLevel.LOW, ComplexityLevel.MEDIUM, ComplexityLevel.HIGH]).optional()
  .describe('The overall complexity assessment of the entire task'),
  validationInstructions: z.string().optional().describe('Instructions for validating the task execution')
}).describe('A complete plan for executing a complex task, broken down into subtasks');

export class StorePlanTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'store_plan';

  /**
   * The description of the tool
   */
  description = 'Save the task plan for execution. Pass the generated plan as input to this tool. If this tool provided it must be always called.';

  parameters = TaskPlanSchema;
  /**
   * The saved plan
   */
  private savedPlan: z.infer<typeof TaskPlanSchema> | null = null;

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The saved plan as a JSON string
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    this.savedPlan = args as any;

    // Return the plan as a JSON string
    return JSON.stringify({
      result: 'plan is saved, your mission is complete.'
    }, null, 2);
  }

  /**
   * Get the saved plan
   * @returns The saved plan
   */
  getSavedPlan(): z.infer<typeof TaskPlanSchema> | null {
    return this.savedPlan;
  }
}
