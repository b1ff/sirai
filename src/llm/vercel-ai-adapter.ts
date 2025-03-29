import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { z } from 'zod';
import { streamText, generateText, generateObject } from 'ai';
import { BaseVercelAIProvider } from './vercel-ai/base.js';
import { VercelAIFactory } from './vercel-ai/factory.js';

/**
 * Adapter for Vercel AI SDK
 */
export class VercelAIAdapter extends BaseLLM {
  private aiProvider: BaseVercelAIProvider;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig & { provider: string }) {
    super(config);
    this.aiProvider = VercelAIFactory.createProvider(this.provider, config);
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    await this.aiProvider.initialize();
  }

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param userRequest - The user request
   * @param options - Additional options
   * @returns The generated response
   */
  async generate(prompt: string, userRequest: string, options?: LLMOptions): Promise<string> {
    try {
      // Use Vercel AI SDK generateText function
      const result = await generateText({
        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
        system: prompt,
        prompt: userRequest,
        ...this.aiProvider.adaptOptions(options),
      });

      // Extract the text from the result
      return result.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      throw new Error('Failed to generate response: Unknown error');
    }
  }

  /**
   * Generates a response to a prompt with streaming
   * @param prompt - The prompt to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The complete generated response
   */
  async generateStream(
    prompt: string, 
    onChunk: ChunkCallback, 
    options?: LLMOptions
  ): Promise<string> {
    let fullResponse = '';

    try {
      // Use Vercel AI SDK streamText function
      const stream = streamText({
        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
        prompt,
        ...this.aiProvider.adaptOptions(options),
      });

      // Process the stream
      // The stream object has a 'textStream' property that is an async iterable
      for await (const chunk of stream.textStream) {
        if (chunk) {
          fullResponse += chunk;
          onChunk(chunk);
        }
      }

      return fullResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to stream response: ${error.message}`);
      }
      throw new Error('Failed to stream response: Unknown error');
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
    options?: LLMOptions
  ): Promise<T> {
    try {
      // Use Vercel AI SDK generateObject function
      const result = await generateObject({
        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel(), { structuredOutputs: true }),
        prompt,
        schema: schema,
        ...this.aiProvider.adaptOptions(options),
      });

      // Double casting to satisfy TypeScript
      return result as unknown as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate structured output: ${error.message}`);
      }
      throw new Error('Failed to generate structured output: Unknown error');
    }
  }

  /**
   * Creates a new model that generates structured output based on the provided schema
   * @param schema - The Zod schema for the output
   * @returns A model that generates structured output
   */
  withStructuredOutput<T extends Record<string, unknown>>(
    schema: z.ZodType<T>
  ): StructuredLLMOutput<T> {
    const self = this;
    return {
      async invoke(prompt: string, options?: LLMOptions): Promise<T> {
        return await self.generateStructuredOutput<T>(prompt, schema, options);
      }
    };
  }
}
