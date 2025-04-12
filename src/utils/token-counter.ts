/**
 * A utility function to estimate the number of tokens in a string.
 * 
 * This implementation uses a simple approximation based on word count,
 * which is a common heuristic for estimating tokens in natural language processing.
 * For more accurate token counting, specialized tokenizers like those from
 * specific language models would be needed.
 */

/**
 * Estimates the number of tokens in the provided text.
 * 
 * @param text - The input text to estimate token count for
 * @returns The estimated number of tokens
 * @throws Error if the input is not a string
 */
export function estimateTokenCount(text: string): number {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string');
  }

  if (text.trim().length === 0) {
    return 0;
  }

  // Simple approximation: count words and apply a multiplier
  // Most tokenizers split on more than just spaces, including punctuation
  // This is a reasonable approximation for English text
  const words = text.trim().split(/\s+/).length;
  
  // Apply a small multiplier to account for tokenization of punctuation and special characters
  // This multiplier can be adjusted based on empirical testing
  const tokenMultiplier = 1.3;
  
  return Math.ceil(words * tokenMultiplier);
}

/**
 * Alternative token estimation based on character count.
 * Some models like GPT have a rough approximation of 4 characters per token.
 * 
 * @param text - The input text to estimate token count for
 * @returns The estimated number of tokens
 * @throws Error if the input is not a string
 */
export function estimateTokenCountByChars(text: string): number {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string');
  }

  if (text.trim().length === 0) {
    return 0;
  }
  
  // Common approximation: ~4 characters per token for English text
  const charsPerToken = 4;
  
  return Math.ceil(text.length / charsPerToken);
}