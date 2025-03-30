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

  abstract generate(prompt: string | undefined, userRequest: string, options?: LLMOptions): Promise<string>;

  abstract generateStream(
    systemInstructions: string | undefined,
    userInput: string,
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
