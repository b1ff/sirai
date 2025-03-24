import chalk from 'chalk';
import { PromptManager } from '../../utils/prompt-manager.js';
import { ChatHistoryManager } from '../../utils/chat-history-manager.js';
import { AppConfig } from '../../config/config.js';
import { CommandHandlerResult } from './types.js';

/**
 * Class that handles commands in the interactive session
 */
export class CommandHandler {
  private promptManager: PromptManager;
  private chatHistoryManager: ChatHistoryManager;
  private config: AppConfig;

  /**
   * Creates a new command handler
   * @param promptManager - The prompt manager
   * @param chatHistoryManager - The chat history manager
   * @param config - The configuration
   */
  constructor(
    promptManager: PromptManager,
    chatHistoryManager: ChatHistoryManager,
    config: AppConfig
  ) {
    this.promptManager = promptManager;
    this.chatHistoryManager = chatHistoryManager;
    this.config = config;
  }

  /**
   * Handles a command
   * @param command - The command to handle
   * @param getLastResponse - Function to get the last response
   * @param clearHistory - Function to clear the history
   * @returns Command handler result
   */
  public async handleCommand(
    command: string,
    getLastResponse: () => string,
    clearHistory: () => void
  ): Promise<CommandHandlerResult> {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    let result: CommandHandlerResult = { handled: true, exit: false };
    
    switch (cmd) {
      case 'exit':
      case 'quit':
        console.log(chalk.yellow('Exiting chat...'));
        result.exit = true;
        break;
        
      case 'save':
        await this.handleSaveCommand(args, getLastResponse);
        break;
        
      case 'prompts':
        this.handlePromptsCommand();
        break;
        
      case 'clear':
        clearHistory();
        console.log(chalk.yellow('Chat history cleared'));
        break;
        
      default:
        console.error(chalk.red(`Unknown command: ${cmd}`));
        result.handled = false;
        break;
    }
    
    return result;
  }

  /**
   * Handles the save command
   * @param args - Command arguments
   * @param getLastResponse - Function to get the last response
   */
  private async handleSaveCommand(
    args: string[],
    getLastResponse: () => string
  ): Promise<void> {
    if (args.length === 0) {
      console.error(chalk.red('Please provide a name for the prompt'));
      return;
    }
    
    const promptName = args.join(' ');
    const lastResponse = getLastResponse();
    
    if (!lastResponse) {
      console.error(chalk.red('No response to save'));
      return;
    }
    
    if (this.promptManager.savePrompt(promptName, lastResponse)) {
      console.log(chalk.green(`Prompt saved as: ${promptName}`));
    }
  }

  /**
   * Handles the prompts command
   */
  private handlePromptsCommand(): void {
    const prompts = this.promptManager.getPromptList();
    if (prompts.length === 0) {
      console.log(chalk.yellow('No prompts available'));
    } else {
      console.log(chalk.yellow('Available prompts:'));
      prompts.forEach(prompt => {
        console.log(chalk.cyan(`  ${prompt}`));
      });
    }
  }
}
