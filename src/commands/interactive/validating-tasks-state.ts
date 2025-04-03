import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { RunProcessTool, StoreValidationResultTool } from '../../llm/tools/index.js';
import inquirer from 'inquirer';
import { ValidationStatus } from '../../task-planning/schemas.js';
import chalk from 'chalk';

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

            // Create validation result tool to store the validation result
            const storeValidationResultTool = new StoreValidationResultTool();
            
            // Invoke LLM with the validation tool
            await llm.generate(undefined,
                `Validate the execution of the following task plan using these validation instructions:
                
                ${taskPlan.validationInstructions}
                
                Use the storeValidationResult tool to provide your validation with:
                1. status: "passed" if validation passed, "failed" if it failed
                2. message: A detailed explanation of the validation results
                3. failedTasks: If failed, list the specific tasks that failed
                4. suggestedFixes: If failed, provide specific suggestions for fixing the issues
                
                Be thorough in your validation and provide actionable feedback.`,
                {
                    tools: [
                        storeValidationResultTool,
                        new RunProcessTool({
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
                        })
                    ]
                }
            );
            
            // Get the validation result from the tool
            const validationResult = storeValidationResultTool.getValidationResult();
            
            if (!validationResult) {
                throw new Error('No validation result was provided by the LLM');
            }

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
