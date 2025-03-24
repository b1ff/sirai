import chalk from 'chalk';
import ora from 'ora';
import { LLMFactory } from '../../llm/factory.js';
import { PromptManager } from '../../utils/prompt-manager.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { CommandOptions } from './types.js';
import { AppConfig } from '../../config/config.js';

/**
 * Main class that manages the interactive session using a state machine
 */
export class InteractiveSession {
  private stateContext: StateContext;

  constructor(options: CommandOptions, config: AppConfig) {
    this.stateContext = new StateContext(options, config);
  }

  public async start(): Promise<void> {
    console.log(chalk.cyan('Starting interactive chat session...'));

    // Initialize LLM
    await this.initializeLLM();

    // Load initial prompt if provided
    this.loadInitialPrompt();

    // Load chat history
    this.stateContext.getContextData().getConversationManager().loadHistory();

    // Display welcome message
    this.displayWelcomeMessage();

    // Start the state machine
    await this.stateContext.transition(StateType.WAITING_FOR_INPUT);
  }

  /**
   * Loads the initial prompt if provided
   */
  private loadInitialPrompt(): void {
    const contextData = this.stateContext.getContextData();
    const options = contextData.getOptions();

    if (!options.prompt) return;

    const promptManager = new PromptManager(contextData.getConfig());
    const promptContent = promptManager.loadPrompt(options.prompt);

    if (promptContent) {
      console.log(chalk.yellow(`Loaded prompt: ${options.prompt}`));
      contextData.setInitialPrompt(promptContent);
    } else {
      console.error(chalk.red(`Prompt not found: ${options.prompt}`));
    }
  }

  /**
   * Displays the welcome message
   */
  private displayWelcomeMessage(): void {
    console.log(chalk.green('\nWelcome to SirAi! Type your message or use these commands:'));
    console.log(chalk.yellow('  /exit, /quit - Exit the chat'));
    console.log(chalk.yellow('  /save <name> - Save the last response as a prompt'));
    console.log(chalk.yellow('  /prompts - List available prompts'));
    console.log(chalk.yellow('  /clear - Clear the chat history'));
    console.log(chalk.yellow('  @<promptname> - Use a stored prompt\n'));
  }

  private async initializeLLM(): Promise<void> {
    try {
      const spinner = ora('Initializing LLM...').start();
      const contextData = this.stateContext.getContextData();

      // Get LLM options
      const options = contextData.getOptions();
      const llmOptions = {
        localOnly: options.local,
        remoteOnly: options.remote,
        preferLocal: !options.remote
      };

      const llm = await LLMFactory.getBestLLM(contextData.getConfig(), llmOptions);
      contextData.setLLM(llm);
      spinner.succeed(`Using ${llm.provider}`);
    } catch (error) {
      console.error(chalk.red('Error initializing LLM'));
    }
  }
}
