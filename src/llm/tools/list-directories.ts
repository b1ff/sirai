import { z } from 'zod';
import * as path from 'path';
import { FileSystemHelper } from './file-system-helper.js';
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
  description = 'List directories in the working directory with configurable depth. Respects .gitignore patterns. Limited to the working directory.';

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
   * File system helper instance
   */
  private fileSystemHelper: FileSystemHelper;

  /**
   * Constructor
   * @param workingDir - The working directory
   */
  constructor(workingDir: string) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.fileSystemHelper = new FileSystemHelper(this.workingDir);
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

      // Check if the directory exists and is a directory
      if (!await this.fileSystemHelper.isDirectory(listDir)) {
        throw new Error(`${directory} is not a directory or does not exist`);
      }

      // List directories recursively using FileSystemHelper
      const directories = await this.fileSystemHelper.listDirectoriesRecursively(listDir, {
        maxDepth: depth,
      });

      // Format the results
      if (directories.length === 0) {
        return 'No directories found in the specified directory.';
      }

      return `Found ${directories.length} directories:\n${directories.join('\n')}`;
    } catch (error) {
      // Use the common error handling method from the base class
      return this.handleToolError(error);
    }
  }
}
