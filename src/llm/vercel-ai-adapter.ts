import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { z } from 'zod';
import { streamText, generateText, generateObject, customProvider, tool } from 'ai';
import { BaseTool } from './tools/index.js';
import { createOpenAI, openai as originalOpenAI } from '@ai-sdk/openai';
import { createAnthropic, anthropic as originalAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import { formatToolCall, formatToolError, formatToolSuccess } from './langchain/common.js';
import chalk from 'chalk';

/**
 * Adapter for Vercel AI SDK
 */
export class VercelAIAdapter extends BaseLLM {
  protected model: string;
  protected apiKey: string;
  protected modelProvider: any;
  protected baseUrl?: string;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig & { provider: string }) {
    super(config);

    if (this.provider === 'openai') {
      this.model = config.model || 'gpt-3.5-turbo';
      this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';

      if (!this.apiKey) {
        throw new Error('OpenAI API key is required');
      }

      // Create OpenAI provider
      const openai = createOpenAI({
        apiKey: this.apiKey
      });

      this.modelProvider = openai;
    } else if (this.provider === 'anthropic') {
      this.model = config.model || 'claude-3-sonnet-20240229';
      this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';

      if (!this.apiKey) {
        throw new Error('Anthropic API key is required ' + JSON.stringify(config));
      }

      // Create Anthropic provider
      const anthropic = createAnthropic({
        apiKey: this.apiKey
      });

      this.modelProvider = anthropic;
    } else if (this.provider === 'ollama') {
      this.model = config.model || 'llama3';
      this.baseUrl = config.baseUrl || 'http://localhost:11434';
      this.apiKey = ''; // Not required for Ollama, but needed to satisfy TypeScript

      // Create Ollama provider using ollama-ai-provider
      const ollama = createOllama({
        baseURL: this.baseUrl
      });

      // Set the model provider
      this.modelProvider = ollama;
    } else {
      throw new Error(`Unsupported provider: ${this.provider}. Only 'openai', 'anthropic', and 'ollama' are supported.`);
    }
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    // Nothing to initialize for Vercel AI SDK
  }

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional options
   * @returns The generated response
   */
  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    try {
      // Use Vercel AI SDK generateText function
      const result = await generateText({
        model: this.modelProvider(this.model),
        prompt,
        ...this.adaptOptions(options),
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
        model: this.modelProvider(this.model),
        prompt,
        ...this.adaptOptions(options),
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
        model: this.modelProvider(this.model, { structuredOutputs: true }),
        prompt,
        schema: schema,
        ...this.adaptOptions(options),
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

  /**
   * Adapts the options for Vercel AI SDK
   * @param options - The options to adapt
   * @returns The adapted options
   */
  private adaptOptions(options?: LLMOptions): Record<string, any> {
    if (!options) return {};

    const adaptedOptions: Record<string, any> = { ...options };

    // Handle tools if provided
    if (options.tools && options.tools.length > 0) {
      // Convert tools to the format expected by Vercel AI SDK
      const toolsMap: Record<string, any> = {};

      options.tools.forEach(toolItem => {
        toolsMap[toolItem.name] = tool({
          description: toolItem.description,
          parameters: toolItem.parameters,
          execute: async (args: Record<string, unknown>) => {
            // Create a toolCall object for logging
            const toolCall = {
              name: toolItem.name,
              args: args
            };

            console.log(chalk.yellow(`\n🔧 Executing tool: ${toolItem.name}...`));

            try {
              const result = await toolItem.execute(args);

              // Log the successful tool call
              console.log(formatToolCall(toolCall, result));
              console.log(formatToolSuccess(toolItem.name, JSON.stringify(result).substring(0, 100)));

              return result;
            } catch (error) {
              // Log the error
              console.log(formatToolCall(toolCall, undefined, error));
              console.log(formatToolError(toolItem.name, String(error)));

              if (error instanceof Error) {
                throw new Error(`Tool execution failed: ${error.message}`);
              }
              throw new Error(`Tool execution failed: ${String(error)}`);
            }
          }
        });
      });

      adaptedOptions.tools = toolsMap;

      // Enable multi-step tool calls by setting maxSteps
      // This allows the model to call tools and then generate more text based on the results
      adaptedOptions.maxSteps = options.maxSteps || 5;
    }

    return adaptedOptions;
  }

}
