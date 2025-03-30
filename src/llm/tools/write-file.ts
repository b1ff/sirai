import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

const execAsync = promisify(exec);

/**
 * Tool for writing files to the file system
 * Restricts write operations to working directory only
 */
export class WriteFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'write_file';

  /**
   * The description of the tool
   */
  description = 'Write content to a file in the file system. The file must be in the working directory. Overrides are not allowed so it must be used only for new files.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The path to the file to write
     */
    path: z.string().describe('The path to the file to write'),

    /**
     * The content to write to the file
     */
    content: z.string().describe('The content to write to the file'),

    /**
     * Whether to overwrite the file if it exists
     * @default true
     */
    overwrite: z.boolean().optional().default(true)
      .describe('Whether to overwrite the file if it exists'),

    /**
     * The encoding to use when writing the file
     * @default 'utf-8'
     */
    encoding: z.enum(['utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1']).optional().default('utf-8')
      .describe('The encoding to use when writing the file')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * The function to prompt for user approval
   */
  private promptForApproval: (filePath: string, content: string) => Promise<boolean>;

  /**
   * Constructor
   * @param workingDir - The working directory
   * @param promptForApproval - Function to prompt for user approval
   */
  constructor(
    workingDir: string,
    promptForApproval: (filePath: string, content: string) => Promise<boolean>
  ) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.promptForApproval = promptForApproval;
  }

  /**
   * Check if a directory is a git repository
   * @param dir - The directory to check
   * @returns True if the directory is a git repository
   */
  protected async isGitRepository(dir: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a git repository has uncommitted changes
   * @param dir - The directory to check
   * @returns True if the repository has uncommitted changes
   */
  protected async hasUncommittedChanges(dir: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: dir });
      return stdout.trim().length > 0;
    } catch (error) {
      return true; // Assume there are uncommitted changes if the command fails
    }
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns A message indicating the result of the operation
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { path: filePath, content, overwrite, encoding } = this.parameters.parse(args);

      // Ensure the file is in the working directory
      const resolvedPath = ensurePathInWorkingDir(filePath, this.workingDir);

      // Check if the file exists
      let fileExists = false;
      try {
        await fs.access(resolvedPath);
        fileExists = true;
      } catch (error) {
        // File doesn't exist, which is fine
      }

      // Check if we need to prompt for approval
      let needsApproval = true;

      // Check if this is a git repository
      const isGitRepo = await this.isGitRepository(this.workingDir);

      if (isGitRepo) {
        // Check if there are uncommitted changes
        const hasChanges = await this.hasUncommittedChanges(this.workingDir);

        // Skip permission prompt if repository has no uncommitted changes
        if (!hasChanges) {
          needsApproval = false;
        }
      }

      // If the file exists and we're not overwriting, throw an error
      if (fileExists && !overwrite) {
        throw new Error(`File ${filePath} already exists and overwrite is set to false`);
      }

      // If we need approval, prompt for it
      if (needsApproval) {
        const approved = await this.promptForApproval(filePath, content);
        if (!approved) {
          return `File write operation to ${filePath} was not approved by the user.`;
        }
      }

      // Create the directory if it doesn't exist
      const directory = path.dirname(resolvedPath);
      await fs.mkdir(directory, { recursive: true });

      // Write the file
      await fs.writeFile(resolvedPath, content, { encoding: encoding as BufferEncoding });

      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (error) {
      // Use the common error handling method from the base class
      return this.handleToolError(error);
    }
  }
}
