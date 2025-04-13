import chalk from 'chalk';
import ora from 'ora';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

/**
 * State for generating a plan
 */
export class GeneratingPlanState implements State {
    public async process(context: StateContext): Promise<StateType> {
        const contextData = context.getContextData();
        const spinner = ora('Building task plan...').start();

        try {
            // Get project context for task planning
            const projectRoot = contextData.getProjectContext('projectRoot');
            const currentDir = contextData.getProjectContext('currentDir');

            // Get referenced files from context data
            // TODO: actually include them into llm request
            const referencedFiles: string[] = contextData.getReferencedFiles() ?? [];

            const contextProfile = await contextData.getTaskPlanner().createContextProfile(projectRoot, currentDir);

            const plannerLlm = await contextData.getTaskPlanner().initialize();
            spinner.info(`Building task plan using ${plannerLlm.provider}...`);

            // Create task plan
            const taskPlan = await contextData.getTaskPlanner().createTaskPlan(contextData.getUserInput(),contextProfile);

            // Generate explanation
            const taskPlanExplanation = contextData.getTaskPlanner().getExplanation(taskPlan);

            // Store the task plan in context data
            contextData.setCurrentPlan(taskPlan);

            // Present the plan to the user using MarkdownRenderer
            spinner.stop();
            console.log(chalk.cyan('\n--- Task Plan ---'));
            const markdownRenderer = contextData.getMarkdownRenderer();
            console.log(markdownRenderer.render(taskPlanExplanation));
            console.log(chalk.cyan('--- End of Task Plan ---\n'));

            return StateType.REVIEWING_PLAN;
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`Error planning tasks: ${error instanceof Error ? error.message : 'Unknown error'}`));

            // Generate a normal response and transition back to waiting for input
            const llm = contextData.getLLM();
            if (llm) {
                await contextData.getConversationManager().generateResponse(
                    contextData.getUserInput(),
                    llm
                );
            }

            return StateType.WAITING_FOR_INPUT;
        }
    }

    public enter(context: StateContext): void {
        // Nothing to do
    }

    public exit(context: StateContext): void {
        // Nothing to do
    }
}
