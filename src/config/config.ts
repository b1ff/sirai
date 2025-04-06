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
 * Interface for task planning configuration
 */
export interface TaskPlanningConfig {
  enabled: boolean;
  preferredProvider?: string; // For backward compatibility
  providerConfig?: {
    [taskType: string]: {
      provider: string;
      model?: string;
    };
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
