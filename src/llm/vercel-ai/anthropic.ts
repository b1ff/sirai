import { BaseVercelAIProvider, VercelAIProviderConfig } from './base.js';
import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * Configuration for Anthropic provider
 */
export interface AnthropicProviderConfig extends VercelAIProviderConfig {
  apiKey: string;
}

/**
 * Anthropic provider for Vercel AI SDK
 */
export class AnthropicProvider extends BaseVercelAIProvider {
  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: AnthropicProviderConfig) {
    super({
      ...config,
      model: config.model || 'claude-3-sonnet-20240229'
    });

    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    // Create Anthropic provider
    const anthropic = createAnthropic({
      apiKey: this.apiKey,
      headers: {
        'anthropic-beta': 'token-efficient-tools-2025-02-19'
      },
    });

    this.modelProvider = anthropic;
  }

  /**
   * Initializes the provider
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for Anthropic
  }

}
