import { BaseVercelAIProvider, VercelAIProviderConfig } from './base.js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ProviderV1 } from '@ai-sdk/provider';

/**
 * Configuration for Google AI provider
 */
export interface GoogleProviderConfig extends VercelAIProviderConfig {
  apiKey: string;
}

/**
 * Google AI provider for Vercel AI SDK
 */
export class GoogleProvider extends BaseVercelAIProvider {
  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: GoogleProviderConfig) {
    super({
      ...config,
      model: config.model || 'gemini-2.5-pro-exp-03-25'
    });

    if (!this.apiKey) {
      throw new Error('Google AI API key is required');
    }

    // Create Google AI provider
    const google: ProviderV1 = createGoogleGenerativeAI({
      apiKey: this.apiKey
    });

    this.modelProvider = google;
  }

  /**
   * Initializes the provider
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for Google AI
  }
}
