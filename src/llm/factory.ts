import { BaseLLM, LLMConfig } from './base.js';
import { LangChainAdapter } from './langchain-adapter.js';

/**
 * Interface for application configuration
 */
export interface AppConfig {
  llm?: {
    local?: LLMProviderConfig;
    remote?: LLMProviderConfig;
  };
  [key: string]: any;
}

/**
 * Interface for LLM provider configuration
 */
export interface LLMProviderConfig extends LLMConfig {
  enabled?: boolean;
  provider?: string;
  [key: string]: any;
}

/**
 * Interface for LLM selection options
 */
export interface LLMSelectionOptions {
  preferLocal?: boolean;
  localOnly?: boolean;
  remoteOnly?: boolean;
}

/**
 * Factory for creating LLM instances
 */
export class LLMFactory {
  /**
   * Creates an LLM instance based on the configuration
   * @param config - The LLM configuration
   * @param type - The type of LLM to create ('local' or 'remote')
   * @returns The LLM instance
   */
  static createLLM(config: AppConfig, type: 'local' | 'remote' = 'local'): BaseLLM {
    const llmConfig = config.llm?.[type] || {};

    if (!llmConfig.enabled) {
      throw new Error(`${type} LLM is disabled in configuration`);
    }

    const provider = llmConfig.provider?.toLowerCase();

    return new LangChainAdapter({
      ...llmConfig,
      provider: provider || 'ollama'
    });
  }

  /**
   * Creates a local LLM instance
   * @param config - The configuration
   * @returns The local LLM instance
   */
  static createLocalLLM(config: AppConfig): BaseLLM {
    return this.createLLM(config, 'local');
  }

  /**
   * Creates a remote LLM instance
   * @param config - The configuration
   * @returns The remote LLM instance
   */
  static createRemoteLLM(config: AppConfig): BaseLLM {
    return this.createLLM(config, 'remote');
  }

  /**
   * Gets the best available LLM
   * @param config - The configuration
   * @param options - Options for LLM selection
   * @returns The best available LLM
   */
  static async getBestLLM(config: AppConfig, options: LLMSelectionOptions = {}): Promise<BaseLLM> {
    const { preferLocal = true, localOnly = false, remoteOnly = false } = options;

    // Handle exclusive options
    if (localOnly && remoteOnly) {
      throw new Error('Cannot specify both localOnly and remoteOnly');
    }

    // If local only, return local LLM
    if (localOnly) {
      return this.createLocalLLM(config);
    }

    // If remote only, return remote LLM
    if (remoteOnly) {
      return this.createRemoteLLM(config);
    }

    // Try to get the preferred LLM first
    try {
      if (preferLocal) {
        const localLLM = this.createLocalLLM(config);
        if (await localLLM.isAvailable()) {
          return localLLM;
        }

        // If local LLM is not available, try remote
        const remoteLLM = this.createRemoteLLM(config);
        if (await remoteLLM.isAvailable()) {
          return remoteLLM;
        }
      } else {
        const remoteLLM = this.createRemoteLLM(config);
        if (await remoteLLM.isAvailable()) {
          return remoteLLM;
        }

        // If remote LLM is not available, try local
        const localLLM = this.createLocalLLM(config);
        if (await localLLM.isAvailable()) {
          return localLLM;
        }
      }

      throw new Error('No LLM is available');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get LLM: ${error.message}`);
      }
      throw new Error('Failed to get LLM: Unknown error');
    }
  }
}
