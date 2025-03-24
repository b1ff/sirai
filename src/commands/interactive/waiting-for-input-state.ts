import inquirer from 'inquirer';
import chalk from 'chalk';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

/**
 * State for waiting for user input
 */
export class WaitingForInputState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();

    // If there's an initial prompt, use it and transition to gathering context
    if (contextData.getInitialPrompt()) {
      contextData.setUserInput(contextData.getInitialPrompt());
      contextData.setInitialPrompt('');
      return StateType.GATHERING_CONTEXT;
    }

    // If the session is not active, return the current state to end the loop
    if (!contextData.isSessionActive()) {
      return StateType.WAITING_FOR_INPUT;
    }

    // Otherwise, prompt the user for input
    const { userInput } = await inquirer.prompt<{ userInput: string }>([
      {
        type: 'input',
        name: 'userInput',
        message: chalk.green('You:'),
        prefix: ''
      }
    ]);

    // Check if the input is a command
    if (userInput.startsWith('/')) {
      const result = await contextData.getCommandHandler().handleCommand(
        userInput,
        () => contextData.getConversationManager().getLastResponse(),
        () => contextData.getConversationManager().clearHistory()
      );

      if (result.exit) {
        contextData.setActive(false);
      }

      // Stay in the waiting for input state
      return StateType.WAITING_FOR_INPUT;
    }

    // Process the input and transition to gathering context
    contextData.setUserInput(userInput);
    return StateType.GATHERING_CONTEXT;
  }

  public enter(context: StateContext): void {
    // Nothing to do
  }

  public exit(context: StateContext): void {
    // Nothing to do
  }
}
