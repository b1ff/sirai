import { ChatAnthropic } from '@langchain/anthropic';
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';

import { 
  LangChainLLM, 
  LLMConfig, 
  LLMOptions, 
  LLMResponse, 
  LLMChunk, 
  ChunkCallback
} from './base.js';
import { 
  prepareMessages, 
  configureModelOptions, 
  formatResponseContent, 
  runLLmToolsLoop 
} from './common.js';
import { Runnable } from '@langchain/core/runnables';

/**
 * Interface for Claude LLM configuration
 */
export interface ClaudeLangChainConfig extends LLMConfig {
  model?: string;
  apiKey: string;
}

/**
 * Claude LLM provider using LangChain
 */
export class ClaudeLangChainLLM extends LangChainLLM {
  private apiKey: string;
  private modelName: string;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: ClaudeLangChainConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.modelName = config.model || 'claude-3-opus-20240229';

    if (!this.apiKey) {
      throw new Error('Claude API key is required');
    }
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    try {
      this.model = new ChatAnthropic({
        model: this.modelName,
        anthropicApiKey: this.apiKey,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to initialize Claude: ${error.message}`);
      }
      throw new Error('Failed to initialize Claude: Unknown error');
    }
  }

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional options
   * @returns The generated response
   */
  async generateResponse(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      const claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Bind tools to the model
      const claudeWithTools = claude.bind({
        tools: (options.tools ?? []),
        tool_choice: 'auto',
      });

      // Use the common runLLmToolsLoop method
      const response = await runLLmToolsLoop(claudeWithTools as any, messages, options);

      // Format response content
      const content = formatResponseContent(response);

      return {
        content,
        toolCalls: [],
        usage: undefined
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude generation failed: ${error.message}`);
      }
      throw new Error('Claude generation failed: Unknown error');
    }
  }

  /**
   * Generates a response to a prompt with streaming
   * @param prompt - The prompt to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The complete generated response
   */
  async streamResponse(
    prompt: string, 
    onChunk: ChunkCallback, 
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      const claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Bind tools to the model
      const claudeWithTools = claude.bindTools(options.tools || []);

      // Use the base class's handleStreamWithToolCalls method
      const { content, toolCalls } = await this.handleStreamWithToolCalls(
        claudeWithTools as ChatAnthropic,
        messages,
        onChunk,
        options
      );

      // Call the chunk callback with isComplete = true
      onChunk({
        content: '',
        isComplete: true
      });

      return {
        content,
        toolCalls
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude streaming failed: ${error.message}`);
      }
      throw new Error('Claude streaming failed: Unknown error');
    }
  }


  /**
   * Generates a structured output based on a schema
   * @param prompt - The prompt to send to the LLM
   * @param schema - The Zod schema for the output
   * @param options - Additional options
   * @returns The structured output
   */
  async generateStructuredOutput<T extends Record<string, unknown>>(
    prompt: string,
    schema: z.ZodType<T>,
    options: LLMOptions = {}
  ): Promise<T> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      let claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Use LangChain's native withStructuredOutput method
      const structuredLlm = claude.withStructuredOutput(schema);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Generate response with structured output
      const result = await structuredLlm.invoke(messages);

      // Use type assertion to ensure the result is properly typed
      return result as unknown as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude structured output generation failed: ${error.message}`);
      }
      throw new Error('Claude structured output generation failed: Unknown error');
    }
  }
}
