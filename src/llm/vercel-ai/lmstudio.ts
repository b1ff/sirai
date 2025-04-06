import { BaseVercelAIProvider, VercelAIProviderConfig } from './base.js';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Configuration for Ollama provider
 */
export interface LmStudioProviderConfig extends VercelAIProviderConfig {
  baseUrl?: string;
}

/**
 * Ollama provider for Vercel AI SDK
 */
export class LmStudioProvider extends BaseVercelAIProvider {
  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: LmStudioProviderConfig) {
    super({
      ...config,
      model: config.model || 'mistral-small-3.1-24b-instruct-2503'
    });


    // Create OpenAI provider
    const openai = createOpenAI({
      apiKey: 'whatever',
      baseURL: 'http://localhost:1234/v1' // lm studio
    });

    this.modelProvider = (model: string) => openai(model);
  }

  /**
   * Initializes the provider
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for Ollama
  }

}
