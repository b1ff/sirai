import { expect } from 'chai';
import { 
  ComplexityAssessor, 
  ComplexityLevel, 
  TaskType 
} from '../../src/task-planning/index.js';

describe('ComplexityAssessor', () => {
  let assessor: ComplexityAssessor;

  beforeEach(() => {
    // Create a new assessor with default configuration for each test
    assessor = new ComplexityAssessor();
  });

  it('should assess generation tasks as high complexity', () => {
    const result = assessor.assess({
      taskType: TaskType.GENERATION,
      scopeSize: 8,
      dependenciesCount: 6,
      technologyComplexity: 7
    });

    expect(result.level).to.equal(ComplexityLevel.HIGH);
    expect(result.score).to.be.greaterThan(70);
    expect(result.explanation).to.include('HIGH');
  });

  it('should assess refactoring tasks as medium complexity', () => {
    const result = assessor.assess({
      taskType: TaskType.REFACTORING,
      scopeSize: 5,
      dependenciesCount: 3,
      technologyComplexity: 4
    });

    expect(result.level).to.equal(ComplexityLevel.MEDIUM);
    expect(result.score).to.be.greaterThan(40);
    expect(result.score).to.be.lessThan(70);
    expect(result.explanation).to.include('MEDIUM');
  });

  it('should assess explanation tasks as low complexity', () => {
    const result = assessor.assess({
      taskType: TaskType.EXPLANATION,
      scopeSize: 2,
      dependenciesCount: 1,
      technologyComplexity: 2
    });

    expect(result.level).to.equal(ComplexityLevel.LOW);
    expect(result.score).to.be.lessThan(40);
    expect(result.explanation).to.include('LOW');
  });

  it('should consider prior success rate in assessment', () => {
    // High success rate should lower complexity
    const highSuccessResult = assessor.assess({
      taskType: TaskType.GENERATION,
      scopeSize: 5,
      dependenciesCount: 3,
      technologyComplexity: 4,
      priorSuccessRate: 0.9 // 90% success rate
    });

    // Low success rate should increase complexity
    const lowSuccessResult = assessor.assess({
      taskType: TaskType.GENERATION,
      scopeSize: 5,
      dependenciesCount: 3,
      technologyComplexity: 4,
      priorSuccessRate: 0.2 // 20% success rate
    });

    expect(highSuccessResult.score).to.be.lessThan(lowSuccessResult.score);
    expect(highSuccessResult.explanation).to.include('prior success rate');
    expect(lowSuccessResult.explanation).to.include('prior success rate');
  });

  it('should use custom configuration if provided', () => {
    // Create assessor with custom configuration
    const customAssessor = new ComplexityAssessor({
      thresholds: {
        medium: 30, // Lower threshold for medium
        high: 60    // Lower threshold for high
      },
      weights: {
        taskType: 0.3,         // Higher weight for task type
        scopeSize: 0.2,        // Lower weight for scope size
        dependenciesCount: 0.2,
        technologyComplexity: 0.2,
        priorSuccessRate: 0.1
      }
    });

    // This would be MEDIUM with default config, but HIGH with custom config
    const result = customAssessor.assess({
      taskType: TaskType.GENERATION,
      scopeSize: 4,
      dependenciesCount: 3,
      technologyComplexity: 3
    });

    expect(result.level).to.equal(ComplexityLevel.HIGH);
    expect(result.score).to.be.greaterThan(60);
  });
});