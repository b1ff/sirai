/**
 * Enum representing the different states in the state machine
 */
export enum StateType {
  WAITING_FOR_INPUT = 'WAITING_FOR_INPUT',
  GATHERING_CONTEXT = 'GATHERING_CONTEXT',
  GENERATING_PLAN = 'GENERATING_PLAN',
  REVIEWING_PLAN = 'REVIEWING_PLAN',
  EXECUTING_TASKS = 'EXECUTING_TASKS',
  GENERATING_SUMMARY = 'GENERATING_SUMMARY'
}
