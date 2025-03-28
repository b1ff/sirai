import { ChatAnthropic } from '@langchain/anthropic';
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';

import { 
  LangChainLLM, 
  LLMConfig, 
  LLMOptions, 
  LLMResponse, 
  LLMChunk, 
  ChunkCallback
} from './base.js';
import { 
  prepareMessages, 
  configureModelOptions, 
  formatResponseContent, 
  runLLmToolsLoop 
} from './common.js';
import { Runnable } from '@langchain/core/runnables';

/**
 * Interface for Claude LLM configuration
 */
export interface ClaudeLangChainConfig extends LLMConfig {
  model?: string;
  apiKey: string;
}

/**
 * Claude LLM provider using LangChain
 */
export class ClaudeLangChainLLM extends LangChainLLM {
  private apiKey: string;
  private modelName: string;

  /**
   * Constructor
   * @param config - The LLM configuration
   */
  constructor(config: ClaudeLangChainConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.modelName = config.model || 'claude-3-opus-20240229';

    if (!this.apiKey) {
      throw new Error('Claude API key is required');
    }
  }

  /**
   * Initializes the LLM
   */
  async initialize(): Promise<void> {
    try {
      this.model = new ChatAnthropic({
        model: this.modelName,
        anthropicApiKey: this.apiKey,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to initialize Claude: ${error.message}`);
      }
      throw new Error('Failed to initialize Claude: Unknown error');
    }
  }

  /**
   * Generates a response to a prompt
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional options
   * @returns The generated response
   */
  async generateResponse(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      const claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      let claudeWithTools = claude.bind({
        tools: options.tools ?? [],
        tool_choice: 'auto',
      });

      const response = await this.runLLmToolsLoop(messages, options, claudeWithTools as any)

      // Format response content
      const content = formatResponseContent(response);

      return {
        content: content,
        toolCalls: [],
        usage: undefined
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude generation failed: ${JSON.stringify(error, null, 2)}`);
      }
      throw new Error('Claude generation failed: Unknown error');
    }
  }

  private async runLLmToolsLoop(messages: any[], options: LLMOptions, claudeWithTools: ChatAnthropic) {
    return await runLLmToolsLoop(claudeWithTools, messages, options);
  }

  /**
   * Generates a response to a prompt with streaming
   * @param prompt - The prompt to send to the LLM
   * @param onChunk - Callback function for each chunk of the response
   * @param options - Additional options
   * @returns The complete generated response
   */
  async streamResponse(
    prompt: string, 
    onChunk: ChunkCallback, 
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      const claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Generate streaming response
      let fullContent = '';
      let allToolCalls: any[] = [];

      const claudeWithTools = claude.bindTools(options.tools || []);

      fullContent = await this.streamWithToolCalls(claudeWithTools as ChatAnthropic, messages, onChunk, options, allToolCalls, fullContent);

      // Call the chunk callback with isComplete = true
      onChunk({
        content: '',
        isComplete: true
      });

      return {
        content: fullContent,
        toolCalls: allToolCalls.map(tc => ({
          name: String(tc.name),
          arguments: tc.args || {},
          id: String(tc.id || `tool-${Date.now()}`)
        }))
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude streaming failed: ${error.message}`);
      }
      throw new Error('Claude streaming failed: Unknown error');
    }
  }

  private async streamWithToolCalls(claudeWithTools: ChatAnthropic, messages: any[], onChunk: (chunk: LLMChunk) => void, options: LLMOptions, allToolCalls: any[], fullContent: string): Promise<string> {
    const stream = await claudeWithTools.stream(messages);
    let toolsCalled = false;
    for await (const chunk of stream) {
      // Check if the chunk contains a tool call
      if (chunk.tool_calls && chunk.tool_calls.length > 0) {
        // Process tool calls in the chunk
        const toolCalls = chunk.tool_calls;

        // Add tool call information to the chunk callback
        onChunk({
          content: `\n[Claude] Processing ${toolCalls.length} tool call(s) from chunk`,
          isComplete: false
        });

        // Process each tool call
        for (const toolCall of toolCalls) {
          // Find the tool
          const tool = options.tools?.find(t => t.name === toolCall.name);
          if (tool) {
            try {
              // Cast to DynamicTool and execute
              const dynamicTool = tool as unknown as DynamicTool;
              const result = await dynamicTool.invoke(toolCall);

              // Add tool call success information to the chunk callback
              onChunk({
                content: `\n[Claude] Tool ${toolCall.name} executed successfully`,
                isComplete: false
              });

              // Store the result
              const processedToolCall = {
                ...toolCall,
                result
              };

              allToolCalls.push(processedToolCall);

              // Add the tool call result to the messages
              messages.push(result);
            } catch (toolError) {
              // Add tool call error information to the chunk callback
              onChunk({
                content: `\n[Claude] Tool ${toolCall.name} execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
                isComplete: false
              });

              // Store the error
              const processedToolCall = {
                ...toolCall,
                error: toolError instanceof Error ? toolError.message : String(toolError)
              };

              allToolCalls.push(processedToolCall);

              // Add the tool call error to the messages
              messages.push(processedToolCall);
            }
          } else {
            // Add tool not found information to the chunk callback
            onChunk({
              content: `\n[Claude] Tool ${toolCall.name} not found`,
              isComplete: false
            });
          }
        }
        toolsCalled = true;
      }

      // Format chunk content
      const content = formatResponseContent(chunk);

      fullContent += content;

      // Call the chunk callback
      onChunk({
        content,
        isComplete: false
      });
    }

    if (!toolsCalled) {
      return fullContent;
    }

    return await this.streamWithToolCalls(claudeWithTools, messages, onChunk, options, allToolCalls, fullContent);
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
    options: LLMOptions = {}
  ): Promise<T> {
    try {
      if (!this.model) {
        await this.initialize();
      }

      let claude = this.model as ChatAnthropic;

      // Configure model options
      configureModelOptions(claude, options);

      // Use LangChain's native withStructuredOutput method
      const structuredLlm = claude.withStructuredOutput(schema);

      // Prepare messages
      const messages = prepareMessages(prompt, options);

      // Generate response with structured output
      const result = await structuredLlm.invoke(messages);

      // Use type assertion to ensure the result is properly typed
      return result as unknown as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude structured output generation failed: ${error.message}`);
      }
      throw new Error('Claude structured output generation failed: Unknown error');
    }
  }
}
