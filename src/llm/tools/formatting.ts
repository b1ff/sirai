import chalk from 'chalk';

/**
 * Truncates a string if it's longer than the specified limit
 * @param result - The string to truncate
 * @param truncateLimit - The maximum length
 * @returns The truncated string
 */
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
        return error.constructor.name + ':' + error.message;
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
