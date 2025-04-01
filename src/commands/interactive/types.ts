import { BaseLLM } from '../../llm/base.js';
import { ChatMessage } from '../../utils/chat-history-manager.js';

/**
 * Interface for command options
 */
export interface CommandOptions {
  local?: boolean; // Deprecated: Use provider instead
  remote?: boolean; // Deprecated: Use provider instead
  provider?: string; // Specific provider to use
  preferredProvider?: string; // Preferred provider to use if available
  prompt?: string;
  debug?: boolean;
  taskType?: string;
  [key: string]: any;
}

/**
 * Interface for task planning result
 */
export interface TaskPlanResult {
  /**
   * Whether tasks were executed
   */
  tasksExecuted: boolean;

  /**
   * Task plan explanation
   */
  taskPlanExplanation?: string;

  /**
   * Selected LLM for task execution
   */
  selectedLLM?: BaseLLM;
}

/**
 * Interface for command handler result
 */
export interface CommandHandlerResult {
  /**
   * Whether the command was handled
   */
  handled: boolean;

  /**
   * Whether the session should exit
   */
  exit: boolean;
}

/**
 * Interface for conversation context
 */
export interface ConversationContext {
  /**
   * Project context string
   */
  contextString: string;

  /**
   * Chat history
   */
  history: ChatMessage[];

  /**
   * Task plan explanation
   */
  taskPlanExplanation?: string;
}
