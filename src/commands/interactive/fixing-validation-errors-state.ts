import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import chalk from 'chalk';
import { ValidationStatus, ImplementationDetails } from '../../task-planning/schemas.js';
import { TaskExecutor } from './task-executor.js';
import { LLMFactory } from '../../llm/factory.js';
import { ConfigBuilder } from '../../config/config-builder.js';

/**
 * State for automatically fixing validation errors
 */
export class FixingValidationErrorsState implements State {
    private static MAX_FIX_ATTEMPTS = 3;
    private fixAttempts: number = 0;

    public async process(context: StateContext): Promise<StateType> {
        const contextData = context.getContextData();
        const taskPlan = contextData.getCurrentPlan();
        let config = contextData.getConfig();
        const llm = await LLMFactory.getBestLLM(config, {
            taskType: 'validation',
        });

        if (!taskPlan || !taskPlan.validationResult) {
            console.error(chalk.red('No validation result available for fixing'));
            return StateType.WAITING_FOR_INPUT;
        }

        const validationResult = taskPlan.validationResult;

        // Increment fix attempts counter
        this.fixAttempts++;

        // Check if we've reached the maximum number of fix attempts
        if (this.fixAttempts >= FixingValidationErrorsState.MAX_FIX_ATTEMPTS) {
            console.log(chalk.yellow(`Maximum fix attempts (${FixingValidationErrorsState.MAX_FIX_ATTEMPTS}) reached. Falling back to manual confirmation.`));
            return this.fallbackToManualConfirmation(validationResult, taskPlan, contextData);
        }

        console.log(chalk.cyan(`Attempting to automatically fix validation errors (attempt ${this.fixAttempts}/${FixingValidationErrorsState.MAX_FIX_ATTEMPTS})...`));

        // Extract suggested fixes from validation result
        if (!validationResult.suggestedFixes) {
            console.log(chalk.yellow('No suggested fixes available. Falling back to manual confirmation.'));
            return this.fallbackToManualConfirmation(validationResult, taskPlan, contextData);
        }

        // Get TaskExecutor from context
        const taskExecutor = contextData.getTaskExecutor();
        if (!taskExecutor) {
            console.error(chalk.red('TaskExecutor not available. Falling back to manual confirmation.'));
            return this.fallbackToManualConfirmation(validationResult, taskPlan, contextData);
        }

        // Create a prompt for LLM-based fixes
        const basePrompt = await taskExecutor.createTaskPrompt();
        const fixPrompt = this.buildFixPrompt(validationResult, taskPlan);
        
        // Generate a unique task ID for this fix attempt
        const fixTaskId = `validation-fix-${Date.now()}`;
        
        // Execute the LLM-based fix
        console.log(chalk.cyan('Executing LLM-based fix for validation errors...'));
        const result = await taskExecutor.executeTask(basePrompt, fixPrompt, llm, fixTaskId, true);
        
        // Handle the result of the task execution
        if (result.success) {
            console.log(chalk.green('Successfully applied fixes for validation errors'));
            
            // Store implementation details in the task plan
            if (!taskPlan.implementationDetails) {
                taskPlan.implementationDetails = result.implementationDetails;
            }
            
            // Return to validation state to check if fixes resolved the issues
            return StateType.VALIDATING_TASKS;
        } else {
            console.log(chalk.yellow('Failed to apply fixes for validation errors'));
            
            // If we still have attempts left, we'll try again in the next iteration
            // Otherwise, fallback to manual confirmation will happen in the next iteration
            return StateType.FIXING_VALIDATION_ERRORS;
        }
    }

    private fallbackToManualConfirmation(validationResult: any, taskPlan: any, contextData: any): StateType {
        // Display validation failure details
        this.displayValidationFailure(validationResult);
        
        // Reset fix attempts counter
        this.fixAttempts = 0;
        
        // Return to VALIDATING_TASKS state which will handle user confirmation
        return StateType.VALIDATING_TASKS;
    }

    private displayValidationFailure(validationResult: any): void {
        console.log(chalk.red('✗ Validation failed: ') + validationResult.message);

        if (validationResult.failedTasks && validationResult.failedTasks.length > 0) {
            console.log(chalk.yellow('Failed tasks:'));
            validationResult.failedTasks.forEach((task: string) => {
                console.log(chalk.yellow(`  - ${task}`));
            });
        }

        if (validationResult.suggestedFixes) {
            console.log(chalk.cyan('Suggested fixes:'));
            console.log(validationResult.suggestedFixes);
        }
    }

    private buildRegenerationFeedback(validationResult: any, taskPlan: any): string {
        return `Please fix the following issues with the previous task execution:\n\n` +
            `${validationResult.message}\n\n` +
            (validationResult.suggestedFixes ?
                `Suggested fixes: ${validationResult.suggestedFixes}\n\n` : '') +
            `Original request: ${taskPlan.originalRequest}`;
    }

    private buildFixPrompt(validationResult: any, taskPlan: any): string {
        let prompt = `Title: Fix Validation Errors in Task Implementation

`;
        
        prompt += `Context of the task: The current implementation has validation errors that need to be fixed.

`;
        
        prompt += `Goal: Fix the validation errors in the current implementation.

`;
        
        prompt += `Validation Error Details:\n${validationResult.message}\n\n`;
        
        if (validationResult.failedTasks && validationResult.failedTasks.length > 0) {
            prompt += `Failed Tasks:\n`;
            validationResult.failedTasks.forEach((task: string) => {
                prompt += `- ${task}\n`;
            });
            prompt += `\n`;
        }
        
        if (validationResult.suggestedFixes) {
            prompt += `Suggested Fixes:\n${validationResult.suggestedFixes}\n\n`;
        }
        
        prompt += `Original Request: ${taskPlan.originalRequest}\n\n`;
        
        prompt += `Requirements:\n`;
        prompt += `1. Apply the suggested fixes to resolve the validation errors\n`;
        prompt += `2. Maintain consistency with the existing codebase\n`;
        prompt += `3. Ensure all validation errors are addressed\n`;
        
        return prompt;
    }

    public enter(context: StateContext): void {
        console.log(chalk.cyan('Entering automatic validation error fixing state...'));
    }

    public exit(context: StateContext): void {
        // Reset fix attempts counter when exiting the state
        this.fixAttempts = 0;
    }
}
