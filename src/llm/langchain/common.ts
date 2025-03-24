import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicTool } from '@langchain/core/tools';
import { LLMOptions } from './base.js';

/**
 * Prepares messages for the LLM
 * @param prompt - The prompt to send to the LLM
 * @param options - Additional options
 * @returns The prepared messages
 */
export function prepareMessages(prompt: string, options: LLMOptions = {}): any[] {
  const messages = [];

  // Add system message if provided
  if (options.systemPrompt) {
    messages.push(new SystemMessage(options.systemPrompt));
  }

  // Add user message
  messages.push(new HumanMessage(prompt));

  return messages;
}

/**
 * Configures model options
 * @param model - The LLM model
 * @param options - Additional options
 */
export function configureModelOptions(model: BaseChatModel, options: LLMOptions = {}): void {
  // Configure temperature if provided
  if (options.temperature !== undefined) {
    (model as any).temperature = options.temperature;
  }

  // Configure maxTokens if provided and supported by the model
  if (options.maxTokens !== undefined && 'maxTokens' in model) {
    (model as any).maxTokens = options.maxTokens;
  }
}

/**
 * Formats the response content
 * @param response - The response from the LLM
 * @returns The formatted content
 */
export function formatResponseContent(response: { content: string | object }): string {
  // Convert MessageContent to string if needed
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

/**
 * Run the LLM tools loop
 * @param model - The LLM model with tools
 * @param messages - The messages to send to the LLM
 * @param options - Additional options
 * @returns The final response
 */
export async function runLLmToolsLoop(model: BaseChatModel, messages: any[], options: LLMOptions): Promise<any> {
  const response = await model.invoke(messages);
  if (!response.tool_calls || response.tool_calls.length === 0) {
    return response;
  }

  messages.push(response);
  // Process tool calls in parallel
  const toolCallPromises = response.tool_calls.map(async (toolCall: any) => {
    let tool: DynamicTool | undefined = options.tools?.find(t => t.name === toolCall.name) as DynamicTool | undefined;
    if (!tool) {
      throw new Error(`Tool ${toolCall.name} not found in options`);
    }

    return await tool.invoke(toolCall);
  });

  // Wait for all tool calls to complete
  const toolResults = await Promise.all(toolCallPromises);

  // Add all tool results to messages
  messages.push(...toolResults);

  // Continue the conversation with the tool results
  return await runLLmToolsLoop(model, messages, options);
}
