import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for listing directories in the working directory
 */
export class ListDirectoriesTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'list_directories';

  /**
   * The description of the tool
   */
  description = 'List directories in the working directory with configurable depth. Limited to the working directory.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The directory to list directories from
     * @default "."
     */
    directory: z.string().optional().default('.')
      .describe('The directory to list directories from (relative to working directory)'),

    /**
     * The maximum depth to recurse into subdirectories
     * @default 1
     */
    depth: z.number().int().min(0).optional().default(1)
      .describe('The maximum depth to recurse into subdirectories (0 means only list directories in the specified directory)')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * Constructor
   * @param workingDir - The working directory
   */
  constructor(workingDir: string) {
    super();
    this.workingDir = path.resolve(workingDir);
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The list of directories
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { directory, depth } = this.parameters.parse(args);

      // Ensure the directory is in the working directory
      const listDir = ensurePathInWorkingDir(directory, this.workingDir);

      // Check if the directory exists
      try {
        const stats = await fs.stat(listDir);
        if (!stats.isDirectory()) {
          throw new Error(`${directory} is not a directory`);
        }
      } catch (error) {
        throw new Error(`Directory ${directory} does not exist`);
      }

      // List directories recursively
      const directories = await this.listDirectoriesRecursively(listDir, depth);

      // Format the results
      if (directories.length === 0) {
        return 'No directories found in the specified directory.';
      }

      return `Found ${directories.length} directories:\n${directories.join('\n')}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list directories: ${error.message}`);
      }
      throw new Error('Failed to list directories: Unknown error');
    }
  }

  /**
   * List directories recursively
   * @param dir - The directory to list directories from
   * @param maxDepth - The maximum depth to recurse
   * @param currentDepth - The current depth (used internally)
   * @returns The list of directories
   */
  private async listDirectoriesRecursively(
    dir: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<string[]> {
    // If we've reached the maximum depth, stop recursing
    if (currentDepth > maxDepth) {
      return [];
    }

    // Read the directory
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result: string[] = [];

    // Process each entry
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.workingDir, fullPath);
        
        // Skip .git directory
        if (relativePath.startsWith('.git') || relativePath.startsWith('./.git')) {
          continue;
        }

        // Add the directory to the result
        result.push(`${relativePath}/`);

        // Recurse into subdirectory if not at max depth
        if (currentDepth < maxDepth) {
          const subDirs = await this.listDirectoriesRecursively(
            fullPath,
            maxDepth,
            currentDepth + 1
          );
          result.push(...subDirs);
        }
      }
    }

    return result;
  }
}
