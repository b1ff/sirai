import chalk from 'chalk';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { ConversationContext } from './types.js';
import { TaskPlan, Subtask } from '../../task-planning/schemas.js';
import { TaskStatus } from '../interactive/task-types.js';

/**
 * State for executing tasks
 */
export class ExecutingTasksState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();
    const taskPlan = contextData.getCurrentPlan();

    if (!taskPlan || !taskPlan.subtasks || taskPlan.subtasks.length === 0) {
      console.error(chalk.red('No subtasks to execute'));
      return StateType.GENERATING_SUMMARY;
    }

    try {
      // Create base prompt from conversation context
      const conversationContext: ConversationContext = {
        contextString: '',
        history: []
      };

      // Get conversation context
      const conversationManager = contextData.getConversationManager();
      if (conversationManager) {
        const context = conversationManager.getContext();
        conversationContext.contextString = context.contextString;
        conversationContext.history = context.history;
      }

      // Create base prompt
      let basePrompt = '';

      // Add context if available
      if (conversationContext.contextString) {
        basePrompt += `${conversationContext.contextString}\n`;
      }

      // Add history
      for (const message of conversationContext.history) {
        basePrompt += `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}\n`;
      }

      // Execute the subtasks
      const llm = contextData.getLLM();
      if (!llm) {
        console.error(chalk.red('No LLM available'));
        return StateType.GENERATING_SUMMARY;
      }

      const success = await contextData.getTaskExecutor().executeSubtasks(
        taskPlan.subtasks,
        taskPlan.executionOrder,
        llm,
        basePrompt
      );

      return StateType.VALIDATING_TASKS;
    } catch (error) {
      console.error(chalk.red(`Error executing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return StateType.VALIDATING_TASKS;
    }
  }

  public enter(context: StateContext): void {
    try {
      // Display task history summary if available
      const taskHistory = context.getContextData().getTaskHistoryManager().getCompletedTasks();
      
      if (taskHistory && taskHistory.length > 0) {
        const historyMarkdown = this.formatTaskHistorySummary(taskHistory);
        console.log(chalk.cyan('\n=== Previous Task History ==='));
        context.getContextData().getMarkdownRenderer().render(historyMarkdown);
        console.log(chalk.cyan('=== Starting New Tasks ===\n'));
      }
    } catch (error) {
      console.error(chalk.yellow(`Unable to display task history: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Formats the task history into a markdown summary
   */
  private formatTaskHistorySummary(taskHistory: TaskPlan[]): string {
    let markdown = '### Recently Completed Tasks\n\n';
    
    // Show the most recent tasks first (up to 5)
    const recentTasks = taskHistory.slice(-5).reverse();
    
    if (recentTasks.length === 0) {
      return '';
    }
    
    recentTasks.forEach((task, index) => {
      markdown += `**${index + 1}. ${task.originalRequest ? task.originalRequest.substring(0, 50) + '...' : 'Untitled Task'}**\n`;
      
      if (task.subtasks && task.subtasks.length > 0) {
        markdown += '   Subtasks:\n';
        task.subtasks.forEach((subtask: Subtask) => {
          const status = subtask.status === TaskStatus.COMPLETED ? '✅' : '⏳';
          markdown += `   - ${status} ${subtask.specification || 'Untitled Subtask'}\n`;
        });
      }
      
      markdown += '\n';
    });
    
    return markdown;
  }

  public exit(context: StateContext): void {
    // Nothing to do
  }
}
