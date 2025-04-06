import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { z } from 'zod';
import { streamText, generateText, generateObject } from 'ai';
import { BaseVercelAIProvider } from './vercel-ai/base.js';
import { VercelAIFactory } from './vercel-ai/factory.js';
import { AITracer } from '../utils/tracer.js';

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
   * Gets the provider and model information as a string
   * @returns A string in the format "provider:model"
   */
  override getProviderWithModel(): string {
    return `${this.provider}:${this.aiProvider.getModel()}`;
  }

  /**
   * Generates a response to a prompt
   * @param systemInstructions - The system instructions to send to the LLM
   * @param userInput - The user input
   * @param options - Additional options
   * @returns The generated response
   */
  async generate(systemInstructions: string | undefined, userInput: string, options?: LLMOptions): Promise<string> {
    // Trace the prompt
    AITracer.getInstance().tracePrompt(systemInstructions, userInput);

    // Use Vercel AI SDK generateText function
    const result = await generateText({
      model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
      prompt: userInput,
      system: systemInstructions, // note that system instructions works very bad with local llms
      toolChoice: 'auto',
      ...this.aiProvider.adaptOptions(options),
    });

    // Trace the response
    AITracer.getInstance().traceResponse(result.text);

    // Extract the text from the result
    return result.text;
  }

  async generateStream(
    systemInstructions: string | undefined,
    userInput: string,
    onChunk: ChunkCallback, 
    options?: LLMOptions
  ): Promise<string> {
    let fullResponse = '';

    try {
      // Trace the prompt
      AITracer.getInstance().tracePrompt(systemInstructions, userInput);
      
      const stream = streamText({
        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
        system: systemInstructions,
        prompt: userInput,
        ...this.aiProvider.adaptOptions(options),
      });

      for await (const chunk of stream.textStream) {
        if (chunk) {
          fullResponse += chunk;
          onChunk(chunk);
        }
      }
      
      // Trace the complete response
      AITracer.getInstance().traceResponse(fullResponse);

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
      // Trace the prompt
      AITracer.getInstance().tracePrompt(undefined, prompt);
      
      // Use Vercel AI SDK generateObject function
      const result = await generateObject({
        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel(), { structuredOutputs: true }),
        prompt,
        schema: schema,
        ...this.aiProvider.adaptOptions(options),
      });

      // Trace the response
      AITracer.getInstance().traceResponse(JSON.stringify(result, null, 2));

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
