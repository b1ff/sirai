import { ChatOpenAI } from '@langchain/openai';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
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

/**
 * Interface for OpenAI LLM configuration
 */
export interface OpenAILangChainConfig extends LLMConfig {
  model?: string;
  apiKey: string;
  organization?: string;
}

/**
 * OpenAI LLM provider using LangChain
 */
export class OpenAILangChainLLM extends LangChainLLM {
  private apiKey: string;
  private organization?: string;
  private modelName: string;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: OpenAILangChainConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.organization = config.organization;
    this.modelName = config.model || 'gpt-4';

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    try {
      // Create ChatOpenAI without organization property to avoid type error
      const options: { modelName: string; openAIApiKey: string } = {
        modelName: this.modelName,
        openAIApiKey: this.apiKey,
      };

      // Add organization if provided (using type assertion to avoid type error)
      if (this.organization) {
        (options as any).organization = this.organization;
      }

      this.model = new ChatOpenAI(options);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to initialize OpenAI: ${error.message}`);
      }
      throw new Error('Failed to initialize OpenAI: Unknown error');
    }
  }

  /**
   * Run the LLM tools loop
   * @param messages - The messages to send to the LLM
   * @param options - Additional options
   * @param openAIWithTools - The OpenAI model with tools
   * @returns The final response
   */
  private async runLLmToolsLoop(messages: any[], options: LLMOptions, openAIWithTools: ChatOpenAI) {
    return await runLLmToolsLoop(openAIWithTools, messages, options);
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

      const openAI = this.model as ChatOpenAI;

      // Configure model options
      configureModelOptions(openAI, options);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Bind tools to the model
      let openAIWithTools = openAI.bind({
        tools: options.tools ?? [],
      });

      // Generate response with tools
      const response = await this.runLLmToolsLoop(messages, options, openAIWithTools as any);

      // Format response content
      const content = formatResponseContent(response);

      return {
        content: content,
        toolCalls: [],
        usage: undefined
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI generation failed: ${error.message}`);
      }
      throw new Error('OpenAI generation failed: Unknown error');
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

      const openAI = this.model as ChatOpenAI;

      // Configure model options
      configureModelOptions(openAI, options);

      // Enable streaming
      openAI.streaming = true;

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Generate streaming response
      let fullContent = '';

      const stream = await openAI.stream(messages);

      for await (const chunk of stream) {
        // Format chunk content
        const content = formatResponseContent(chunk);

        fullContent += content;

        // Call the chunk callback
        onChunk({
          content,
          isComplete: false
        });
      }

      // Call the chunk callback with isComplete = true
      onChunk({
        content: '',
        isComplete: true
      });

      return {
        content: fullContent,
        toolCalls: []
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI streaming failed: ${error.message}`);
      }
      throw new Error('OpenAI streaming failed: Unknown error');
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

      let openAI = this.model as ChatOpenAI;

      // Configure model options
      configureModelOptions(openAI, options);

      // Use LangChain's native withStructuredOutput method
      const structuredLlm = openAI.bind({
        tools: options.tools ?? [],
        response_format: {
          type: 'json_schema' as const, json_schema: {
            name: 'response',
            description: schema.description,
            schema
          },
        }
      }).pipe(StructuredOutputParser.fromZodSchema(schema));

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Generate response with structured output
      const result = await structuredLlm.invoke(messages);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI structured output generation failed: ${error.message}`);
      }
      throw new Error('OpenAI structured output generation failed: Unknown error');
    }
  }
}
