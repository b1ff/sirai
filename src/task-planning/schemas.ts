import { TaskStatus } from '../commands/interactive/task-types.js';

/**
 * Task types supported by the system
 */
export enum TaskType {
  GENERATION = 'generation',
  REFACTORING = 'refactoring',
  EXPLANATION = 'explanation',
  VALIDATION = 'validation'
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

export interface FileToRead {
  path: string;
  syntax?: string;
}

export interface ImplementationDetails {
  taskid: string;
  content: string;
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
  status?: TaskStatus; // Default is TaskStatus.PENDING
  implementationDetails?: ImplementationDetails;
}

/**
 * Validation result status
 */
export enum ValidationStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  PENDING = 'pending'
}

/**
 * Interface for validation result
 */
export interface ValidationResult {
  status: ValidationStatus;
  message: string;
  failedTasks?: string[];
  suggestedFixes?: string;
  [key: string]: unknown;
}

/**
 * Interface for the complete task plan
 */
export interface TaskPlan {
  originalRequest: string;
  overallComplexity: ComplexityLevel;
  subtasks: Subtask[];
  executionOrder: string[];
  /**
   * Optional validation instructions for the task plan
   */
  validationInstructions?: string;
  /**
   * Validation result after task execution
   */
  validationResult?: ValidationResult;
  /**
   * Implementation details for the entire task plan
   */
  implementationDetails?: ImplementationDetails;
  /**
   * Timestamp when the task was completed
   */
  completedAt?: number;
}

/**
 * Interface for directory structure representation
 */
export interface DirectoryStructure {
  path: string;
  name: string;
  type: 'directory';
  children?: DirectoryStructure[];
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
  directoryStructure?: DirectoryStructure;
  guidelines?: string;
  referencedFiles?: string[];
  createContextString(): string;
}
