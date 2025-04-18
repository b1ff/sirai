import { LLMConfig } from '../base.js';
import { BaseVercelAIProvider } from './base.js';
import { OpenAIProvider, OpenAIProviderConfig } from './openai.js';
import { AnthropicProvider, AnthropicProviderConfig } from './anthropic.js';
import { OllamaProvider, OllamaProviderConfig } from './ollama.js';
import { GoogleProvider, GoogleProviderConfig } from './google.js';
import { LmStudioProvider, LmStudioProviderConfig } from './lmstudio.js';

/**
 * Factory for creating Vercel AI provider instances
 */
export class VercelAIFactory {
  static createProvider(provider: string, config: LLMConfig): BaseVercelAIProvider {
    switch (provider.toLowerCase()) {
      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI API key is required in configuration');
        }
        return new OpenAIProvider(config as OpenAIProviderConfig);
      case 'anthropic':
        if (!config.apiKey) {
          throw new Error('Anthropic API key is required in configuration');
        }
        return new AnthropicProvider(config as AnthropicProviderConfig);
      case 'ollama':
        return new OllamaProvider(config as OllamaProviderConfig);
      case 'lmstudio':
        return new LmStudioProvider(config as LmStudioProviderConfig);
      case 'google':
        if (!config.apiKey) {
          throw new Error('Google AI API key is required in configuration');
        }
        return new GoogleProvider(config as GoogleProviderConfig);
      default:
        throw new Error(`Unsupported Vercel AI provider: ${provider}`);
    }
  }
}
