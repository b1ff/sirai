import { LangChainLLM, LLMConfig } from './base.js';
import { OpenAILangChainLLM, OpenAILangChainConfig } from './openai.js';
import { ClaudeLangChainLLM, ClaudeLangChainConfig } from './claude.js';
import { OllamaLangChainLLM, OllamaLangChainConfig } from './ollama.js';

/**
 * Factory for creating LangChain LLM instances
 */
export class LangChainFactory {
  /**
   * Creates a LangChain LLM instance based on the provider
   * @param provider - The provider type
   * @param config - The LLM configuration
   * @returns The LangChain LLM instance
   */
  static createLLM(provider: string, config: LLMConfig): LangChainLLM {
    switch (provider.toLowerCase()) {
      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI API key is required in configuration');
        }
        return new OpenAILangChainLLM(config as OpenAILangChainConfig);
      case 'claude':
        if (!config.apiKey) {
          throw new Error('Claude API key is required in configuration');
        }
        return new ClaudeLangChainLLM(config as ClaudeLangChainConfig);
      case 'ollama':
        return new OllamaLangChainLLM(config as OllamaLangChainConfig);
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }
}
