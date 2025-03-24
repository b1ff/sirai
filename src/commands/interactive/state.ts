import { StateType } from './state-types.js';
import { StateContext } from './state-context.js';

/**
 * Interface for the State
 */
export interface State {
  process(context: StateContext): Promise<StateType>;
  enter(context: StateContext): void;
  exit(context: StateContext): void;
}
