import { z } from 'zod';
import { tool } from "@langchain/core/tools";
import { Tool } from '../langchain/base.js';

import { resolve } from 'node:path';

/**
 * Base class for all tools
 */
export abstract class BaseTool implements Tool {
  /**
   * The name of the tool
   */
  abstract name: string;

  /**
   * The description of the tool
   */
  abstract description: string;

  /**
   * The parameters of the tool
   */
  abstract parameters: z.ZodType;

  /**
   * Whether the tool is required
   */
  required?: boolean;

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The result of executing the tool
   */
  abstract execute(args: Record<string, unknown>): Promise<string>;

  toLangChainTool() {
    return tool(async (args) => {
      try {
        return await this.execute(args);
      } catch (error) {
        if (error instanceof Error) {
          return JSON.stringify({
            status: 'error',
            message: `Failed to execute tool: ${error.message}`,
          });
        }

        return JSON.stringify({
          status: 'error',
          message: 'Failed to execute tool: Unknown error',
        });
      }
    }, {
      name: this.name,
      description: this.description,
      schema: this.parameters as any,
    });
  }
}

/**
 * Utility function to ensure a path is within the working directory
 * @param path - The path to check
 * @param workingDir - The working directory
 * @returns The sanitized path
 * @throws Error if the path is outside the working directory
 */
export function ensurePathInWorkingDir(path: string, workingDir: string): string {
  const resolvedPath = resolve(workingDir, path);
  if (!resolvedPath.startsWith(workingDir)) {
    throw new Error(`Path ${path} is outside the working directory`);
  }
  return resolvedPath;
}

/**
 * Configuration for trusted commands
 */
export interface TrustedCommandsConfig {
  /**
   * List of trusted commands
   */
  trustedCommands: string[];
}
