import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DynamicTool, StructuredTool } from '@langchain/core/tools';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import { BaseTool } from '../tools/index.js';

/**
 * Interface for a structured output model
 */
export interface StructuredLLMModel<T> {
  invoke(prompt: string, options?: LLMOptions): Promise<T>;
}

/**
 * Interface for LLM configuration
 */
export interface LLMConfig {
  [key: string]: unknown;
}

/**
 * Interface for a chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'function';
  content: string;
  toolName?: string;
  functionName?: string;
}

/**
 * Interface for LLM options
 */
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: DynamicTool[];
  systemPrompt?: string;
  model?: string;
  responseFormat?: ResponseFormat;
  chatHistory?: ChatMessage[];
}

/**
 * Interface for response format
 */
export interface ResponseFormat {
  type: string;
  schema?: z.ZodType;
}


/**
 * Interface for LLM response
 */
export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
}

/**
 * Interface for token usage
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Interface for LLM chunk
 */
export interface LLMChunk {
  content: string;
  toolCallsInProgress?: ToolCallInProgress[];
  isComplete: boolean;
}

/**
 * Interface for tool call
 */
export interface ToolCall {
  name: string;
  arguments: object;
  id: string;
}

/**
 * Interface for tool
 */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType;
  required?: boolean;
}

/**
 * Interface for tool call in progress
 */
export interface ToolCallInProgress {
  id: string;
  name: string;
  argumentsPartial: string;
}

/**
 * Type for the chunk callback function
 */
export type ChunkCallback = (chunk: LLMChunk) => void;

/**
 * Base class for LLM providers using LangChain
 */
export abstract class LangChainLLM {
  protected config: LLMConfig;
  protected model!: BaseChatModel;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Initializes the LLM
   */
  abstract initialize(): Promise<void>;

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional options
   * @returns The generated response
   */
  abstract generateResponse(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Generates a response to a prompt with streaming
   * @param prompt - The prompt to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The complete generated response
   */
  abstract streamResponse(
    prompt: string, 
    onChunk: ChunkCallback, 
    options?: LLMOptions
  ): Promise<LLMResponse>;

  /**
   * Generates a structured output based on a schema
   * @param prompt - The prompt to send to the LLM
   * @param schema - The Zod schema for the output
   * @param options - Additional options
   * @returns The structured output
   */
  abstract generateStructuredOutput<T extends Record<string, unknown>>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: LLMOptions
  ): Promise<T>;

  /**
   * Handles streaming with tool calls (base implementation)
   * @param model - The LLM model
   * @param messages - The messages to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The full content of the response
   */
  protected async handleStreamWithToolCalls(
    model: BaseChatModel,
    messages: any[],
    onChunk: ChunkCallback,
    options: LLMOptions = {}
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    // Import necessary functions dynamically to avoid circular dependencies
    const { formatResponseContent, formatToolCall } = await import('./common.js');

    const stream = await model.stream(messages);
    let fullContent = '';
    let allToolCalls: ToolCall[] = [];
    let toolsCalled = false;

    for await (const chunk of stream) {
      // Check if the chunk contains tool calls
      if (chunk.tool_calls && chunk.tool_calls.length > 0) {
        toolsCalled = true;
        const toolCalls = chunk.tool_calls;

        // Notify about tool calls
        onChunk({
          content: `\n🔧 Processing ${toolCalls.length} tool call(s)...\n`,
          isComplete: false
        });

        // Process each tool call
        for (const toolCall of toolCalls) {
          const tool = options.tools?.find(t => t.name === toolCall.name);

          if (!tool) {
            onChunk({
              content: formatToolCall(toolCall, undefined, `Tool "${toolCall.name}" not found`),
              isComplete: false
            });
            continue;
          }

          try {
            // Execute the tool
            onChunk({
              content: `Executing tool: ${toolCall.name}...`,
              isComplete: false
            });

            const result = await tool.invoke(toolCall);

            // Add tool call success information
            onChunk({
              content: formatToolCall(toolCall, result),
              isComplete: false
            });

            // Store the result
            const processedToolCall = {
              ...toolCall,
              id: toolCall.id || `tool-${Date.now()}`,
              arguments: toolCall.args || {}
            };

            allToolCalls.push(processedToolCall);

            // Add the tool result to messages
            messages.push(result);
          } catch (error) {
            // Add tool call error information - pass the error object directly
            onChunk({
              content: formatToolCall(toolCall, undefined, error),
              isComplete: false
            });

            // Store the error
            const processedToolCall = {
              ...toolCall,
              id: toolCall.id || `tool-${Date.now()}`,
              arguments: toolCall.args || {}
            };

            allToolCalls.push(processedToolCall);
          }
        }
      }

      // Format chunk content
      const content = formatResponseContent(chunk);
      fullContent += content;

      // Call the chunk callback
      if (content) {
        onChunk({
          content,
          isComplete: false
        });
      }
    }

    // If tools were called, continue the conversation
    if (toolsCalled) {
      onChunk({
        content: `\n🤖 Continuing conversation with tool results...\n`,
        isComplete: false
      });

      const result = await this.handleStreamWithToolCalls(model, messages, onChunk, options);
      fullContent += result.content;
      allToolCalls = [...allToolCalls, ...result.toolCalls];
    }

    return { content: fullContent, toolCalls: allToolCalls };
  }


  /**
   * Creates a JSON output parser for structured output
   * @param schema - The Zod schema
   * @returns The JSON output parser
   */
  protected createJsonOutputParser<T extends Record<string, unknown>>(schema: z.ZodType<T>): JsonOutputParser<T> {
    return new JsonOutputParser<T>();
  }

  /**
   * Checks if the LLM is available
   * @returns True if the LLM is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Creates a new model that generates structured output based on the provided schema
   * @param schema - The Zod schema for the output
   * @returns A model that generates structured output
   */
  withStructuredOutput<T extends Record<string, unknown>>(
    schema: z.ZodType<T>
  ): StructuredLLMModel<T> {
    const self = this;
    return {
      async invoke(prompt: string, options?: LLMOptions): Promise<T> {
        return await self.generateStructuredOutput<T>(prompt, schema, options);
      }
    };
  }
}
