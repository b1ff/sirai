import { BaseVercelAIProvider, VercelAIProviderConfig } from './base.js';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Configuration for OpenAI provider
 */
export interface OpenAIProviderConfig extends VercelAIProviderConfig {
  apiKey: string;
}

/**
 * OpenAI provider for Vercel AI SDK
 */
export class OpenAIProvider extends BaseVercelAIProvider {
  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: OpenAIProviderConfig) {
    super({
      ...config,
      model: config.model || 'gpt-3.5-turbo'
    });

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Create OpenAI provider
    const openai = createOpenAI({
      apiKey: this.apiKey
    });

    this.modelProvider = openai;
  }

  /**
   * Initializes the provider
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for OpenAI
  }

}
