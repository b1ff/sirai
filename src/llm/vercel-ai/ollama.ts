import { BaseVercelAIProvider, VercelAIProviderConfig } from './base.js';
import { createOllama } from 'ollama-ai-provider';

/**
 * Configuration for Ollama provider
 */
export interface OllamaProviderConfig extends VercelAIProviderConfig {
  baseUrl?: string;
}

/**
 * Ollama provider for Vercel AI SDK
 */
export class OllamaProvider extends BaseVercelAIProvider {
  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: OllamaProviderConfig) {
    super({
      ...config,
      model: config.model || 'mistral-small'
    });

    // Create Ollama provider
    const ollama = createOllama({
      baseURL: this.baseUrl || 'http://localhost:11434/api'
    });

    this.modelProvider = (model: string) => ollama(model,{
      simulateStreaming: true,
      numCtx: 6000, // TODO: config
    });
  }

  /**
   * Initializes the provider
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for Ollama
  }

}
