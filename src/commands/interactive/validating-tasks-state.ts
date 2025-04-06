import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { ReadFileTool, RunProcessTool, StoreValidationResultTool } from '../../llm/tools/index.js';
import inquirer from 'inquirer';
import { ValidationStatus } from '../../task-planning/schemas.js';
import chalk from 'chalk';
import { BaseLLM } from '../../llm/base.js';
import { ContextData } from './context-data.js';
import { LLMFactory } from '../../llm/factory.js';

export class ValidatingTasksState implements State {
    public async process(context: StateContext): Promise<StateType> {
        const contextData = context.getContextData();
        const taskPlan = contextData.getCurrentPlan();
        const defaultLLM = contextData.getLLM();

        if (!this.validatePreconditions(taskPlan, defaultLLM)) {
            return StateType.GENERATING_PLAN;
        }

        try {
            console.log(chalk.cyan('Validating task execution...'));

            const validationConfig = this.getValidationConfig(contextData);
            const validationCommandOutputs = await this.runAutoValidationCommands(validationConfig);
            const storeValidationResultTool = new StoreValidationResultTool();

            // Try to get a validation-specific LLM, fall back to default if not available
            let validationLLM: BaseLLM | null = null;
            try {
                validationLLM = await LLMFactory.getBestLLM(contextData.getConfig(), { taskType: 'validation' });
                console.log(chalk.cyan('Using validation-specific LLM model'));
            } catch (error) {
                console.log(chalk.yellow('Validation-specific LLM not available, using default LLM'));
                validationLLM = defaultLLM;
            }

            await this.invokeValidationLLM(validationLLM, taskPlan, validationCommandOutputs, storeValidationResultTool, contextData);
            this.printUsedTokens(validationLLM);

            const validationResult = storeValidationResultTool.getValidationResult();
            if (!validationResult) {
                throw new Error('No validation result was provided by the LLM');
            }

            taskPlan.validationResult = validationResult;

            // Clean up validation LLM if it's different from the default LLM
            if (validationLLM !== defaultLLM) {
                try {
                    await validationLLM.dispose();
                } catch (error) {
                    console.warn(chalk.yellow('Error disposing validation LLM:', error instanceof Error ? error.message : 'Unknown error'));
                }
            }

            return this.handleValidationResult(validationResult, taskPlan, contextData);
        } catch (error) {
            this.handleError(error, contextData);
            return StateType.GENERATING_PLAN;
        }
    }

    private validatePreconditions(taskPlan: any, llm: BaseLLM | null): llm is BaseLLM {
        if (!taskPlan || !taskPlan.validationInstructions) {
            console.error(chalk.red('No validation instructions available'));
            return false;
        }

        if (!llm) {
            console.error(chalk.red('No LLM available'));
            return false;
        }

        return true;
    }

    private getValidationConfig(contextData: ContextData): {
        enabled: boolean;
        commands: string[]
    } {
        const validationConfig = contextData.getConfig().validation || {};
        return {
            enabled: validationConfig.enabled === true,
            commands: validationConfig.commands || []
        };
    }

    private async runAutoValidationCommands(config: { enabled: boolean; commands: string[] }): Promise<string> {
        if (!config.enabled || config.commands.length === 0) {
            return '';
        }

        console.log(chalk.cyan('Running auto-validation commands...'));
        let validationCommandOutputs = '';

        const runProcessTool = new RunProcessTool({
            trustedCommands: config.commands
        }, async () => true);

        for (const command of config.commands) {
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
        return validationCommandOutputs;
    }

    private async invokeValidationLLM(
        llm: BaseLLM,
        taskPlan: any,
        validationCommandOutputs: string,
        storeValidationResultTool: StoreValidationResultTool,
        contextData: ContextData
    ): Promise<void> {
        const projectRoot = contextData.getProjectContext('projectRoot');
        const validationConfig = contextData.getConfig().validation || {};

        const validationPrompt = this.buildValidationPrompt(taskPlan, validationCommandOutputs);
        const tools = this.createValidationTools(storeValidationResultTool, projectRoot, validationConfig);

        await llm.generate(undefined, validationPrompt, { tools });
    }

    private buildValidationPrompt(taskPlan: any, validationCommandOutputs: string): string {
        return `Validate the execution of the following task plan using these validation instructions:
                
        ${taskPlan.validationInstructions}
        ${validationCommandOutputs ? '\n\nValidation Command Results:' + validationCommandOutputs : ''}
        
        Use the storeValidationResult tool to provide your validation with:
        1. status: "passed" if validation passed, "failed" if it failed
        2. message: A detailed explanation of the validation results
        3. failedTasks: If failed, list the specific tasks that failed
        4. suggestedFixes: If failed, provide specific suggestions for fixing the issues
        
        Do not run "interactive" commands, since you won't be able to interact with it and exit it.
        Be thorough in your validation and provide actionable feedback.`;
    }

    private createValidationTools(
        storeValidationResultTool: StoreValidationResultTool,
        projectRoot: string,
        validationConfig: any
    ): any[] {
        return [
            storeValidationResultTool,
            new ReadFileTool(projectRoot),
            new RunProcessTool({
                trustedCommands: validationConfig.commands || []
            }, this.createCommandConfirmationHandler())
        ];
    }

    private createCommandConfirmationHandler(): (command: string) => Promise<boolean> {
        return async (command: string) => {
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
        };
    }

    private async handleValidationResult(validationResult: any, taskPlan: any, contextData: ContextData): Promise<StateType> {
        if (validationResult.status === ValidationStatus.PASSED) {
            console.log(chalk.green('✓ Validation passed: ') + validationResult.message);
            return StateType.WAITING_FOR_INPUT;
        } else {
            this.displayValidationFailure(validationResult);
            return await this.handleFailedValidation(validationResult, taskPlan, contextData);
        }
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

    private async handleFailedValidation(validationResult: any, taskPlan: any, contextData: any): Promise<StateType> {
        const { regenerate } = await inquirer.prompt<{ regenerate: boolean }>([
            {
                type: 'confirm',
                name: 'regenerate',
                message: 'Do you want to regenerate the plan with validation feedback?',
                default: true
            }
        ]);

        if (regenerate) {
            const feedback = this.buildRegenerationFeedback(validationResult, taskPlan);
            contextData.setUserInput(feedback);
            return StateType.GENERATING_PLAN;
        } else {
            return StateType.WAITING_FOR_INPUT;
        }
    }

    private buildRegenerationFeedback(validationResult: any, taskPlan: any): string {
        return `Please fix the following issues with the previous task execution:\n\n` +
            `${validationResult.message}\n\n` +
            (validationResult.suggestedFixes ?
                `Suggested fixes: ${validationResult.suggestedFixes}\n\n` : '') +
            `Original request: ${taskPlan.originalRequest}`;
    }

    private handleError(error: unknown, contextData: ContextData): void {
        console.error(chalk.red(`Error validating tasks: ${error instanceof Error ? error.message : 'Unknown error'}`));

        try {
            const llm = contextData.getLLM();
            if (llm) {
                this.printUsedTokens(llm);
            }
        } catch (usageError) {
            console.error(chalk.yellow('Could not retrieve token usage statistics'));
        }
    }

    private printUsedTokens(llm: BaseLLM): void {
        const tokenUsage = llm.getTokenUsage();
        const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
        const costInUSD = llm.getCostInUSD();

        console.log(chalk.blue('Token Usage Statistics:'));
        console.log(chalk.blue(`Total tokens used: ${totalTokens.toLocaleString()}`));
        console.log(chalk.blue(`Total cost: ${costInUSD.toFixed(4)} USD`));
        console.log();
    }

    public enter(context: StateContext): void {
        // No-op
    }

    public exit(context: StateContext): void {
        // No-op
    }
}
