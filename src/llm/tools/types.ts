import { z } from 'zod';

/**
 * Interface for tool
 */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType;
  required?: boolean;
}

/**
 * Interface for tool call
 */
export interface ToolCall {
  name: string;
  arguments: object;
  id: string;
}
