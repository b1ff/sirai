import { LLMConfig, LLMOptions } from '../base.js';
import { BaseTool } from '../tools/index.js';
import { formatToolCall, formatToolError, formatToolSuccess } from '../tools/formatting.js';
import chalk from 'chalk';
import { tool } from 'ai';
import { ZodError } from 'zod';

/**
 * Base configuration for Vercel AI providers
 */
export interface VercelAIProviderConfig extends LLMConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Base class for Vercel AI providers
 */
export abstract class BaseVercelAIProvider {
  protected model: string;
  protected apiKey: string;
  protected baseUrl?: string;
  protected modelProvider: any;

  /**
   * Constructor
   * @param config - The provider configuration
   */
  constructor(config: VercelAIProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl;
  }

  /**
   * Initializes the provider
   */
  abstract initialize(): Promise<void>;

  /**
   * Gets the model provider
   * @returns The model provider
   */
  getModelProvider(): any {
    return this.modelProvider;
  }

  /**
   * Gets the model name
   * @returns The model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Adapts options for the Vercel AI SDK
   * @param options - The options to adapt
   * @returns The adapted options
   */
  adaptOptions(options?: LLMOptions): Record<string, any> {
    if (!options) return {};

    const adaptedOptions: Record<string, any> = { ...options };

    // Handle tools if provided
    if (options.tools && options.tools.length > 0) {
      // Convert tools to the format expected by Vercel AI SDK
      const toolsMap: Record<string, any> = {};

      options.tools.forEach(toolItem => {
        toolsMap[toolItem.name] = this.createTool(toolItem);
      });

      adaptedOptions.tools = toolsMap;

      // Enable multi-step tool calls by setting maxSteps
      // This allows the model to call tools and then generate more text based on the results
      adaptedOptions.maxSteps = options.maxSteps || 55;
      adaptedOptions.experimental_continueSteps = true;
    }

    return adaptedOptions;
  }

  /**
   * Creates a tool for the Vercel AI SDK
   * @param toolItem - The tool to create
   * @returns The created tool
   */
  protected createTool(toolItem: BaseTool): any {
    return tool({
      description: toolItem.description,
      parameters: toolItem.parameters,
      execute: async (args: Record<string, unknown>) => {
        return await this.executeTool(toolItem, args);
      },
    });
  }

  /**
   * Executes a tool
   * @param toolItem - The tool to execute
   * @param args - The arguments for the tool
   * @returns The result of the tool execution
   */
  protected async executeTool(toolItem: BaseTool, args: Record<string, unknown>): Promise<any> {
    // Create a toolCall object for logging
    const toolCall = {
      name: toolItem.name,
      args: args
    };

    console.log(chalk.yellow(`\n🔧 Executing tool: ${toolItem.name}...`));
    
    // Trace the tool call
    const { AITracer } = await import('../../utils/tracer.js');
    AITracer.getInstance().traceToolCall(toolItem.name, args);

    try {
      const result = await toolItem.execute(args);

      // Log the successful tool call
      console.log(formatToolCall(toolCall, result));
      console.log(formatToolSuccess(toolItem.name, JSON.stringify(result).substring(0, 100)));
      
      // Trace the tool result
      AITracer.getInstance().traceToolResult(toolItem.name, result);

      return result;
    } catch (error) {
      // Log the error
      console.log(formatToolCall(toolCall, undefined, error));
      console.log(formatToolError(toolItem.name, String(error)));
      if (error instanceof ZodError) {
        return JSON.stringify({
          result: 'error: validation failed, please fix the errors',
          error: error.errors
        }, null, 2);
      }

      if (error instanceof Error) {
        return JSON.stringify({
          result: `error: ${error.message}`
        }, null, 2);
      }

      return JSON.stringify({
        result: `error: ${String(error)}`
      }, null, 2);
    }
  }
}
