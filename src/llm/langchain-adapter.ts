import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { LangChainLLM } from './langchain/base.js';
import { LangChainFactory } from './langchain/factory.js';
import { z } from 'zod';
import { BaseTool } from './tools/index.js';

/**
 * Adapter for LangChain LLM providers
 */
export class LangChainAdapter extends BaseLLM {
  private langChainLLM: LangChainLLM;
  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig & { provider: string }) {
    super(config);
    this.langChainLLM = LangChainFactory.createLLM(this.provider, config);
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    await this.langChainLLM.initialize();
  }

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional options
   * @returns The generated response
   */
  async generate(prompt: string, userRequest: string, options?: LLMOptions): Promise<string> {
    const response = await this.langChainLLM.generateResponse(prompt, this.adaptOptions(options));
    return response.content;
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

    await this.langChainLLM.streamResponse(
      prompt,
      (chunk) => {
        if (chunk.content) {
          fullResponse += chunk.content;
          onChunk(chunk.content);
        }
      },
      this.adaptOptions(options)
    );

    return fullResponse;
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
    return await this.langChainLLM.generateStructuredOutput<T>(prompt, schema, this.adaptOptions(options));
  }

  private adaptOptions(options: LLMOptions | undefined | { tools?: BaseTool[] | undefined; [p: string]: any }) {
    return {
      ...options,
      tools: options?.tools?.map(t => t.toLangChainTool())
    };
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
