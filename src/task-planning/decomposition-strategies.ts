import { v4 as uuidv4 } from 'uuid';
import { 
  ComplexityLevel, 
  LLMType, 
  Subtask, 
  TaskPlan, 
  TaskType 
} from './schemas.js';

/**
 * Interface for task decomposition strategy
 */
export interface DecompositionStrategy {
  /**
   * Decomposes a task into subtasks
   * @param request - The original user request
   * @param complexity - The complexity level of the task
   * @returns A task plan with subtasks
   */
  decompose(request: string, complexity: ComplexityLevel): TaskPlan;
}

/**
 * Strategy for high complexity tasks
 * Breaks down into many small, focused subtasks
 */
export class HighComplexityStrategy implements DecompositionStrategy {
  decompose(request: string, complexity: ComplexityLevel): TaskPlan {
    // For high complexity tasks, we create a detailed breakdown with many subtasks
    const subtasks: Subtask[] = [];
    const executionOrder: string[] = [];
    
    // 1. Analysis subtask
    const analysisId = uuidv4();
    subtasks.push({
      id: analysisId,
      taskSpecification: 'Analyze requirements and context',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.REMOTE, // Use remote LLM for analysis
      dependencies: []
    });
    executionOrder.push(analysisId);
    
    // 2. Planning subtask
    const planningId = uuidv4();
    subtasks.push({
      id: planningId,
      taskSpecification: 'Create detailed implementation plan',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.REMOTE, // Use remote LLM for planning
      dependencies: [analysisId]
    });
    executionOrder.push(planningId);
    
    // 3-7. Implementation subtasks (multiple small tasks)
    const implementationIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const implId = uuidv4();
      subtasks.push({
        id: implId,
        taskSpecification: `Implementation part ${i}`,
        complexity: ComplexityLevel.MEDIUM,
        llmType: LLMType.HYBRID, // Use hybrid approach for implementation
        dependencies: [planningId]
      });
      implementationIds.push(implId);
      executionOrder.push(implId);
    }
    
    // 8. Integration subtask
    const integrationId = uuidv4();
    subtasks.push({
      id: integrationId,
      taskSpecification: 'Integrate all implementation parts',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.REMOTE, // Use remote LLM for integration
      dependencies: implementationIds
    });
    executionOrder.push(integrationId);
    
    // 9. Testing subtask
    const testingId = uuidv4();
    subtasks.push({
      id: testingId,
      taskSpecification: 'Test the implementation',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.HYBRID, // Use hybrid approach for testing
      dependencies: [integrationId]
    });
    executionOrder.push(testingId);
    
    // 10. Documentation subtask
    const documentationId = uuidv4();
    subtasks.push({
      id: documentationId,
      taskSpecification: 'Create documentation',
      complexity: ComplexityLevel.LOW,
      llmType: LLMType.LOCAL, // Use local LLM for documentation
      dependencies: [integrationId]
    });
    executionOrder.push(documentationId);
    
    // 11. Final review subtask
    const reviewId = uuidv4();
    subtasks.push({
      id: reviewId,
      taskSpecification: 'Final review and quality check',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.REMOTE, // Use remote LLM for final review
      dependencies: [testingId, documentationId]
    });
    executionOrder.push(reviewId);
    
    return {
      originalRequest: request,
      overallComplexity: complexity,
      subtasks,
      executionOrder
    };
  }
}

/**
 * Strategy for medium complexity tasks
 * Standard breakdown into logical components
 */
export class MediumComplexityStrategy implements DecompositionStrategy {
  decompose(request: string, complexity: ComplexityLevel): TaskPlan {
    // For medium complexity tasks, we create a standard breakdown
    const subtasks: Subtask[] = [];
    const executionOrder: string[] = [];
    
    // 1. Analysis subtask
    const analysisId = uuidv4();
    subtasks.push({
      id: analysisId,
      taskSpecification: 'Analyze requirements and context',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.HYBRID, // Use hybrid approach for analysis
      dependencies: []
    });
    executionOrder.push(analysisId);
    
    // 2. Implementation subtask
    const implementationId = uuidv4();
    subtasks.push({
      id: implementationId,
      taskSpecification: 'Implement the solution',
      complexity: ComplexityLevel.MEDIUM,
      llmType: LLMType.HYBRID, // Use hybrid approach for implementation
      dependencies: [analysisId]
    });
    executionOrder.push(implementationId);
    
    // 3. Testing subtask
    const testingId = uuidv4();
    subtasks.push({
      id: testingId,
      taskSpecification: 'Test the implementation',
      complexity: ComplexityLevel.LOW,
      llmType: LLMType.LOCAL, // Use local LLM for testing
      dependencies: [implementationId]
    });
    executionOrder.push(testingId);
    
    // 4. Documentation subtask
    const documentationId = uuidv4();
    subtasks.push({
      id: documentationId,
      taskSpecification: 'Create documentation',
      complexity: ComplexityLevel.LOW,
      llmType: LLMType.LOCAL, // Use local LLM for documentation
      dependencies: [implementationId]
    });
    executionOrder.push(documentationId);
    
    return {
      originalRequest: request,
      overallComplexity: complexity,
      subtasks,
      executionOrder
    };
  }
}

/**
 * Strategy for low complexity tasks
 * Minimal or no decomposition
 */
export class LowComplexityStrategy implements DecompositionStrategy {
  decompose(request: string, complexity: ComplexityLevel): TaskPlan {
    // For low complexity tasks, we create a minimal breakdown
    const subtasks: Subtask[] = [];
    const executionOrder: string[] = [];
    
    // Single implementation subtask
    const implementationId = uuidv4();
    subtasks.push({
      id: implementationId,
      taskSpecification: 'Implement the complete solution',
      complexity: ComplexityLevel.LOW,
      llmType: LLMType.LOCAL, // Use local LLM for simple tasks
      dependencies: []
    });
    executionOrder.push(implementationId);
    
    return {
      originalRequest: request,
      overallComplexity: complexity,
      subtasks,
      executionOrder
    };
  }
}

/**
 * Factory for creating decomposition strategies
 */
export class DecompositionStrategyFactory {
  /**
   * Gets the appropriate decomposition strategy for a complexity level
   * @param complexity - The complexity level
   * @returns The decomposition strategy
   */
  static getStrategy(complexity: ComplexityLevel): DecompositionStrategy {
    switch (complexity) {
      case ComplexityLevel.HIGH:
        return new HighComplexityStrategy();
      case ComplexityLevel.MEDIUM:
        return new MediumComplexityStrategy();
      case ComplexityLevel.LOW:
        return new LowComplexityStrategy();
      default:
        return new MediumComplexityStrategy(); // Default to medium complexity
    }
  }
}
