import { ChatOllama } from '@langchain/ollama';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseTool } from '../tools/index.js';

/**
 * Interface for Ollama LLM configuration
 */
export interface OllamaLangChainConfig extends LLMConfig {
    baseUrl?: string;
    model?: string;
}

/**
 * Ollama LLM provider using LangChain
 */
export class OllamaLangChainLLM extends LangChainLLM {
    private baseUrl: string;
    private modelName: string;

    /**
     * Constructor
     * @param config - The LLM configuration
     */
    constructor(config: OllamaLangChainConfig) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.modelName = config.model || 'command-r';
    }

    /**
     * Initializes the LLM
     */
    async initialize(): Promise<void> {
        try {
            this.model = new ChatOllama({
                baseUrl: this.baseUrl,
                model: this.modelName,
            });
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to initialize Ollama: ${error.message}`);
            }
            throw new Error('Failed to initialize Ollama: Unknown error');
        }
    }

    /**
     * Run the LLM tools loop
     * @param messages - The messages to send to the LLM
     * @param options - Additional options
     * @param ollamaWithTools - The Ollama model with tools
     * @returns The final response
     */
    private async runLLmToolsLoop(messages: any[], options: LLMOptions, ollamaWithTools: ChatOllama) {
        return await runLLmToolsLoop(ollamaWithTools, messages, options);
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

            const ollama = this.model as ChatOllama;

            // Configure model options
            configureModelOptions(ollama, options);

            // Prepare messages
            const messages = prepareMessages(prompt, options);

            // Bind tools to the model
            let ollamaWithTools = ollama.bind({
                tools: options.tools ?? [],
            });

            // Generate response with tools
            const response = await this.runLLmToolsLoop(messages, options, ollamaWithTools as any);

            // Format response content
            const content = formatResponseContent(response);

            return {
                content: content,
                toolCalls: []
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ollama generation failed: ${error.message}`);
            }
            throw new Error('Ollama generation failed: Unknown error');
        }
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

            const ollama = this.model as ChatOllama;

            // Configure model options
            configureModelOptions(ollama, options);

            // Prepare messages
            const messages = prepareMessages(prompt, options);

            // Generate streaming response
            let fullContent = '';
            let allToolCalls: any[] = [];

            const ollamaWithTools = ollama.bind({
                tools: (options.tools || []).map((t: BaseTool) => t.toLangChainTool()),
            });

            fullContent = await this.streamWithToolCalls(ollamaWithTools as ChatOllama, messages, onChunk, options, allToolCalls, fullContent);


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
                throw new Error(`Ollama streaming failed: ${error.message}`);
            }
            throw new Error('Ollama streaming failed: Unknown error');
        }
    }


    private async streamWithToolCalls(ollamaWithTools: ChatOllama, messages: any[], onChunk: (chunk: LLMChunk) => void, options: LLMOptions, allToolCalls: any[], fullContent: string): Promise<string> {
        const stream = await ollamaWithTools.stream(messages);
        let toolsCalled = false;
        for await (const chunk of stream) {
            // Check if the chunk contains a tool call
            if (chunk.tool_calls && chunk.tool_calls.length > 0) {
                // Process tool calls in the chunk
                const toolCalls = chunk.tool_calls;

                // Add tool call information to the chunk callback
                onChunk({
                    content: `\n[Ollama] Processing ${toolCalls.length} tool call(s) from chunk`,
                    isComplete: false
                });

                // Process each tool call
                for (const toolCall of toolCalls) {
                    // Find the tool
                    const tool = options.tools?.find(t => t.name === toolCall.name);
                    if (tool) {
                        try {
                            // Cast to DynamicTool and execute
                            const dynamicTool = tool.toLangChainTool();
                            const result = await dynamicTool.invoke(toolCall);

                            // Add tool call success information to the chunk callback
                            onChunk({
                                content: `\n[Ollama] Tool ${toolCall.name} executed successfully`,
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
                                content: `\n[Ollama] Tool ${toolCall.name} execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
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
                            content: `\n[Ollama] Tool ${toolCall.name} not found`,
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

        return await this.streamWithToolCalls(ollamaWithTools, messages, onChunk, options, allToolCalls, fullContent);
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

            let ollama = this.model as ChatOllama;

            // Configure model options
            configureModelOptions(ollama, options);

            // Use LangChain's native withStructuredOutput method
            const structuredLlm = ollama.bind({
                format: zodToJsonSchema(schema),
                tools: options.tools ?? [],
            }).pipe(StructuredOutputParser.fromZodSchema(schema));

            // Prepare messages
            const messages = prepareMessages(prompt, options);

            // Generate response with structured output
            const result = await structuredLlm.invoke(messages);

            return result;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ollama structured output generation failed: ${error.message}`);
            }
            throw new Error('Ollama structured output generation failed: Unknown error');
        }
    }

}
