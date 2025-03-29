import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { LLMOptions } from './base.js';
import chalk from 'chalk';

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

  // Add chat history if provided
  if (options.chatHistory && options.chatHistory.length > 0) {
    for (const message of options.chatHistory) {
      if (message.role === 'user') {
        messages.push(new HumanMessage(message.content));
      } else if (message.role === 'assistant') {
        messages.push(new AIMessage(message.content));
      } else if (message.role === 'system') {
        messages.push(new SystemMessage(message.content));
      }
    }
  }

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
export function formatResponseContent(response: any): string {
  if (!response) {
    return '';
  }

  // Handle different response formats
  if (typeof response === 'string') {
    return response;
  }

  if (response.content) {
    return typeof response.content === 'string' 
      ? response.content 
      : JSON.stringify(response.content);
  }

  // Handle text property (some LLM responses use this)
  if ('text' in response && response.text) {
    return typeof response.text === 'string'
      ? response.text
      : JSON.stringify(response.text);
  }

  // Handle message property (some LLM responses use this)
  if ('message' in response && response.message) {
    if (typeof response.message === 'string') {
      return response.message;
    }

    if (response.message.content) {
      return typeof response.message.content === 'string' 
        ? response.message.content 
        : JSON.stringify(response.message.content);
    }
  }

  return '';
}

function truncate(result: string, truncateLimit: number) {
  return result.length > truncateLimit
      ? result.substring(0, truncateLimit) + '...'
      : result;
}

/**
 * Formats an error object into a readable string
 * @param error - The error to format
 * @returns The formatted error string
 */
function formatError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  try {
    // If it's a JSON string, parse it and format it
    if (typeof error === 'string' && (error.startsWith('{') || error.startsWith('['))) {
      const parsed = JSON.parse(error);
      return formatError(parsed);
    }

    // If it's an object with a message property, use that
    if (error && typeof error === 'object') {
      if (error.message) {
        return error.message;
      }

      // If it has an output property that's an object or string, format that
      if (error.output) {
        if (typeof error.output === 'string') {
          return error.output;
        }
        if (typeof error.output === 'object') {
          return JSON.stringify(error.output, null, 2);
        }
      }

      // If it's a simple object, stringify it
      if (Object.keys(error).length > 0) {
        return JSON.stringify(error, null, 2);
      }
    }

    // Fallback to string representation
    return String(error);
  } catch (e) {
    // If anything goes wrong during formatting, return the original error as a string
    return String(error);
  }
}

/**
 * Formats a tool call for CLI output
 * @param toolCall - The tool call to format
 * @param result - The result of the tool call (optional)
 * @param error - The error from the tool call (optional)
 * @returns The formatted tool call
 */
export function formatToolCall(toolCall: any, res?: any, error?: any): string {
  let truncateLimit = 1600;
  const toolName = chalk.bold.blue(toolCall.name);
  const args = JSON.stringify(toolCall.args || {}, null, 2);
  let output = `\n${chalk.cyan('┌─')} Tool Call: ${toolName}\n`;
  output += `${chalk.cyan('│')} Arguments: ${truncate(args, truncateLimit)}\n`;

  const result = res ? JSON.stringify(res, null, 2) : undefined;
  if (result) {
    const truncatedResult = truncate(result, truncateLimit);
    output += `${chalk.cyan('│')} ${chalk.green('✓')} Result: ${truncatedResult}\n`;
  }

  if (error) {
    const formattedError = formatError(error);
    output += `${chalk.cyan('│')} ${chalk.red('✗')} Error: ${formattedError}\n`;
  }

  output += `${chalk.cyan('└─')}\n`;

  return output;
}

/**
 * Formats a tool execution error for CLI output
 * @param toolName - The name of the tool
 * @param error - The error message
 * @returns The formatted error message
 */
export function formatToolError(toolName: string, error: string): string {
  return `${chalk.red('Error executing tool')} ${chalk.bold.blue(toolName)}: ${error}`;
}

/**
 * Formats a tool execution success for CLI output
 * @param toolName - The name of the tool
 * @param result - The result of the tool execution
 * @returns The formatted success message
 */
export function formatToolSuccess(toolName: string, result: string): string {
  const truncatedResult = result.length > 100 
    ? result.substring(0, 100) + '...' 
    : result;
  return `${chalk.green('Tool')} ${chalk.bold.blue(toolName)} ${chalk.green('executed successfully')}: ${truncatedResult}`;
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
  const toolCalls = response.tool_calls || [];

  // If no tool calls, return the response
  if (toolCalls.length === 0) {
    return response;
  }

  // Process tool calls
  console.log(chalk.yellow(`\n🔧 Processing ${toolCalls.length} tool call(s)...\n`));

  messages.push(response);

  // Process each tool call sequentially for better reporting
  for (const toolCall of toolCalls) {
    const toolName = toolCall.name;
    const tool = options.tools?.find(t => t.name === toolName);

    if (!tool) {
      console.log(formatToolCall(toolCall, undefined, `Tool "${toolName}" not found`));
      // Add a tool message with the error
      messages.push(new ToolMessage(`Error: Tool "${toolName}" not found`, toolName));
      continue;
    }

    try {
      // Execute the tool
      console.log(chalk.yellow(`Executing tool: ${toolName}...`));
      const result = await tool.invoke(toolCall);

      console.log(formatToolCall(toolCall, result));

      messages.push(result);
    } catch (error) {
      // Log the error - pass the error object directly to formatToolCall
      console.log(formatToolCall(toolCall, undefined, error));

      // Format the error message for the tool message
      const formattedError = formatError(error);
      messages.push(new ToolMessage(`Error: ${formattedError}`, toolName));
    }
  }

  // Call the model again with the tool results
  console.log(chalk.yellow(`\n🤖 Calling model again with tool results...\n`));
  return await runLLmToolsLoop(model, messages, options);
}
