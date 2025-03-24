import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for reading files from the file system
 * Restricts file access to working directory only
 */
export class ReadFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'read_file';

  /**
   * The description of the tool
   */
  description = 'Read a file from the file system. The file must be in the working directory.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The path to the file to read
     */
    path: z.string().describe('The path to the file to read'),
    
    /**
     * The encoding to use when reading the file
     * @default 'utf-8'
     */
    encoding: z.enum(['utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1']).optional().default('utf-8')
      .describe('The encoding to use when reading the file')
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
   * @returns The content of the file
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { path: filePath, encoding } = this.parameters.parse(args);
      
      // Ensure the file is in the working directory
      const resolvedPath = ensurePathInWorkingDir(filePath, this.workingDir);
      
      // Check if the file exists
      try {
        await fs.access(resolvedPath);
      } catch (error) {
        throw new Error(`File ${filePath} does not exist`);
      }
      
      // Read the file
      const content = await fs.readFile(resolvedPath, { encoding: encoding as BufferEncoding });
      
      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
      throw new Error('Failed to read file: Unknown error');
    }
  }
}
