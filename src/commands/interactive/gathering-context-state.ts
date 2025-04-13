import { State } from './state.js';
import { StateContext } from './state-context.js';
import { StateType } from './state-types.js';

/**
 * State for gathering context
 */
export class GatheringContextState implements State {
  public async process(context: StateContext): Promise<StateType> {
    const contextData = context.getContextData();

    // Process the user input
    const processedInput = await contextData.getConversationManager().processInput(contextData.getUserInput());

    // Get referenced files from context data
    const referencedFiles: string = contextData.getReferencedFiles()?.join(', ') ?? '';

    // If task planning is enabled, transition to generating plan
    if (contextData.getConfig().taskPlanning?.enabled && contextData.getLLM()) {
      return StateType.GENERATING_PLAN;
    }

    // Otherwise, generate a normal response and transition back to waiting for input
    const llm = contextData.getLLM();
    if (llm) {
      // Include referenced files in the LLM request
      await contextData.getConversationManager().generateResponse(processedInput, llm, referencedFiles);
    }

    return StateType.WAITING_FOR_INPUT;
  }

  public enter(context: StateContext): void {
    // Nothing to do
  }

  public exit(context: StateContext): void {
    // Nothing to do
  }
}
