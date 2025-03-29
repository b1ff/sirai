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
            const ollamaWithTools = ollama.bind({
                tools: options.tools ?? [],
            });

            // Use the common runLLmToolsLoop method
            const response = await runLLmToolsLoop(ollamaWithTools as any, messages, options);

            // Format response content
            const content = formatResponseContent(response);

            return {
                content,
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

            // Bind tools to the model
            const ollamaWithTools = ollama.bind({
                tools: (options.tools || []),
            });

            // Use the base class's handleStreamWithToolCalls method
            const { content, toolCalls } = await this.handleStreamWithToolCalls(
                ollamaWithTools as ChatOllama,
                messages,
                onChunk,
                options
            );

            // Call the chunk callback with isComplete = true
            onChunk({
                content: '',
                isComplete: true
            });

            return {
                content,
                toolCalls
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ollama streaming failed: ${error.message}`);
            }
            throw new Error('Ollama streaming failed: Unknown error');
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
