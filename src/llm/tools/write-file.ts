import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './base.js';
import { FileSystemHelper } from './file-system-helper.js';

const execAsync = promisify(exec);

/**
 * Tool for writing files to the file system
 * Restricts write operations to working directory only
 */
export class WriteFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'write_new_file';

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
    overwrite: z.boolean().nullable()
        .describe('Whether to overwrite the file if it exists'),

    /**
     * The encoding to use when writing the file
     * @default 'utf-8'
     */
    encoding: z.enum(['utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1'])
        .nullable()
        .describe('The encoding to use when writing the file')
  });

  /**
   * The working directory
   */
  private fileSystemHelper: FileSystemHelper;

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
    this.fileSystemHelper = new FileSystemHelper(workingDir);
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
      const { path: filePath, content, overwrite, encoding } = this.parameters.parse(args);
      const resolvedPath = this.fileSystemHelper.ensurePathInWorkingDir(filePath);

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
      const isGitRepo = await this.isGitRepository(this.fileSystemHelper.getWorkingDir());

      if (isGitRepo) {
        // Check if there are uncommitted changes
        const hasChanges = await this.hasUncommittedChanges(this.fileSystemHelper.getWorkingDir());

        // Skip permission prompt if repository has no uncommitted changes
        if (!hasChanges) {
          needsApproval = false;
        }
      }

      // If the file exists and we're not overwriting, return the file content
      if (fileExists && !overwrite) {
        const existingContent = await fs.readFile(resolvedPath, { encoding: encoding as BufferEncoding });
        return `Write operation not successful. File ${filePath} already exists and overwrite is set to false. Current file content:\n\n${existingContent}`;
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
