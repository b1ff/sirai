import { z } from 'zod';
import { BaseTool } from './base.js';
import { ComplexityLevel, LLMType, Subtask } from '../../task-planning/schemas.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Zod schema for a subtask
 */
const SubtaskSchema = z.object({
  id: z.string().optional(),
  taskSpecification: z.string(),
  complexity: z.enum([ComplexityLevel.LOW, ComplexityLevel.MEDIUM, ComplexityLevel.HIGH])
    .default(ComplexityLevel.MEDIUM),
  dependencies: z.array(z.string()).default([])
});

/**
 * Zod schema for a task plan
 */
const TaskPlanSchema = z.object({
  planningThinking: z.string(),
  subtasks: z.array(SubtaskSchema),
  executionOrder: z.array(z.string()).optional(),
  overallComplexity: z.enum([ComplexityLevel.LOW, ComplexityLevel.MEDIUM, ComplexityLevel.HIGH]).optional()
});

/**
 * Tool for saving a plan from LLM
 */
export class ExtractPlanTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'extract_plan';

  /**
   * The description of the tool
   */
  description = 'Save the task plan. Pass the plan as input to this tool.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    plan: TaskPlanSchema.describe('The task plan to save'),
  });

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
    try {
      // Parse and validate the plan
      const plan = this.parameters.parse(args).plan;

      // Save the plan
      this.savedPlan = plan;

      // Return the plan as a JSON string
      return JSON.stringify({
        result: 'plan is saved, your mission is complete.'
      }, null, 2);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save plan: ${error.message}`);
      }
      throw new Error('Failed to save plan: Unknown error');
    }
  }

  /**
   * Get the saved plan
   * @returns The saved plan
   */
  getSavedPlan(): z.infer<typeof TaskPlanSchema> | null {
    return this.savedPlan;
  }
}
