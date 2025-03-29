import { z } from 'zod';
import { BaseTool } from './tools/index.js';

/**
 * Interface for LLM configuration
 */
export interface LLMConfig {
  [key: string]: any;
}

/**
 * Interface for LLM generation options
 */
export interface LLMOptions {
  tools?: BaseTool[];
  [key: string]: any;
}

/**
 * Interface for a structured output model
 */
export interface StructuredLLMOutput<T> {
  invoke(prompt: string, options?: LLMOptions): Promise<T>;
}

/**
 * Type for the chunk callback function
 */
export type ChunkCallback = (chunk: string) => void;

/**
 * Base class for LLM providers
 */
export abstract class BaseLLM {
  protected config: LLMConfig;
  public readonly provider: string;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig) {
    this.config = config;
    this.provider = config.provider;
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
  abstract generate(prompt: string, options?: LLMOptions): Promise<string>;

  /**
   * Generates a response to a prompt with streaming
   * @param prompt - The prompt to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The complete generated response
   */
  abstract generateStream(
    prompt: string, 
    onChunk: ChunkCallback, 
    options?: LLMOptions
  ): Promise<string>;

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
  abstract withStructuredOutput<T extends Record<string, unknown>>(
    schema: z.ZodType<T>
  ): StructuredLLMOutput<T>;
}
