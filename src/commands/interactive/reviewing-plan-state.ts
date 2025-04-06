import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { LLMFactory } from '../../llm/factory.js';
import { ComplexityLevel } from '../../task-planning/index.js';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

export class ReviewingPlanState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();
    const taskPlan = contextData.getCurrentPlan();

    if (!taskPlan) {
      console.error(chalk.red('No task plan to review'));
      return StateType.WAITING_FOR_INPUT;
    }

    try {
      // Ask for confirmation
      const { planConfirmation } = await inquirer.prompt<{ planConfirmation: string }>([
        {
          type: 'list',
          name: 'planConfirmation',
          message: 'Do you want to proceed with this plan?',
          choices: ['Yes, proceed with this plan', 'No, I want to modify the plan', 'No, cancel the plan']
        }
      ]);

      if (planConfirmation === 'No, cancel the plan') {
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

      if (planConfirmation === 'No, I want to modify the plan') {
        // Get feedback on how to modify the plan
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

        // Get project context for task planning
        const projectRoot = contextData.getProjectContext('projectRoot');
        const currentDir = contextData.getProjectContext('currentDir');

        const contextProfile = await contextData.getTaskPlanner().createContextProfile(
          projectRoot,
          currentDir
        );

        // Append user feedback to the original request
        const modifiedRequest = `${contextData.getUserInput()}\n\nUser feedback on the plan: ${planFeedback}`;

        // Recreate the task plan with the modified request
        const updatedTaskPlan = await contextData.getTaskPlanner().createTaskPlan(
          modifiedRequest,
          contextProfile
        );

        // Update the original task plan
        contextData.setCurrentPlan(updatedTaskPlan);

        // Regenerate explanation
        const updatedTaskPlanExplanation = contextData.getTaskPlanner().getExplanation(updatedTaskPlan);

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

        if (updatedPlanConfirmation === 'No, cancel the plan') {
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

      // Select LLM based on complexity
      const currentLLM = contextData.getLLM();
      if (!currentLLM) {
        console.error(chalk.red('No LLM available'));
        return StateType.WAITING_FOR_INPUT;
      }

      let selectedLLM = currentLLM;

      if (taskPlan.overallComplexity === ComplexityLevel.HIGH) {
        // Use remote LLM for high complexity tasks
        if (!contextData.getOptions().local) {
          try {
            selectedLLM = LLMFactory.createRemoteLLM(contextData.getConfig());
            console.log(chalk.yellow(`Using remote LLM for ${taskPlan.overallComplexity} complexity task...`));
          } catch (error) {
            // Fall back to current LLM if remote fails
            console.log(chalk.yellow('Failed to use remote LLM, falling back to current LLM.'));
          }
        }
      } else if (taskPlan.overallComplexity === ComplexityLevel.LOW) {
        // Use local LLM for low complexity tasks
        if (!contextData.getOptions().remote) {
          try {
            selectedLLM = LLMFactory.createLocalLLM(contextData.getConfig());
            console.log(chalk.yellow(`Using local LLM for ${taskPlan.overallComplexity} complexity task...`));
          } catch (error) {
            // Fall back to current LLM if local fails
            console.log(chalk.yellow('Failed to use local LLM, falling back to current LLM.'));
          }
        }
      }

      // Store the selected LLM in context data
      contextData.setLLM(selectedLLM);

      return StateType.EXECUTING_TASKS;
    } catch (error) {
      console.error(chalk.red(`Error reviewing plan: ${error instanceof Error ? error.message : 'Unknown error'}`));

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
