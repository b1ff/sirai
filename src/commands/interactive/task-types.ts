/**
 * Enum representing the different task types
 */
export enum TaskType {
  INFO_GATHERING = 'INFO_GATHERING',
  ACTION = 'ACTION',
  VERIFICATION = 'VERIFICATION',
  FIXING = 'FIXING'
}

/**
 * Enum representing the different task statuses
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}
