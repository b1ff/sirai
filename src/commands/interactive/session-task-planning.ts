import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { LLMFactory } from '../../llm/factory.js';
import { BaseLLM } from '../../llm/base.js';
import { ComplexityLevel } from '../../task-planning/index.js';
import { AppConfig } from '../../config/config.js';
import { TaskPlanResult } from './types.js';

/**
 * Task planning related methods for the InteractiveSession class
 */
export class SessionTaskPlanning {
  /**
   * Selects an LLM based on task complexity
   * @param taskPlan - The task plan
   * @param currentLLM - The current LLM
   * @param config - The configuration
   * @param options - The options
   * @returns The selected LLM
   */
  public static async selectLLMBasedOnComplexity(
    taskPlan: any,
    currentLLM: BaseLLM,
    config: AppConfig,
    options: { local?: boolean; remote?: boolean }
  ): Promise<BaseLLM> {
    let selectedLLM = currentLLM;
    
    if (taskPlan.overallComplexity === ComplexityLevel.HIGH) {
      // Use remote LLM for high complexity tasks
      if (!options.local) {
        try {
          selectedLLM = LLMFactory.createRemoteLLM(config);
          console.log(chalk.yellow(`Using remote LLM for ${taskPlan.overallComplexity} complexity task...`));
        } catch (error) {
          // Fall back to current LLM if remote fails
          console.log(chalk.yellow('Failed to use remote LLM, falling back to current LLM.'));
        }
      }
    } else if (taskPlan.overallComplexity === ComplexityLevel.LOW) {
      // Use local LLM for low complexity tasks
      if (!options.remote) {
        try {
          selectedLLM = LLMFactory.createLocalLLM(config);
          console.log(chalk.yellow(`Using local LLM for ${taskPlan.overallComplexity} complexity task...`));
        } catch (error) {
          // Fall back to current LLM if local fails
          console.log(chalk.yellow('Failed to use local LLM, falling back to current LLM.'));
        }
      }
    }
    
    return selectedLLM;
  }

  /**
   * Handles plan confirmation and modification
   * @param taskPlan - The task plan
   * @param processedInput - The processed user input
   * @param contextProfile - The context profile
   * @param taskPlanner - The task planner
   * @returns Whether the plan was confirmed
   */
  public static async handlePlanConfirmation(
    taskPlan: any,
    processedInput: string,
    contextProfile: any,
    taskPlanner: any
  ): Promise<boolean> {
    const { planConfirmation } = await inquirer.prompt<{ planConfirmation: string }>([
      {
        type: 'list',
        name: 'planConfirmation',
        message: 'Do you want to proceed with this plan?',
        choices: ['Yes, proceed with this plan', 'No, I want to modify the plan', 'No, cancel the plan']
      }
    ]);
    
    if (planConfirmation === 'No, cancel the plan') {
      return false;
    }
    
    if (planConfirmation === 'No, I want to modify the plan') {
      return await SessionTaskPlanning.modifyPlan(taskPlan, processedInput, contextProfile, taskPlanner);
    }
    
    return true;
  }

  /**
   * Modifies the plan based on user feedback
   * @param taskPlan - The task plan
   * @param processedInput - The processed user input
   * @param contextProfile - The context profile
   * @param taskPlanner - The task planner
   * @returns Whether the modified plan was confirmed
   */
  private static async modifyPlan(
    taskPlan: any,
    processedInput: string,
    contextProfile: any,
    taskPlanner: any
  ): Promise<boolean> {
    const { planFeedback } = await inquirer.prompt<{ planFeedback: string }>([
      {
        type: 'input',
        name: 'planFeedback',
        message: 'Please provide feedback on how to modify the plan:',
      }
    ]);
    
    // Rebuild the plan with user feedback
    console.log(chalk.yellow('\nRebuilding plan based on your feedback...'));
    const spinner = ora('Rebuilding plan...').start();
    
    // Append user feedback to the original request
    const modifiedRequest = `${processedInput}\n\nUser feedback on the plan: ${planFeedback}`;
    
    try {
      // Recreate the task plan with the modified request
      const updatedTaskPlan = await taskPlanner.createTaskPlan(
        modifiedRequest,
        contextProfile
      );
      
      // Update the original task plan
      Object.assign(taskPlan, updatedTaskPlan);
      
      // Regenerate explanation
      const updatedTaskPlanExplanation = taskPlanner.getExplanation(taskPlan);
      
      // Show the updated plan
      spinner.stop();
      console.log(chalk.cyan('\n--- Updated Task Plan ---'));
      console.log(updatedTaskPlanExplanation);
      console.log(chalk.cyan('--- End of Updated Task Plan ---\n'));
      
      const { updatedPlanConfirmation } = await inquirer.prompt<{ updatedPlanConfirmation: string }>([
        {
          type: 'list',
          name: 'updatedPlanConfirmation',
          message: 'Do you want to proceed with this updated plan?',
          choices: ['Yes, proceed with this plan', 'No, cancel the plan']
        }
      ]);
      
      return updatedPlanConfirmation === 'Yes, proceed with this plan';
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Error modifying plan: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return false;
    }
  }

  /**
   * Executes a task plan
   * @param taskPlan - The task plan
   * @param selectedLLM - The selected LLM
   * @param taskExecutor - The task executor
   * @param conversationContext - The conversation context
   * @returns Task planning result
   */
  public static async executeTaskPlan(
    taskPlan: any,
    selectedLLM: BaseLLM,
    taskExecutor: any,
    conversationContext: { contextString: string; history: Array<{ role: string; content: string }> }
  ): Promise<TaskPlanResult> {
    if (!taskPlan.subtasks || taskPlan.subtasks.length === 0) {
      return {
        tasksExecuted: false,
        taskPlanExplanation: taskPlan.explanation,
        selectedLLM
      };
    }
    
    // Create base prompt from conversation context
    let basePrompt = '';
    
    // Add context if available
    if (conversationContext.contextString) {
      basePrompt += `${conversationContext.contextString}\n`;
    }
    
    // Add history
    for (const message of conversationContext.history) {
      basePrompt += `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}\n`;
    }
    
    // Execute the subtasks
    const success = await taskExecutor.executeSubtasks(
      taskPlan.subtasks,
      taskPlan.executionOrder,
      selectedLLM,
      basePrompt
    );
    
    return {
      tasksExecuted: success,
      taskPlanExplanation: taskPlan.explanation,
      selectedLLM
    };
  }
}
