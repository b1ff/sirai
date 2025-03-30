import chalk from 'chalk';
import { BaseLLM } from '../../llm/base.js';
import { CodeRenderer } from '../../utils/code-renderer.js';
import { PromptManager } from '../../utils/prompt-manager.js';
import { ChatHistoryManager, ChatMessage } from '../../utils/chat-history-manager.js';
import { AppConfig } from '../../config/config.js';
import { ProjectContext } from '../../utils/project-context.js';
import { ConversationContext } from './types.js';

/**
 * Class that manages the conversation flow
 */
export class ConversationManager {
  private codeRenderer: CodeRenderer;
  private promptManager: PromptManager;
  private chatHistoryManager: ChatHistoryManager;
  private config: AppConfig;
  private history: ChatMessage[] = [];
  private projectContext: ProjectContext;
  private contextString: string = '';

  /**
   * Creates a new conversation manager
   * @param codeRenderer - The code renderer
   * @param promptManager - The prompt manager
   * @param chatHistoryManager - The chat history manager
   * @param config - The configuration
   * @param projectContext - The project context
   */
  constructor(
    codeRenderer: CodeRenderer,
    promptManager: PromptManager,
    chatHistoryManager: ChatHistoryManager,
    config: AppConfig,
    projectContext: ProjectContext
  ) {
    this.codeRenderer = codeRenderer;
    this.promptManager = promptManager;
    this.chatHistoryManager = chatHistoryManager;
    this.config = config;
    this.projectContext = projectContext;
    
    // Get project context
    this.contextString = this.projectContext.createContextString();
  }

  /**
   * Loads chat history
   */
  public loadHistory(): void {
    if (this.config.chat?.saveHistory) {
      this.history = this.chatHistoryManager.loadHistory();
      if (this.history.length > 0) {
        console.log(chalk.yellow(`Loaded ${this.history.length} messages from chat history`));
      }
    }
  }

  /**
   * Processes user input
   * @param input - The user input
   * @returns The processed input
   */
  public processInput(input: string): string {
    // Process the input to replace prompt references
    const processedInput = this.promptManager.processMessage(input);
    
    // Add to history
    this.history.push({ role: 'user', content: processedInput });
    
    // Save history if enabled
    this.saveHistory();
    
    return processedInput;
  }

  /**
   * Generates a response to user input
   * @param input - The processed user input
   * @param llm - The LLM to use
   * @param taskPlanExplanation - Optional task plan explanation
   * @param selectedLLM - Optional selected LLM for task execution
   */
  public async generateResponse(
    input: string,
    llm: BaseLLM,
    taskPlanExplanation?: string,
    selectedLLM?: BaseLLM
  ): Promise<void> {
    try {
      console.log(chalk.blue('\nAssistant:'));
      
      // Create the prompt with context and history
      const prompt = this.createPrompt(taskPlanExplanation);
      
      // Use the selected LLM if provided, otherwise use the default LLM
      const activeLLM = selectedLLM || llm;
      
      // Generate and stream the response
      let response = '';
      await activeLLM.generateStream(prompt, input, (chunk) => {
        response += chunk;
        const renderedChunk = this.codeRenderer.renderCodeBlocks(chunk);
        process.stdout.write(renderedChunk);
      });
      
      console.log('\n');
      
      // Add to history
      this.history.push({ role: 'assistant', content: response });
      
      // Save history if enabled
      this.saveHistory();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\nError generating response: ${error.message}`));
      } else {
        console.error(chalk.red('\nError generating response: Unknown error'));
      }
    }
  }

  /**
   * Creates a prompt with context and history
   * @param taskPlanExplanation - Optional task plan explanation
   * @returns The prompt
   */
  private createPrompt(taskPlanExplanation?: string): string {
    let prompt = '';
    
    // Add context if available
    if (this.contextString) {
      prompt += `${this.contextString}\n`;
    }
    
    // Add history
    for (const message of this.history) {
      prompt += `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}\n`;
    }
    
    // Add task planning information if available
    if (taskPlanExplanation) {
      prompt += `\nTask Planning Information:\n${taskPlanExplanation}\n`;
    }
    
    return prompt;
  }

  /**
   * Saves chat history if enabled
   */
  private saveHistory(): void {
    if (this.config.chat?.saveHistory) {
      this.chatHistoryManager.saveHistory(this.history);
    }
  }

  /**
   * Clears chat history
   */
  public clearHistory(): void {
    this.history.length = 0;
    
    // Clear saved history if enabled
    if (this.config.chat?.saveHistory) {
      this.chatHistoryManager.clearHistory();
    }
  }

  /**
   * Gets the current conversation context
   * @returns The conversation context
   */
  public getContext(): ConversationContext {
    return {
      contextString: this.contextString,
      history: this.history
    };
  }

  /**
   * Gets the last response
   * @returns The last response or empty string if no response
   */
  public getLastResponse(): string {
    const assistantMessages = this.history.filter(msg => msg.role === 'assistant');
    return assistantMessages.length > 0 ? 
      assistantMessages[assistantMessages.length - 1].content : '';
  }
}
