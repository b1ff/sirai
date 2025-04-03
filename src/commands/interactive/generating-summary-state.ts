import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { TaskStatus } from './task-types.js';
import { TaskHistoryManager } from '../../utils/task-history-manager.js';
import { Subtask, TaskPlan } from '../../task-planning/schemas.js';

export class GeneratingSummaryState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();
    const taskPlan = contextData.getCurrentPlan();
    // Assuming StateContext provides access to MarkdownRenderer
    const markdownRenderer = context.getContextData().getMarkdownRenderer();
    const taskHistoryManager = context.getContextData().getTaskHistoryManager();

    if (taskPlan) {
      try {
        // Mark all subtasks as COMPLETED if not already marked
        if (taskPlan.subtasks && taskPlan.subtasks.length > 0) {
          taskPlan.subtasks.forEach((subtask: Subtask) => {
            if (!subtask.status || subtask.status !== TaskStatus.COMPLETED) {
              subtask.status = TaskStatus.COMPLETED;
            }
          });
        }

        // Add the current plan to task history
        await taskHistoryManager.addCompletedTask(taskPlan);

        // Generate a summary of the executed tasks using Markdown
        let summaryMarkdown = '## Task Execution Summary\n\n';

        if (taskPlan.subtasks && taskPlan.subtasks.length > 0) {
          summaryMarkdown += 'The following tasks were executed:\n\n';
          taskPlan.subtasks.forEach((subtask: Subtask, index: number) => {
            const statusIndicator = subtask.status === TaskStatus.COMPLETED ? '✅' : '⏳';
            summaryMarkdown += `${index + 1}. ${statusIndicator} ${subtask.taskSpecification}\n`;
          });
        } else {
          summaryMarkdown += '_No tasks were executed._\n'; // Use italics
        }

        // Add task history summary
        const taskHistory = await taskHistoryManager.getCompletedTasks();
        if (taskHistory.length > 1) { // More than just the current task
          summaryMarkdown += '\n## Previously Completed Tasks\n\n';
          
          // Show the last 5 tasks (excluding the current one)
          const previousTasks = taskHistory.slice(0, -1).slice(-5);
          previousTasks.forEach((historyItem: TaskPlan, index: number) => {
            const date = new Date(historyItem.completedAt || 0).toLocaleString();
            summaryMarkdown += `${index + 1}. **${date}**: ${historyItem.originalRequest}\n`;
            summaryMarkdown += `   - Subtasks: ${historyItem.subtasks.length}\n`;
          });
        }
        
        summaryMarkdown += '\n---'; // Use standard markdown horizontal rule

        console.log(markdownRenderer.render(summaryMarkdown));
      } catch (error) {
        console.error('Error updating task status or history:', error);
        // Still show a basic summary even if there was an error
        let errorSummaryMarkdown = '## Task Execution Summary\n\n';
        errorSummaryMarkdown += 'Task completed, but there was an error updating the task history.\n\n---';
        console.log(markdownRenderer.render(errorSummaryMarkdown));
      }
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
