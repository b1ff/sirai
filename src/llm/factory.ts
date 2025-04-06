import { BaseLLM, LLMConfig } from './base.js';
import { VercelAIAdapter } from './vercel-ai-adapter.js';

/**
 * Interface for application configuration
 */
export interface AppConfig {
  llm?: {
    providers: {
      [key: string]: LLMProviderConfig;
    };
  };
  taskPlanning?: {
    preferredProvider?: string;
    providerConfig?: {
      [taskType: string]: {
        provider: string;
        model?: string;
      };
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
  taskType?: string;
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
    // Default provider based on type
    const defaultProvider = type === 'local' ? 'ollama' : 'openai';

    // Check if providers exist in config
    if (!config.llm?.providers) {
      throw new Error('No LLM providers configured');
    }

    // Find an enabled provider
    for (const [providerName, providerConfig] of Object.entries(config.llm.providers)) {
      if (providerConfig.enabled) {
        // For 'local' type, prefer local providers like ollama
        // For 'remote' type, prefer remote providers like openai, anthropic, etc.
        const isLocalProvider = providerName === 'ollama';
        if ((type === 'local' && isLocalProvider) || (type === 'remote' && !isLocalProvider)) {
          return new VercelAIAdapter({
            ...providerConfig,
            provider: providerName
          });
        }
      }
    }

    // If no type-specific provider found, try to use the default provider for the type
    if (config.llm.providers[defaultProvider] && config.llm.providers[defaultProvider].enabled) {
      return new VercelAIAdapter({
        ...config.llm.providers[defaultProvider],
        provider: defaultProvider
      });
    }

    // If still no provider found, use any enabled provider
    for (const [providerName, providerConfig] of Object.entries(config.llm.providers)) {
      if (providerConfig.enabled) {
        return new VercelAIAdapter({
          ...providerConfig,
          provider: providerName
        });
      }
    }

    throw new Error(`No enabled LLM providers found for type: ${type}`);
  }

  /**
   * Creates an LLM instance based on a provider name
   * @param config - The application configuration
   * @param providerName - The name of the provider to use
   * @param model - Optional model to use (overrides the one in the provider config)
   * @returns The LLM instance
   */
  static createLLMByProvider(config: AppConfig, providerName: string, model?: string): BaseLLM {
    // Check if providers exist in config
    if (!config.llm?.providers) {
      throw new Error('No LLM providers configured');
    }

    // Check if the provider exists in the providers section
    if (config.llm.providers[providerName]) {
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

    throw new Error(`Provider ${providerName} not found in configuration`);
  }

  /**
   * Creates a local LLM instance
   * @param config - The configuration
   * @returns The local LLM instance
   * @deprecated Use createLLMByProvider instead
   */
  static createLocalLLM(config: AppConfig): BaseLLM {
    return this.createLLM(config, 'local');
  }

  /**
   * Creates a remote LLM instance
   * @param config - The configuration
   * @returns The remote LLM instance
   * @deprecated Use createLLMByProvider instead
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
    const { preferredProvider, providerName, taskType } = options;

    // If a specific provider is requested, use it
    if (providerName) {
      return this.createLLMByProvider(config, providerName);
    }

    // If a task type is specified, check if there's a specific provider for it in taskPlanning.providerConfig
    if (taskType && config.taskPlanning?.providerConfig?.[taskType]) {
      const taskConfig = config.taskPlanning.providerConfig[taskType];
      try {
        const llm = this.createLLMByProvider(config, taskConfig.provider, taskConfig.model);
        if (await llm.isAvailable()) {
          return llm;
        }
      } catch (error) {
        console.warn(`Task-specific provider for ${taskType} is not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue to other fallback options
      }
    }

    // If task type doesn't have a specific config or it failed, check for 'default' config
    if (config.taskPlanning?.providerConfig?.default) {
      try {
        const defaultConfig = config.taskPlanning.providerConfig.default;
        const llm = this.createLLMByProvider(config, defaultConfig.provider, defaultConfig.model);
        if (await llm.isAvailable()) {
          return llm;
        }
      } catch (error) {
        console.warn(`Default task provider is not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue to other fallback options
      }
    }

    // If a preferred provider is specified (either from options or from taskPlanning.preferredProvider), try to use it
    const effectivePreferredProvider = preferredProvider || config.taskPlanning?.preferredProvider;
    if (effectivePreferredProvider) {
      try {
        const llm = this.createLLMByProvider(config, effectivePreferredProvider);
        if (await llm.isAvailable()) {
          return llm;
        }
      } catch (error) {
        console.warn(`Preferred provider ${effectivePreferredProvider} is not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue to other fallback options
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

    throw new Error('No available LLM providers found');
  }
}
