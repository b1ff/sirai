import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { BaseTool, ensurePathInWorkingDir } from './base.js';
import { FileSystemHelper } from './file-system-helper.js';

/**
 * Tool for listing files in a directory recursively
 */
export class ListFilesTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'list_files';

  /**
   * The description of the tool
   */
  description = 'List files in a directory recursively with configurable depth. Limited to the working directory. Excludes files from .gitignore if it exists.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The directory to list files from
     * @default "."
     */
    directory: z.string().optional().default('.')
      .describe('The directory to list files from (relative to working directory)'),

    /**
     * The maximum depth to recurse into subdirectories
     * @default 4
     */
    depth: z.number().int().min(0).optional().default(4)
      .describe('The maximum depth to recurse into subdirectories (0 means only list files in the specified directory)'),

    /**
     * Whether to include directories in the output
     * @default false
     */
    includeDirs: z.boolean().optional().default(false)
      .describe('Whether to include directories in the output'),

    /**
     * The file extension to filter by
     */
    extension: z.string().optional()
      .describe('The file extension to filter by (e.g., "js", "ts", "txt")')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * FileSystemHelper instance
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
   * @returns The list of files
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { directory, depth, includeDirs, extension } = this.parameters.parse(args);

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

      // List files recursively using FileSystemHelper
      const options = {
        maxDepth: depth,
        includeDirs,
        extension
      };
      
      const files = await this.fileSystemHelper.listFilesRecursively(listDir, options);

      // Format the results
      if (files.length === 0) {
        return 'No files found in the directory.';
      }

      return `Found ${files.length} files:\n${files.join('\n')}`;
    } catch (error) {
      // Use the common error handling method from the base class
      return this.handleToolError(error);
    }
  }
}
