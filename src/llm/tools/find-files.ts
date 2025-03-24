import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as glob from 'glob';
import { promisify } from 'util';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

const globAsync = promisify(glob.glob);

/**
 * Tool for finding files in the file system
 * Creates grep-like functionality limited to working directory
 */
export class FindFilesTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'find_files';

  /**
   * The description of the tool
   */
  description = 'Find files in the file system matching a pattern. Limited to the working directory.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The pattern to match
     */
    pattern: z.string().describe('The pattern to match (glob or regex)'),

    /**
     * Whether to use regex for matching
     * @default false
     */
    useRegex: z.boolean().optional().default(false)
      .describe('Whether to use regex for matching'),

    /**
     * Whether to search recursively
     * @default true
     */
    recursive: z.boolean().optional().default(true)
      .describe('Whether to search recursively'),

    /**
     * The file extension to filter by
     */
    extension: z.string().optional()
      .describe('The file extension to filter by (e.g., "js", "ts", "txt")'),

    /**
     * The directory to search in (relative to working directory)
     * @default "."
     */
    directory: z.string().optional().default('.')
      .describe('The directory to search in (relative to working directory)')
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
   * @returns The list of matching files
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { pattern, useRegex, recursive, extension, directory } = this.parameters.parse(args);

      // Ensure the directory is in the working directory
      const searchDir = ensurePathInWorkingDir(directory, this.workingDir);

      // Check if the directory exists
      try {
        const stats = await fs.stat(searchDir);
        if (!stats.isDirectory()) {
          throw new Error(`${directory} is not a directory`);
        }
      } catch (error) {
        throw new Error(`Directory ${directory} does not exist`);
      }

      // Build the glob pattern
      let globPattern = pattern;

      // If using regex, we need to search all files and filter later
      if (useRegex) {
        globPattern = '**/*';
      }

      // If extension is provided, filter by extension
      if (extension) {
        if (useRegex) {
          globPattern = `**/*.${extension}`;
        } else if (!pattern.includes('.')) {
          // Only append extension if the pattern doesn't already include a dot
          globPattern = `${pattern}*.${extension}`;
        }
      }

      // If not recursive, limit to the current directory
      if (!recursive) {
        if (useRegex) {
          globPattern = '*';
          if (extension) {
            globPattern = `*.${extension}`;
          }
        } else {
          // Remove any directory traversal from the pattern
          globPattern = globPattern.replace(/\*\*\//g, '');
        }
      }

      // Find files using glob
      const options = {
        cwd: searchDir,
        dot: false, // Ignore dot files
        nodir: true, // Only return files, not directories
      };

      let files: string[] = (await globAsync(globPattern, options)) as string[];

      // If using regex, filter the results
      if (useRegex) {
        const regex = new RegExp(pattern);
        files = files.filter((file: string) => regex.test(file));
      }

      // Format the results
      if (files.length === 0) {
        return 'No files found matching the pattern.';
      }

      return `Found ${files.length} files:\n${files.join('\n')}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to find files: ${error.message}`);
      }
      throw new Error('Failed to find files: Unknown error');
    }
  }
}
