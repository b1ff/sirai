import { setTimeout } from 'timers/promises';
import { State } from './state.js';
import { StateType } from './state-types.js';
import { ContextData } from './context-data.js';
import { CommandOptions } from './types.js';
import { AppConfig } from '../../config/config.js';
import { WaitingForInputState } from './waiting-for-input-state.js';
import { GatheringContextState } from './gathering-context-state.js';
import { GeneratingPlanState } from './generating-plan-state.js';
import { ReviewingPlanState } from './reviewing-plan-state.js';
import { ExecutingTasksState } from './executing-tasks-state.js';
import { ValidatingTasksState } from './validating-tasks-state.js';
import { FixingValidationErrorsState } from './fixing-validation-errors-state.js';
import { GeneratingSummaryState } from './generating-summary-state.js';

/**
 * Class representing the state context for the state machine
 */
export class StateContext {
    private currentState: State | null;
    private contextData: ContextData;

    constructor(options: CommandOptions, config: AppConfig) {
        this.currentState = null;
        this.contextData = new ContextData(options, config);
    }

    public async transition(stateType: StateType): Promise<void> {
        // Exit current state if it exists
        if (this.currentState) {
            this.currentState.exit(this);
        }

        // Create new state
        this.currentState = this.createState(stateType);

        // Enter new state
        this.currentState.enter(this);

        // Process new state
        const nextStateType = await this.currentState.process(this);

        // Transition to next state if needed
        if (nextStateType === stateType) {
            // If the state is the same, wait for a while before processing again, most likely it is error and retry
            await setTimeout(1000);
        }

        await this.transition(nextStateType);
    }

    public getContextData(): ContextData {
        return this.contextData;
    }

    private createState(stateType: StateType): State {
        switch (stateType) {
            case StateType.WAITING_FOR_INPUT:
                return new WaitingForInputState();
            case StateType.GATHERING_CONTEXT:
                return new GatheringContextState();
            case StateType.GENERATING_PLAN:
                return new GeneratingPlanState();
            case StateType.REVIEWING_PLAN:
                return new ReviewingPlanState();
            case StateType.EXECUTING_TASKS:
                return new ExecutingTasksState();
            case StateType.GENERATING_SUMMARY:
                return new GeneratingSummaryState();
            case StateType.VALIDATING_TASKS:
                return new ValidatingTasksState();
            case StateType.FIXING_VALIDATION_ERRORS:
                return new FixingValidationErrorsState();
            default:
                throw new Error(`Unknown state type: ${stateType}`);
        }
    }
}
