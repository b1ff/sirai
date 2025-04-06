import { z } from 'zod';
import { BaseTool } from './tools/index.js';
import { DEFAULT_PRICING_CONFIG } from '../config/config.js';

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
/**
 * Interface for token usage tracking
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

/**
 * Base class for LLM providers
 */
export abstract class BaseLLM {
  protected config: LLMConfig;
  public readonly provider: string;
  protected model: string;
  
  // Token tracking properties
  protected inputTokens: number = 0;
  protected outputTokens: number = 0;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: LLMConfig) {
    this.config = config;
    this.provider = config.provider;
    this.model = config.model || '';
  }

  /**
   * Gets the provider and model information as a string
   * @returns A string in the format "provider:model" or just "provider" if model info is not available
   */
  getProviderWithModel(): string {
    return this.model ? `${this.provider}:${this.model}` : this.provider;
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

  /**
   * Tracks input tokens used in a request
   * @param count - Number of tokens to add to the input token count
   */
  protected trackInputTokens(count: number): void {
    this.inputTokens += count;
  }

  /**
   * Tracks output tokens used in a response
   * @param count - Number of tokens to add to the output token count
   */
  protected trackOutputTokens(count: number): void {
    this.outputTokens += count;
  }

  /**
   * Gets the current token usage statistics
   * @returns Token usage information including counts and cost
   */
  public getTokenUsage(): TokenUsage {
    const totalTokens = this.inputTokens + this.outputTokens;
    const cost = this.calculateCost();
    
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens,
      cost
    };
  }

  /**
   * Calculates the cost of tokens used based on the model's pricing
   * @returns The calculated cost in USD
   */
  protected calculateCost(): number {
    const modelName = this.model;
    if (!modelName) return 0;
    
    // Get price per 1000 tokens for this model
    const pricePerThousandTokens = DEFAULT_PRICING_CONFIG.modelPrices[modelName] || 0;
    
    // Calculate cost: input tokens are typically cheaper than output tokens
    // For simplicity, we're using the same price for both, but this could be refined
    const totalCost = (this.inputTokens + this.outputTokens) * pricePerThousandTokens / 1000;
    
    return parseFloat(totalCost.toFixed(6)); // Round to 6 decimal places
  }

  /**
   * Resets the token counters
   */
  public resetTokenCounters(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  /**
   * Gets the cost of tokens used in USD
   * @returns The calculated cost in USD
   */
  public getCostInUSD(): number {
    return this.calculateCost();
  }

  /**
   * Disposes of any resources used by the LLM
   * This method should be called when the LLM is no longer needed
   */
  public async dispose(): Promise<void> {
    // Base implementation does nothing
    // Subclasses should override this method if they need to clean up resources
  }
}
