import { expect } from 'chai';
import { 
  LLMStrategySelector, 
  ComplexityLevel, 
  LLMType 
} from '../../src/task-planning/index.js';

describe('LLMStrategySelector', () => {
  let selector: LLMStrategySelector;

  beforeEach(() => {
    // Create a new selector with default configuration for each test
    selector = new LLMStrategySelector();
  });

  describe('selectLLMType', () => {
    it('should select REMOTE for high complexity scores', () => {
      const llmType = selector.selectLLMType(
        ComplexityLevel.HIGH,
        80,
        []
      );
      expect(llmType).to.equal(LLMType.REMOTE);
    });

    it('should select HYBRID for medium complexity scores', () => {
      const llmType = selector.selectLLMType(
        ComplexityLevel.MEDIUM,
        50,
        []
      );
      expect(llmType).to.equal(LLMType.HYBRID);
    });

    it('should select LOCAL for low complexity scores', () => {
      const llmType = selector.selectLLMType(
        ComplexityLevel.LOW,
        20,
        []
      );
      expect(llmType).to.equal(LLMType.LOCAL);
    });

    it('should apply overrides when tags match', () => {
      // Should select REMOTE due to 'critical' tag, despite low complexity
      const llmType = selector.selectLLMType(
        ComplexityLevel.LOW,
        20,
        ['critical']
      );
      expect(llmType).to.equal(LLMType.REMOTE);
    });

    it('should use the first matching override', () => {
      // Should select REMOTE due to 'critical' tag, even though 'simple' is also present
      const llmType = selector.selectLLMType(
        ComplexityLevel.MEDIUM,
        50,
        ['simple', 'critical']
      );
      expect(llmType).to.equal(LLMType.REMOTE);
    });
  });

  describe('selectLLMTypeByLevel', () => {
    it('should select REMOTE for HIGH complexity level', () => {
      const llmType = selector.selectLLMTypeByLevel(ComplexityLevel.HIGH);
      expect(llmType).to.equal(LLMType.REMOTE);
    });

    it('should select HYBRID for MEDIUM complexity level', () => {
      const llmType = selector.selectLLMTypeByLevel(ComplexityLevel.MEDIUM);
      expect(llmType).to.equal(LLMType.HYBRID);
    });

    it('should select LOCAL for LOW complexity level', () => {
      const llmType = selector.selectLLMTypeByLevel(ComplexityLevel.LOW);
      expect(llmType).to.equal(LLMType.LOCAL);
    });

    it('should apply overrides when tags match', () => {
      // Should select REMOTE due to 'critical' tag, despite low complexity
      const llmType = selector.selectLLMTypeByLevel(
        ComplexityLevel.LOW,
        ['critical']
      );
      expect(llmType).to.equal(LLMType.REMOTE);
    });
  });

  describe('custom configuration', () => {
    it('should use custom thresholds if provided', () => {
      const customSelector = new LLMStrategySelector({
        thresholds: {
          remote: 80, // Higher threshold for remote
          hybrid: 50, // Higher threshold for hybrid
          local: 0
        }
      });

      // This would be REMOTE with default config, but HYBRID with custom config
      const llmType = customSelector.selectLLMType(
        ComplexityLevel.HIGH,
        75,
        []
      );
      expect(llmType).to.equal(LLMType.HYBRID);
    });

    it('should use custom overrides if provided', () => {
      const customSelector = new LLMStrategySelector({
        overrides: {
          'important': LLMType.REMOTE,
          'simple': LLMType.LOCAL
        }
      });

      // Should select REMOTE due to 'important' tag
      const llmType = customSelector.selectLLMType(
        ComplexityLevel.LOW,
        20,
        ['important']
      );
      expect(llmType).to.equal(LLMType.REMOTE);
    });
  });

  describe('getExplanation', () => {
    it('should generate explanation with complexity level and score', () => {
      const explanation = selector.getExplanation(
        LLMType.REMOTE,
        ComplexityLevel.HIGH,
        80,
        []
      );
      
      expect(explanation).to.include('REMOTE');
      expect(explanation).to.include('HIGH');
      expect(explanation).to.include('80.0');
    });

    it('should include override information in explanation', () => {
      const explanation = selector.getExplanation(
        LLMType.REMOTE,
        ComplexityLevel.LOW,
        20,
        ['critical']
      );
      
      expect(explanation).to.include('REMOTE');
      expect(explanation).to.include('LOW');
      expect(explanation).to.include('critical');
    });

    it('should include threshold information in explanation', () => {
      const explanation = selector.getExplanation(
        LLMType.HYBRID,
        ComplexityLevel.MEDIUM,
        50,
        []
      );
      
      expect(explanation).to.include('HYBRID');
      expect(explanation).to.include('MEDIUM');
      expect(explanation).to.include('Thresholds');
      expect(explanation).to.include('70');
      expect(explanation).to.include('40');
    });
  });
});