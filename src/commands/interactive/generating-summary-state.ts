import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

export class GeneratingSummaryState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();
    const taskPlan = contextData.getCurrentPlan();
    // Assuming StateContext provides access to MarkdownRenderer
    const markdownRenderer = context.getContextData().getMarkdownRenderer();

    if (taskPlan) {
      // Generate a summary of the executed tasks using Markdown
      let summaryMarkdown = '## Task Execution Summary\n\n';

      if (taskPlan.subtasks && taskPlan.subtasks.length > 0) {
        summaryMarkdown += 'The following tasks were executed:\n\n';
        taskPlan.subtasks.forEach((subtask: any, index: number) => {
          summaryMarkdown += `${index + 1}. ${subtask.taskSpecification}\n`;
        });
      } else {
        summaryMarkdown += '_No tasks were executed._\n'; // Use italics
      }
      summaryMarkdown += '\n---'; // Use standard markdown horizontal rule

      console.log(markdownRenderer.render(summaryMarkdown));
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
