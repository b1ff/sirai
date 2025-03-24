import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { LangChainLLM, Tool } from './langchain/base.js';
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
  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const genOptions = {
      ...options,
      tools: options?.tools?.map((tool: BaseTool) => tool.toLangChainTool()),
    }
    const response = await this.langChainLLM.generateResponse(prompt, genOptions);
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
      options
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
    return await this.langChainLLM.generateStructuredOutput<T>(prompt, schema, options);
  }

  /**
   * Calls a tool
   * @param prompt - The prompt to send to the LLM
   * @param tools - The tools to make available
   * @param options - Additional options
   * @returns The tool call result
   */
  async callTool(
    prompt: string,
    tools: BaseTool[],
    options?: LLMOptions
  ): Promise<{ toolName: string; arguments: Record<string, unknown> }> {
    const response = await this.langChainLLM.generateResponse(prompt, {
      ...options,
      tools
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      return {
        toolName: toolCall.name,
        arguments: toolCall.arguments as Record<string, unknown>
      };
    }

    throw new Error('No tool was called');
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
