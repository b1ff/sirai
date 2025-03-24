import { 
  ComplexityAssessmentParams, 
  ComplexityAssessmentResult, 
  ComplexityLevel, 
  TaskType 
} from './schemas.js';

/**
 * Configuration for complexity assessment
 */
export interface ComplexityAssessorConfig {
  thresholds: {
    medium: number;
    high: number;
  };
  weights: {
    taskType: number;
    scopeSize: number;
    dependenciesCount: number;
    technologyComplexity: number;
    priorSuccessRate: number;
  };
}

/**
 * Default configuration for complexity assessment
 */
const DEFAULT_CONFIG: ComplexityAssessorConfig = {
  thresholds: {
    medium: 40,
    high: 70
  },
  weights: {
    taskType: 0.2,
    scopeSize: 0.3,
    dependenciesCount: 0.2,
    technologyComplexity: 0.2,
    priorSuccessRate: 0.1
  }
};

/**
 * Class for assessing task complexity
 */
export class ComplexityAssessor {
  private config: ComplexityAssessorConfig;

  /**
   * Constructor
   * @param config - Configuration for complexity assessment
   */
  constructor(config: Partial<ComplexityAssessorConfig> = {}) {
    this.config = {
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config.thresholds
      },
      weights: {
        ...DEFAULT_CONFIG.weights,
        ...config.weights
      }
    };
  }

  /**
   * Assesses the complexity of a task
   * @param params - Parameters for complexity assessment
   * @returns The complexity assessment result
   */
  assess(params: ComplexityAssessmentParams): ComplexityAssessmentResult {
    // Calculate individual factor scores (0-100 scale)
    const taskTypeScore = this.calculateTaskTypeScore(params.taskType);
    const scopeSizeScore = Math.min(100, params.scopeSize * 10);
    const dependenciesScore = Math.min(100, params.dependenciesCount * 5);
    const technologyScore = Math.min(100, params.technologyComplexity * 10);
    const successRateScore = params.priorSuccessRate !== undefined 
      ? 100 - Math.min(100, params.priorSuccessRate * 100)
      : 50; // Default to medium if not provided

    // Calculate weighted score
    const weightedScore = 
      taskTypeScore * this.config.weights.taskType +
      scopeSizeScore * this.config.weights.scopeSize +
      dependenciesScore * this.config.weights.dependenciesCount +
      technologyScore * this.config.weights.technologyComplexity +
      successRateScore * this.config.weights.priorSuccessRate;

    // Determine complexity level
    let level: ComplexityLevel;
    if (weightedScore >= this.config.thresholds.high) {
      level = ComplexityLevel.HIGH;
    } else if (weightedScore >= this.config.thresholds.medium) {
      level = ComplexityLevel.MEDIUM;
    } else {
      level = ComplexityLevel.LOW;
    }

    // Create explanation
    const explanation = this.createExplanation(
      level,
      weightedScore,
      {
        taskType: taskTypeScore,
        scopeSize: scopeSizeScore,
        dependenciesCount: dependenciesScore,
        technologyComplexity: technologyScore,
        priorSuccessRate: successRateScore
      }
    );

    return {
      level,
      score: weightedScore,
      factors: {
        taskType: taskTypeScore,
        scopeSize: scopeSizeScore,
        dependenciesCount: dependenciesScore,
        technologyComplexity: technologyScore,
        priorSuccessRate: successRateScore
      },
      explanation
    };
  }

  /**
   * Calculates the score for a task type
   * @param taskType - The task type
   * @returns The score for the task type
   */
  private calculateTaskTypeScore(taskType: TaskType): number {
    switch (taskType) {
      case TaskType.GENERATION:
        return 80; // Generation is typically more complex
      case TaskType.REFACTORING:
        return 60; // Refactoring is moderately complex
      case TaskType.EXPLANATION:
        return 30; // Explanation is typically less complex
      default:
        return 50; // Default to medium complexity
    }
  }

  /**
   * Creates an explanation for the complexity assessment
   * @param level - The complexity level
   * @param score - The overall score
   * @param factors - The individual factor scores
   * @returns An explanation string
   */
  private createExplanation(
    level: ComplexityLevel,
    score: number,
    factors: {
      taskType: number;
      scopeSize: number;
      dependenciesCount: number;
      technologyComplexity: number;
      priorSuccessRate?: number;
    }
  ): string {
    const factorExplanations = [
      `Task type contribution: ${factors.taskType.toFixed(1)} (weighted: ${(factors.taskType * this.config.weights.taskType).toFixed(1)})`,
      `Code scope contribution: ${factors.scopeSize.toFixed(1)} (weighted: ${(factors.scopeSize * this.config.weights.scopeSize).toFixed(1)})`,
      `Dependencies contribution: ${factors.dependenciesCount.toFixed(1)} (weighted: ${(factors.dependenciesCount * this.config.weights.dependenciesCount).toFixed(1)})`,
      `Technology complexity contribution: ${factors.technologyComplexity.toFixed(1)} (weighted: ${(factors.technologyComplexity * this.config.weights.technologyComplexity).toFixed(1)})`
    ];

    if (factors.priorSuccessRate !== undefined) {
      factorExplanations.push(
        `Prior success rate contribution: ${factors.priorSuccessRate.toFixed(1)} (weighted: ${(factors.priorSuccessRate * this.config.weights.priorSuccessRate).toFixed(1)})`
      );
    }

    return `Task assessed as ${level.toUpperCase()} complexity with overall score ${score.toFixed(1)}.\n` +
      `Factors considered:\n- ${factorExplanations.join('\n- ')}`;
  }
}