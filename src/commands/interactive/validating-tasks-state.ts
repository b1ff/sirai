import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { RunProcessTool } from '../../llm/tools/index.js';
import inquirer from 'inquirer';
import { ValidationStatus, ValidationResult } from '../../task-planning/schemas.js';
import chalk from 'chalk';
import { z } from 'zod';

/**
 * State for validating executed tasks
 */
export class ValidatingTasksState implements State {
    public async process(context: StateContext): Promise<StateType> {
        const contextData = context.getContextData();
        const taskPlan = contextData.getCurrentPlan();

        if (!taskPlan || !taskPlan.validationInstructions) {
            console.error(chalk.red('No validation instructions available'));
            return StateType.GENERATING_PLAN;
        }

        try {
            const llm = contextData.getLLM();
            if (!llm) {
                console.error(chalk.red('No LLM available'));
                return StateType.GENERATING_PLAN;
            }

            console.log(chalk.cyan('Validating task execution...'));

            // Use structured output for validation to get reliable results
            const validationResult = await llm.withStructuredOutput<ValidationResult>(
                z.object({
                    status: z.enum([ValidationStatus.PASSED, ValidationStatus.FAILED]),
                    message: z.string(),
                    failedTasks: z.array(z.string()).optional(),
                    suggestedFixes: z.string().optional()
                })
            ).invoke(
                `Validate the execution of the following task plan using these validation instructions:
                
                ${taskPlan.validationInstructions}
                
                Return a structured response with:
                1. status: "passed" if validation passed, "failed" if it failed
                2. message: A detailed explanation of the validation results
                3. failedTasks: If failed, list the specific tasks that failed
                4. suggestedFixes: If failed, provide specific suggestions for fixing the issues
                
                Be thorough in your validation and provide actionable feedback.`,
                {
                    tools: [new RunProcessTool({
                        trustedCommands: []
                    }, async command => {
                        const { confirmation } = await inquirer.prompt<{ confirmation: string }>([
                            {
                                type: 'list',
                                name: 'confirmation',
                                message: `Do you allow to run "${command}"?`,
                                choices: ['Yes', 'No'],
                                default: 'Yes'
                            }
                        ]);

                        return confirmation === 'Yes';
                    })]
                }
            );

            // Store validation result in the task plan
            taskPlan.validationResult = validationResult;
            
            // Display validation results to the user
            if (validationResult.status === ValidationStatus.PASSED) {
                console.log(chalk.green('✓ Validation passed: ') + validationResult.message);
                return StateType.WAITING_FOR_INPUT;
            } else {
                console.log(chalk.red('✗ Validation failed: ') + validationResult.message);
                
                if (validationResult.failedTasks && validationResult.failedTasks.length > 0) {
                    console.log(chalk.yellow('Failed tasks:'));
                    validationResult.failedTasks.forEach(task => {
                        console.log(chalk.yellow(`  - ${task}`));
                    });
                }
                
                if (validationResult.suggestedFixes) {
                    console.log(chalk.cyan('Suggested fixes:'));
                    console.log(validationResult.suggestedFixes);
                }
                
                // Ask user if they want to regenerate the plan with the validation feedback
                const { regenerate } = await inquirer.prompt<{ regenerate: boolean }>([
                    {
                        type: 'confirm',
                        name: 'regenerate',
                        message: 'Do you want to regenerate the plan with validation feedback?',
                        default: true
                    }
                ]);
                
                if (regenerate) {
                    // Set user input to include validation feedback for the next planning cycle
                    contextData.setUserInput(
                        `Please fix the following issues with the previous task execution:\n\n` +
                        `${validationResult.message}\n\n` +
                        (validationResult.suggestedFixes ? 
                            `Suggested fixes: ${validationResult.suggestedFixes}\n\n` : '') +
                        `Original request: ${taskPlan.originalRequest}`
                    );
                    return StateType.GENERATING_PLAN;
                } else {
                    return StateType.WAITING_FOR_INPUT;
                }
            }
        } catch (error) {
            console.error(chalk.red(`Error validating tasks: ${error instanceof Error ? error.message : 'Unknown error'}`));
            return StateType.GENERATING_PLAN;
        }
    }

    public enter(context: StateContext): void {
        // Nothing to do
    }

    public exit(context: StateContext): void {
        // Nothing to do
    }
}
