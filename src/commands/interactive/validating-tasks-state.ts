import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { ReadFileTool, RunProcessTool, StoreValidationResultTool } from '../../llm/tools/index.js';
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
            const projectRoot = contextData.getProjectContext('projectRoot');
            
            // Check if auto-validation is enabled and commands are configured
            const validationConfig = contextData.getConfig().validation || {};
            const autoValidationEnabled = validationConfig.enabled === true;
            const validationCommands = validationConfig.commands || [];
            
            // Collect validation command outputs
            let validationCommandOutputs = '';
            
            if (autoValidationEnabled && validationCommands.length > 0) {
                console.log(chalk.cyan('Running auto-validation commands...'));
                
                // Create RunProcessTool for executing validation commands
                const runProcessTool = new RunProcessTool({
                    trustedCommands: validationCommands
                }, async () => true);
                
                // Execute each validation command and collect outputs
                for (const command of validationCommands) {
                    try {
                        console.log(chalk.cyan(`Executing validation command: ${command}`));
                        const output = await runProcessTool.execute({ command });
                        validationCommandOutputs += `\n\nCommand: ${command}\nOutput:\n${output}`;
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(chalk.yellow(`Warning: Validation command failed: ${errorMessage}`));
                        validationCommandOutputs += `\n\nCommand: ${command}\nError: ${errorMessage}`;
                    }
                }
                
                console.log(chalk.green('Auto-validation commands completed'));
            }
            
            // Invoke LLM with the validation tool
            await llm.generate(undefined,
                `Validate the execution of the following task plan using these validation instructions:
                
                ${taskPlan.validationInstructions}
                ${validationCommandOutputs ? '\n\nValidation Command Results:' + validationCommandOutputs : ''}
                
                Use the storeValidationResult tool to provide your validation with:
                1. status: "passed" if validation passed, "failed" if it failed
                2. message: A detailed explanation of the validation results
                3. failedTasks: If failed, list the specific tasks that failed
                4. suggestedFixes: If failed, provide specific suggestions for fixing the issues
                
                Do not run "interactive" commands, since you won't be able to interact with it and exit it.
                Be thorough in your validation and provide actionable feedback.`,
                {
                    tools: [
                        storeValidationResultTool,
                        new ReadFileTool(projectRoot),
                        new RunProcessTool({
                            trustedCommands: validationConfig.commands || []
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
            
            // Get token usage and cost statistics
            const tokenUsage = llm.getTokenUsage();
            const costInUSD = llm.getCostInUSD();
            
            // Display token usage and cost information
            console.log(chalk.blue('Token Usage Statistics:'));
            console.log(chalk.blue(`Total tokens used: ${tokenUsage.toLocaleString()}`));
            console.log(chalk.blue(`Total cost: ${costInUSD.toFixed(4)} USD`));
            console.log();
            
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
            
            // Try to get token usage and cost even in case of error
            try {
                const llm = contextData.getLLM();
                if (llm) {
                    const tokenUsage = llm.getTokenUsage();
                    const costInUSD = llm.getCostInUSD();
                    
                    console.log(chalk.blue('Token Usage Statistics:'));
                    console.log(chalk.blue(`Total tokens used: ${tokenUsage.toLocaleString()}`));
                    console.log(chalk.blue(`Total cost: ${costInUSD.toFixed(4)} USD`));
                    console.log();
                }
            } catch (usageError) {
                console.error(chalk.yellow('Could not retrieve token usage statistics'));
            }
            
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
