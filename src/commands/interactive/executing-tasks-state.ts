import chalk from 'chalk';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { ConversationContext } from './types.js';

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

      // No need to retry here as retries are now handled at the subtask level

      return StateType.GENERATING_SUMMARY;
    } catch (error) {
      console.error(chalk.red(`Error executing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return StateType.GENERATING_SUMMARY;
    }
  }

  public enter(context: StateContext): void {
    // Nothing to do
  }

  public exit(context: StateContext): void {
    // Nothing to do
  }
}
