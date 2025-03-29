/**
 * JSON schemas for task planning component
 */

/**
 * Task types supported by the system
 */
export enum TaskType {
  GENERATION = 'generation',
  REFACTORING = 'refactoring',
  EXPLANATION = 'explanation'
}

/**
 * Complexity levels for tasks
 */
export enum ComplexityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/**
 * LLM types for task execution
 */
export enum LLMType {
  LOCAL = 'local',
  REMOTE = 'remote',
  HYBRID = 'hybrid'
}

/**
 * Interface for task complexity assessment parameters
 */
export interface ComplexityAssessmentParams {
  taskType: TaskType;
  scopeSize: number;
  dependenciesCount: number;
  technologyComplexity: number;
  priorSuccessRate?: number;
}

/**
 * Interface for complexity assessment result
 */
export interface ComplexityAssessmentResult {
  level: ComplexityLevel;
  score: number;
  factors: {
    taskType: number;
    scopeSize: number;
    dependenciesCount: number;
    technologyComplexity: number;
    priorSuccessRate?: number;
  };
  explanation: string;
}

/**
 * Interface for a file to read in a subtask
 */
export interface FileToRead {
  path: string;
  syntax: string;
}

/**
 * Interface for a subtask in the task plan
 */
export interface Subtask {
  id: string;
  taskSpecification: string;
  complexity: ComplexityLevel;
  llmType: LLMType;
  dependencies: string[];
  filesToRead?: FileToRead[];
}

/**
 * Interface for the complete task plan
 */
export interface TaskPlan {
  originalRequest: string;
  overallComplexity: ComplexityLevel;
  subtasks: Subtask[];
  executionOrder: string[];
}

/**
 * Interface for context profile used in task planning
 */
export interface ContextProfile {
  projectRoot: string;
  currentDirectory: string;
  files: {
    path: string;
    language: string;
    size: number;
  }[];
  dependencies: {
    name: string;
    version: string;
  }[];
  technologyStack: string[];
}
