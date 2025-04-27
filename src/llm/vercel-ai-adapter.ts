import { BaseLLM, LLMConfig, LLMOptions, ChunkCallback, StructuredLLMOutput } from './base.js';
import { z, ZodError } from 'zod';
import { streamText, generateText, generateObject, CoreMessage } from 'ai';
import { BaseVercelAIProvider } from './vercel-ai/base.js';
import { VercelAIFactory } from './vercel-ai/factory.js';
import { AITracer } from '../utils/tracer.js';
import { LlmRequest } from './LlmRequest.js';
import { handleZodError } from './tools/index.js';

export class VercelAIAdapter extends BaseLLM {
    private aiProvider: BaseVercelAIProvider;

    constructor(config: LLMConfig & {provider: string}) {
        super(config);
        this.aiProvider = VercelAIFactory.createProvider(this.provider, config);
    }

    async initialize(): Promise<void> {
        await this.aiProvider.initialize();
    }

    override getProviderWithModel(): string {
        return `${this.provider}:${this.aiProvider.getModel()}`;
    }

    async generate(systemInstructions: string | undefined, userInput: string, options?: LLMOptions): Promise<string> {
        return await this.generateInner(systemInstructions, userInput, options);
    }

    async generateFrom(req: LlmRequest, options?: {
        maxToolCallRepairs?: number,
    }): Promise<string> {
        try {
            // Trace the prompt
            AITracer.getInstance().tracePrompt(req.systemPromptText, req.promptText);

            // Use Vercel AI SDK generateText function with experimental_repairToolCall
            const result = await generateText({
                model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
                toolChoice: 'auto',
                ...this.aiProvider.adaptOptions({
                    tools: req.toolsList
                }),
                messages: req.combinedMessages,
                experimental_repairToolCall: async ({
                    toolCall,
                    tools,
                    error,
                    messages,
                    system,
                }) => {
                    AITracer.getInstance().traceError(error);

                    let reRunMessages: CoreMessage[] = [
                        ...messages,
                        {
                            role: 'assistant',
                            content: [
                                {
                                    type: 'tool-call',
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    args: typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args,
                                },
                            ],
                        },
                        {
                            role: 'tool' as const,
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    isError: true,
                                    result: JSON.stringify({
                                        message: "please re-ran with fix the following errors",
                                        error: this.handleToolError(error)
                                    })
                                },
                            ],
                        },
                    ];
                    const result = await generateText({
                        model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
                        system,
                        messages: reRunMessages,
                        tools,
                    });

                    const newToolCall = result.toolCalls.find(
                        newToolCall => newToolCall.toolName === toolCall.toolName,
                    );

                    return newToolCall != null
                        ? {
                            toolCallType: 'function' as const,
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            args: JSON.stringify(newToolCall.args),
                        }
                        : null;
                }
            });

            this.trackInputTokens(result.usage.promptTokens);
            this.trackOutputTokens(result.usage.completionTokens);

            // Trace the response
            AITracer.getInstance().traceResponse(result.text);

            // Extract the text from the result
            return result.text;
        } catch (e) {
            AITracer.getInstance().traceError(e);
            throw e;
        }
    }

    protected handleToolError(error: unknown): string {
        // Check for Zod validation errors first
        if (error instanceof ZodError) {
            return handleZodError(error);
        }

        // Create a more detailed error object for other types of errors
        const errorObj: Record<string, unknown> = {
            status: 'error',
        };

        if (error instanceof Error) {
            errorObj.message = `Failed to execute tool: ${error.message}`;
            // Include stack trace in development environments
            if (process.env.NODE_ENV === 'development' && error.stack) {
                errorObj.stack = error.stack;
            }
            // Include any additional properties from the error
            Object.entries(error).forEach(([key, value]) => {
                if (key !== 'message' && key !== 'stack') {
                    errorObj[key] = value;
                }
            });
        } else if (error && typeof error === 'object') {
            errorObj.message = 'Failed to execute tool';
            errorObj.error = error;
        } else {
            errorObj.message = `Failed to execute tool: ${String(error)}`;
        }

        return JSON.stringify(errorObj, null, 2);
    }

    private async generateInner(systemInstructions: string | undefined, userInput: string,
        options: LLMOptions | undefined
    ) {
        const req = new LlmRequest()
            .withPrompt(userInput);
        if (systemInstructions) {
            req.withSystemPrompt(systemInstructions);
        }

        if (options?.tools) {
            for (const tool of options.tools) {
                req.withTool(tool);
            }
        }

        // Pass relevant tool repair options to generateFrom
        return await this.generateFrom(req, {
            maxToolCallRepairs: options?.maxToolCallRepairs
        });
    }

    async generateStream(
        systemInstructions: string | undefined,
        userInput: string,
        onChunk: ChunkCallback,
        options?: LLMOptions
    ): Promise<string> {
        let fullResponse = '';

        try {
            // Trace the prompt
            AITracer.getInstance().tracePrompt(systemInstructions, userInput);

            const stream = streamText({
                model: this.aiProvider.getModelProvider()(this.aiProvider.getModel()),
                system: systemInstructions,
                prompt: userInput,
                ...this.aiProvider.adaptOptions(options),
            });

            for await (const chunk of stream.textStream) {
                if (chunk) {
                    fullResponse += chunk;
                    onChunk(chunk);
                }
            }

            const usage = await stream.usage;
            this.trackInputTokens(usage.promptTokens);
            this.trackOutputTokens(usage.completionTokens);

            // Trace the complete response
            AITracer.getInstance().traceResponse(fullResponse);

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
            // Trace the prompt
            AITracer.getInstance().tracePrompt(undefined, prompt);


            // Use Vercel AI SDK generateObject function
            const result = await generateObject({
                model: this.aiProvider.getModelProvider()(this.aiProvider.getModel(), { structuredOutputs: true }),
                prompt,
                schema: schema,
                ...this.aiProvider.adaptOptions(options),
            });

            // Convert result to string for token counting
            const resultString = JSON.stringify(result, null, 2);

            this.trackInputTokens(result.usage.promptTokens);
            this.trackOutputTokens(result.usage.completionTokens);

            // Trace the response
            AITracer.getInstance().traceResponse(resultString);

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
}
