import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StructuredTool } from '@langchain/core/tools';
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
 * Interface for LLM options
 */
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: BaseTool[];
  systemPrompt?: string;
  model?: string;
  responseFormat?: ResponseFormat;
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
   * Converts a Tool to a LangChain StructuredTool
   * @param tool - The tool to convert
   * @returns The LangChain StructuredTool
   */
  protected convertToolToLangChainTool(tool: Tool): StructuredTool {
    // Create a tool object with the required properties
    const toolObj = {
      name: tool.name,
      description: tool.description,
      schema: tool.parameters,
      func: async (args: Record<string, unknown>) => {
        if ('execute' in tool && typeof tool.execute === 'function') {
          return await tool.execute(args);
        }
        throw new Error(`Tool ${tool.name} does not have an execute method`);
      }
    };

    // Cast to unknown first, then to StructuredTool to avoid TypeScript errors
    return toolObj as unknown as StructuredTool;
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
