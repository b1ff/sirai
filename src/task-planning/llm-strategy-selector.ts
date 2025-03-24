import { ComplexityLevel, LLMType } from './schemas.js';

/**
 * Configuration for LLM strategy selection
 */
export interface LLMStrategyConfig {
  thresholds: {
    // Complexity thresholds for different LLM types
    remote: number;
    hybrid: number;
    local: number;
  };
  // Override settings for specific task types or conditions
  overrides?: {
    [key: string]: LLMType;
  };
}

/**
 * Default configuration for LLM strategy selection
 */
const DEFAULT_CONFIG: LLMStrategyConfig = {
  thresholds: {
    remote: 70, // Use remote LLM for complexity scores >= 70
    hybrid: 40, // Use hybrid approach for complexity scores >= 40 and < 70
    local: 0    // Use local LLM for complexity scores < 40
  },
  overrides: {
    // Example overrides
    'critical': LLMType.REMOTE,
    'simple': LLMType.LOCAL
  }
};

/**
 * Class for selecting LLM strategy based on task complexity
 */
export class LLMStrategySelector {
  private config: LLMStrategyConfig;

  /**
   * Constructor
   * @param config - Configuration for LLM strategy selection
   */
  constructor(config: Partial<LLMStrategyConfig> = {}) {
    this.config = {
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config.thresholds
      },
      overrides: {
        ...DEFAULT_CONFIG.overrides,
        ...config.overrides
      }
    };
  }

  /**
   * Selects the appropriate LLM type based on complexity
   * @param complexityLevel - The complexity level
   * @param complexityScore - The complexity score (0-100)
   * @param tags - Optional tags for override conditions
   * @returns The selected LLM type
   */
  selectLLMType(
    complexityLevel: ComplexityLevel,
    complexityScore: number,
    tags: string[] = []
  ): LLMType {
    // Check for overrides first
    for (const tag of tags) {
      if (this.config.overrides && this.config.overrides[tag]) {
        return this.config.overrides[tag];
      }
    }

    // Select based on complexity score and thresholds
    if (complexityScore >= this.config.thresholds.remote) {
      return LLMType.REMOTE;
    } else if (complexityScore >= this.config.thresholds.hybrid) {
      return LLMType.HYBRID;
    } else {
      return LLMType.LOCAL;
    }
  }

  /**
   * Selects the appropriate LLM type based on complexity level only
   * @param complexityLevel - The complexity level
   * @param tags - Optional tags for override conditions
   * @returns The selected LLM type
   */
  selectLLMTypeByLevel(
    complexityLevel: ComplexityLevel,
    tags: string[] = []
  ): LLMType {
    // Check for overrides first
    for (const tag of tags) {
      if (this.config.overrides && this.config.overrides[tag]) {
        return this.config.overrides[tag];
      }
    }

    // Select based on complexity level
    switch (complexityLevel) {
      case ComplexityLevel.HIGH:
        return LLMType.REMOTE;
      case ComplexityLevel.MEDIUM:
        return LLMType.HYBRID;
      case ComplexityLevel.LOW:
        return LLMType.LOCAL;
      default:
        return LLMType.HYBRID; // Default to hybrid
    }
  }

  /**
   * Gets the explanation for the LLM type selection
   * @param llmType - The selected LLM type
   * @param complexityLevel - The complexity level
   * @param complexityScore - The complexity score
   * @param tags - Tags that influenced the selection
   * @returns An explanation string
   */
  getExplanation(
    llmType: LLMType,
    complexityLevel: ComplexityLevel,
    complexityScore: number,
    tags: string[] = []
  ): string {
    let explanation = `Selected ${llmType.toUpperCase()} LLM strategy for ${complexityLevel.toUpperCase()} complexity task (score: ${complexityScore.toFixed(1)})`;
    
    // Add information about overrides if applicable
    const appliedOverrides = tags.filter(tag => 
      this.config.overrides && this.config.overrides[tag]
    );
    
    if (appliedOverrides.length > 0) {
      explanation += `\nSelection influenced by tags: ${appliedOverrides.join(', ')}`;
    }
    
    // Add threshold information
    explanation += `\nThresholds: REMOTE >= ${this.config.thresholds.remote}, HYBRID >= ${this.config.thresholds.hybrid}, LOCAL >= ${this.config.thresholds.local}`;
    
    return explanation;
  }
}