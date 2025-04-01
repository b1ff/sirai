import { BaseLLM, LLMConfig } from './base.js';
import { VercelAIAdapter } from './vercel-ai-adapter.js';

/**
 * Interface for application configuration
 */
export interface AppConfig {
  llm?: {
    local?: LLMProviderConfig;
    remote?: LLMProviderConfig;
    providers?: {
      [key: string]: LLMProviderConfig;
    };
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
  preferredProvider?: string;
  providerName?: string;
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
    // First try to get the config from the old structure
    let llmConfig = config.llm?.[type] || {};
    let provider = llmConfig.provider?.toLowerCase() || 'ollama';

    // Check if the old structure is disabled or not present
    if (!llmConfig.enabled) {
      // Try to find the provider in the new structure
      if (config.llm?.providers && config.llm.providers[provider]) {
        llmConfig = { ...config.llm.providers[provider] };

        // Check if the provider is enabled
        if (!llmConfig.enabled) {
          throw new Error(`Provider ${provider} is disabled in configuration`);
        }
      } else {
        throw new Error(`${type} LLM is disabled in configuration and no alternative provider found`);
      }
    }

    // Ensure provider is set
    return new VercelAIAdapter({
      ...llmConfig,
      provider
    });
  }

  /**
   * Creates an LLM instance based on a provider name
   * @param config - The application configuration
   * @param providerName - The name of the provider to use
   * @param model - Optional model to use (overrides the one in the provider config)
   * @returns The LLM instance
   */
  static createLLMByProvider(config: AppConfig, providerName: string, model?: string): BaseLLM {
    // First check if the provider exists in the providers section
    if (config.llm?.providers && config.llm.providers[providerName]) {
      const providerConfig = { ...config.llm.providers[providerName] };

      // Override the model if provided
      if (model) {
        providerConfig.model = model;
      }

      if (!providerConfig.enabled) {
        throw new Error(`Provider ${providerName} is disabled in configuration`);
      }

      // Ensure provider is set
      providerConfig.provider = providerName;

      return new VercelAIAdapter(providerConfig as LLMConfig & { provider: string });
    }

    // If not found in providers, check if it matches the local or remote provider
    if (config.llm?.local?.provider === providerName) {
      const localConfig = { ...config.llm.local };
      if (model) {
        localConfig.model = model;
      }
      // Ensure provider is set
      localConfig.provider = providerName;
      return new VercelAIAdapter(localConfig as LLMConfig & { provider: string });
    }

    if (config.llm?.remote?.provider === providerName) {
      const remoteConfig = { ...config.llm.remote };
      if (model) {
        remoteConfig.model = model;
      }
      // Ensure provider is set
      remoteConfig.provider = providerName;
      return new VercelAIAdapter(remoteConfig as LLMConfig & { provider: string });
    }

    throw new Error(`Provider ${providerName} not found in configuration`);
  }

  /**
   * Creates a local LLM instance
   * @param config - The configuration
   * @returns The local LLM instance
   * @deprecated Use createLLMByProvider instead
   */
  static createLocalLLM(config: AppConfig): BaseLLM {
    if (config.llm?.local?.provider) {
      return this.createLLMByProvider(config, config.llm.local.provider);
    }
    return this.createLLM(config, 'local');
  }

  /**
   * Creates a remote LLM instance
   * @param config - The configuration
   * @returns The remote LLM instance
   * @deprecated Use createLLMByProvider instead
   */
  static createRemoteLLM(config: AppConfig): BaseLLM {
    if (config.llm?.remote?.provider) {
      return this.createLLMByProvider(config, config.llm.remote.provider);
    }
    return this.createLLM(config, 'remote');
  }

  /**
   * Gets the best available LLM
   * @param config - The configuration
   * @param options - Options for LLM selection
   * @returns The best available LLM
   */
  static async getBestLLM(config: AppConfig, options: LLMSelectionOptions = {}): Promise<BaseLLM> {
    const { preferredProvider, providerName } = options;

    // If a specific provider is requested, use it
    if (providerName) {
      return this.createLLMByProvider(config, providerName);
    }

    // If a preferred provider is specified, try to use it
    if (preferredProvider) {
      try {
        const llm = this.createLLMByProvider(config, preferredProvider);
        if (await llm.isAvailable()) {
          return llm;
        }
      } catch (error) {
        // If the preferred provider is not available, continue to try others
        console.warn(`Preferred provider ${preferredProvider} is not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Try to find an available provider from the config
    if (config.llm?.providers) {
      for (const [providerName, providerConfig] of Object.entries(config.llm.providers)) {
        if (providerConfig.enabled) {
          try {
            const llm = this.createLLMByProvider(config, providerName);
            if (await llm.isAvailable()) {
              return llm;
            }
          } catch (error) {
            // Continue to the next provider
            console.warn(`Provider ${providerName} is not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }

    // If we still don't have an LLM, try the old structure as a fallback
    try {
      // Try local first
      if (config.llm?.local?.enabled) {
        const localProvider = config.llm.local.provider;
        if (localProvider) {
          const llm = this.createLLMByProvider(config, localProvider);
          if (await llm.isAvailable()) {
            return llm;
          }
        }
      }

      // Then try remote
      if (config.llm?.remote?.enabled) {
        const remoteProvider = config.llm.remote.provider;
        if (remoteProvider) {
          const llm = this.createLLMByProvider(config, remoteProvider);
          if (await llm.isAvailable()) {
            return llm;
          }
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
