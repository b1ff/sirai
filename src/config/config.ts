import { LLMType } from '../task-planning/schemas.js';
import { ConfigBuilder } from './config-builder.js';

/**
 * Interface for LLM provider configuration
 */
export interface LLMProviderConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: any;
}

/**
 * Interface for providers configuration
 */
export interface ProvidersConfig {
  [key: string]: LLMProviderConfig;
}

/**
 * Interface for LLM configuration
 */
export interface LLMConfig {
  providers: ProvidersConfig;
}

/**
 * Interface for execution configuration
 */
export interface ExecutionConfig {
  parallel: boolean;
  maxParallel: number;
}

/**
 * Interface for output configuration
 */
export interface OutputConfig {
  colorEnabled: boolean;
  syntaxHighlighting: boolean;
  markdownRendering: boolean;
}

/**
 * Interface for prompts configuration
 */
export interface PromptsConfig {
  directory: string;
}

/**
 * Interface for chat configuration
 */
export interface ChatConfig {
  maxHistoryMessages: number;
  saveHistory: boolean;
}

/**
 * Interface for validation configuration
 */
export interface ValidationConfig {
  enabled: boolean;
  commands: string[];
}

/**
 * Interface for pricing configuration
 */
export interface PricingConfig {
  modelPrices: Record<string, number>; // Maps model names to their prices per 1000 tokens
}

/**
 * Interface for token limit configuration
 */
export interface TokenLimitConfig {
  maxTokens: number; // Maximum number of tokens allowed for LLM input
}

/**
 * Interface for task planning configuration
 */
export type TaskType = 'planning' | 'execution' | 'validation' | string;

export interface TaskPlanningConfig {
  enabled: boolean;
  preferredProvider?: string; // For backward compatibility
  providerConfig?: {
    [taskType: string]: {
      provider: string;
      model?: string;
    };
  };
  prePlanning?: {
    enabled: boolean;
    provider: string;
    model?: string;
    confidenceThreshold?: number; // Threshold to determine when to use pre-planning results
  };
  complexity: {
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
  };
  llmStrategy: {
    thresholds: {
      remote: number;
      hybrid: number;
      local: number;
    };
    overrides?: {
      [key: string]: LLMType;
    };
  };
}

/**
 * Interface for the complete application configuration
 */
export interface AppConfig {
  llm: LLMConfig;
  execution: ExecutionConfig;
  output: OutputConfig;
  prompts: PromptsConfig;
  chat: ChatConfig;
  taskPlanning: TaskPlanningConfig;
  validation: ValidationConfig;
  pricing: PricingConfig;
  tokenLimits: TokenLimitConfig;
  [key: string]: any;
}

// Export functions from ConfigBuilder for backward compatibility
export function loadConfig(): AppConfig {
  return ConfigBuilder.getInstance().getConfig();
}

export function saveConfig(config: AppConfig): void {
  ConfigBuilder.getInstance().saveConfig(config);
}

export function updateConfig(key: string, value: any): AppConfig {
  return ConfigBuilder.getInstance().updateConfig(key, value);
}

export function getPromptsDir(): string {
  return ConfigBuilder.getInstance().getPromptsDir();
}

// Default configuration for token limits
export const DEFAULT_TOKEN_LIMIT_CONFIG: TokenLimitConfig = {
  maxTokens: 8000000 // 8000k tokens default maximum
};

// Default configuration with pricing for common models
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  modelPrices: {
    // OpenAI models
    'gpt-4': 0.03,
    'gpt-4-turbo': 0.01,
    'gpt-4-32k': 0.06,
    'gpt-3.5-turbo': 0.0015,
    'gpt-3.5-turbo-16k': 0.003,
    // Anthropic models
    'claude-3-7-sonnet-latest': 10 / 1000,
    'claude-3-5-sonnet-latest': 10 / 1000,
    // Google models
    'gemini-pro': 0.0025,
    'gemini-ultra': 0.01
  }
};
