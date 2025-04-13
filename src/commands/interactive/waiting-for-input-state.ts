import inquirer from 'inquirer';
import inquirerAutocomplete from 'inquirer-autocomplete-prompt';
import chalk from 'chalk';
import path from 'path';
import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';
import { FileSystemHelper } from '../../llm/tools/file-system-helper.js';
import { FileReferenceProcessor } from '../../utils/file-reference-processor.js';

// Register the autocomplete prompt
inquirer.registerPrompt('autocomplete', inquirerAutocomplete);

/**
 * State for waiting for user input
 */
export class WaitingForInputState implements State {
  private fileReferenceProcessor: FileReferenceProcessor;

  constructor() {
    this.fileReferenceProcessor = new FileReferenceProcessor(process.cwd());
  }
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

    // Create FileSystemHelper for file path autocompletion
    const fileSystemHelper = new FileSystemHelper(process.cwd());
    await fileSystemHelper.loadGitignore();
    
    // Function to search for files when '@' is typed
    const searchFiles = async (input: string, atIndex: number) => {
      // Extract the partial file path after '@'
      const partialPath = input.substring(atIndex + 1);
      const searchDir = partialPath.includes('/') 
        ? path.join(process.cwd(), path.dirname(partialPath)) 
        : process.cwd();
      
      // Get files and directories
      const files = await fileSystemHelper.listFilesRecursively(searchDir, { maxDepth: 3 });
      const dirs = await fileSystemHelper.listDirectoriesRecursively(searchDir, { maxDepth: 3 });
      const allPaths = [...files, ...dirs];
      
      // Filter based on the partial path
      const searchTerm = path.basename(partialPath).toLowerCase();
      return allPaths
        .filter(file => path.basename(file).toLowerCase().includes(searchTerm))
        .sort();
    };

    // Otherwise, prompt the user for input with autocomplete support
    const { userInput } = await inquirer.prompt<{ userInput: string }>([
      {
        type: 'autocomplete',
        name: 'userInput',
        message: chalk.green('You:'),
        prefix: '',
        source: async (answersSoFar: any, input: string = '') => {
          // Check if input contains '@' for file path autocompletion
          const atIndex = input.lastIndexOf('@');
          if (atIndex !== -1) {
            const files = await searchFiles(input, atIndex);
            return files.map(file => {
              // Create a new input string with the file path inserted
              const beforeAt = input.substring(0, atIndex + 1);
              const suggestion = beforeAt + file;
              return {
                name: file,
                value: suggestion
              };
            });
          }
          return [];
        },
        suggestOnly: true
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

    // Extract file references from user input
    const fileReferences = this.fileReferenceProcessor.extractFileReferences(userInput);
    
    // Add extracted file references to the context data
    for (const filePath of fileReferences) {
      contextData.addReferencedFile(filePath);
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
