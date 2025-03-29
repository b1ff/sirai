import { expect } from 'chai';
import { 
  DecompositionStrategyFactory, 
  HighComplexityStrategy,
  MediumComplexityStrategy,
  LowComplexityStrategy,
  ComplexityLevel, 
  TaskType 
} from '../../src/task-planning/index.js';

describe('DecompositionStrategies', () => {
  const testRequest = "Implement a user authentication system";
  const testTaskType = TaskType.GENERATION;

  describe('DecompositionStrategyFactory', () => {
    it('should return HighComplexityStrategy for HIGH complexity', () => {
      const strategy = DecompositionStrategyFactory.getStrategy(ComplexityLevel.HIGH);
      expect(strategy).to.be.instanceOf(HighComplexityStrategy);
    });

    it('should return MediumComplexityStrategy for MEDIUM complexity', () => {
      const strategy = DecompositionStrategyFactory.getStrategy(ComplexityLevel.MEDIUM);
      expect(strategy).to.be.instanceOf(MediumComplexityStrategy);
    });

    it('should return LowComplexityStrategy for LOW complexity', () => {
      const strategy = DecompositionStrategyFactory.getStrategy(ComplexityLevel.LOW);
      expect(strategy).to.be.instanceOf(LowComplexityStrategy);
    });

    it('should default to MediumComplexityStrategy for unknown complexity', () => {
      const strategy = DecompositionStrategyFactory.getStrategy('UNKNOWN' as ComplexityLevel);
      expect(strategy).to.be.instanceOf(MediumComplexityStrategy);
    });
  });

  describe('HighComplexityStrategy', () => {
    it('should decompose task into many subtasks', () => {
      const strategy = new HighComplexityStrategy();
      const taskPlan = strategy.decompose(testRequest, ComplexityLevel.HIGH);

      expect(taskPlan.originalRequest).to.equal(testRequest);
      expect(taskPlan.overallComplexity).to.equal(ComplexityLevel.HIGH);
      expect(taskPlan.subtasks.length).to.be.greaterThan(5); // Should have many subtasks
      expect(taskPlan.executionOrder.length).to.equal(taskPlan.subtasks.length);

      // Verify that all subtask IDs are in the execution order
      taskPlan.subtasks.forEach(subtask => {
        expect(taskPlan.executionOrder).to.include(subtask.id);
      });

      // Verify that dependencies are valid
      taskPlan.subtasks.forEach(subtask => {
        subtask.dependencies.forEach(depId => {
          const dependencyExists = taskPlan.subtasks.some(s => s.id === depId);
          expect(dependencyExists).to.be.true;
        });
      });
    });
  });

  describe('MediumComplexityStrategy', () => {
    it('should decompose task into a standard number of subtasks', () => {
      const strategy = new MediumComplexityStrategy();
      const taskPlan = strategy.decompose(testRequest, ComplexityLevel.MEDIUM);

      expect(taskPlan.originalRequest).to.equal(testRequest);
      expect(taskPlan.overallComplexity).to.equal(ComplexityLevel.MEDIUM);
      expect(taskPlan.subtasks.length).to.be.greaterThan(1);
      expect(taskPlan.subtasks.length).to.be.lessThan(6); // Should have a moderate number of subtasks
      expect(taskPlan.executionOrder.length).to.equal(taskPlan.subtasks.length);

      // Verify that all subtask IDs are in the execution order
      taskPlan.subtasks.forEach(subtask => {
        expect(taskPlan.executionOrder).to.include(subtask.id);
      });

      // Verify that dependencies are valid
      taskPlan.subtasks.forEach(subtask => {
        subtask.dependencies.forEach(depId => {
          const dependencyExists = taskPlan.subtasks.some(s => s.id === depId);
          expect(dependencyExists).to.be.true;
        });
      });
    });
  });

  describe('LowComplexityStrategy', () => {
    it('should decompose task into minimal subtasks', () => {
      const strategy = new LowComplexityStrategy();
      const taskPlan = strategy.decompose(testRequest, ComplexityLevel.LOW);

      expect(taskPlan.originalRequest).to.equal(testRequest);
      expect(taskPlan.overallComplexity).to.equal(ComplexityLevel.LOW);
      expect(taskPlan.subtasks.length).to.equal(1); // Should have only one subtask
      expect(taskPlan.executionOrder.length).to.equal(1);
      expect(taskPlan.executionOrder[0]).to.equal(taskPlan.subtasks[0].id);
      expect(taskPlan.subtasks[0].dependencies.length).to.equal(0); // No dependencies
    });
  });
});
