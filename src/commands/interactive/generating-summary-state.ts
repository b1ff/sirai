import chalk from 'chalk';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

/**
 * State for generating a summary
 */
export class GeneratingSummaryState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();
    const taskPlan = contextData.getCurrentPlan();

    if (taskPlan) {
      // Generate a summary of the executed tasks
      console.log(chalk.cyan('\n--- Task Execution Summary ---'));

      if (taskPlan.subtasks && taskPlan.subtasks.length > 0) {
        console.log(chalk.green('The following tasks were executed:'));

        for (let i = 0; i < taskPlan.subtasks.length; i++) {
          const subtask = taskPlan.subtasks[i];
          console.log(chalk.yellow(`${i + 1}. ${subtask.taskSpecification}`));
        }
      } else {
        console.log(chalk.yellow('No tasks were executed.'));
      }

      console.log(chalk.cyan('--- End of Summary ---\n'));
    }

    // Reset the current plan
    contextData.setCurrentPlan(null);

    return StateType.WAITING_FOR_INPUT;
  }

  public enter(context: StateContext): void {
    // Nothing to do
  }

  public exit(context: StateContext): void {
    // Nothing to do
  }
}
