import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';
import { FileSystemHelper } from './file-system-helper.js';

/**
 * Tool for reading files from the file system
 * Restricts file access to working directory only
 */
export class ReadFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'read_files';

  /**
   * The description of the tool
   */
  description = 'Read files from the file system. The files must be in the working directory. Prefer reading multiple files at one call if intention is to read multiple files.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The path to the file to read
     */
    path: z.array(z.string()).describe('An array of file paths to read.'),

    /**
     * The encoding to use when reading the file
     * @default 'utf-8'
     */
    encoding: z.enum(['utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1']).optional().default('utf-8')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * The file system helper
   */
  private fileSystemHelper: FileSystemHelper;

  /**
   * The file system module
   */
  private fs: {
    access: typeof fsPromises.access;
    readFile: typeof fsPromises.readFile;
  };

  /**
   * FileSourceLlmPreparation class (for testing)
   * @private
   */
  private fileSourceLlmPreparationClass: typeof FileSourceLlmPreparation = FileSourceLlmPreparation;

  /**
   * Constructor
   * @param workingDir - The working directory
   * @param fs - The file system module (for testing)
   */
  constructor(workingDir: string, fs?: {
    access: typeof fsPromises.access;
    readFile: typeof fsPromises.readFile;
  }) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.fs = fs || fsPromises;
    this.fileSystemHelper = new FileSystemHelper(this.workingDir);
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The content of the file(s)
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { path: filePaths, encoding } = this.parameters.parse(args);
      
      // Create FileToRead objects for each path
      const filesToRead = await Promise.all(filePaths.map(async (filePath) => {
        try {
          // Use FileSystemHelper to resolve and validate the path
          const resolvedPath = this.fileSystemHelper.ensurePathInWorkingDir(filePath);
          
          // Check if the file exists
          try {
            await this.fs.access(resolvedPath);
          } catch (error) {
            throw new Error(`File ${filePath} does not exist`);
          }
          
          // Determine file syntax based on extension
          const extension = filePath.split('.').pop() || '';
          const syntax = this.getFileSyntax(extension);
          
          return {
            path: resolvedPath,
            syntax
          };
        } catch (error) {
          if (error instanceof Error) {
            throw error;
          }
          throw new Error(`Invalid file path: ${filePath}`);
        }
      }));
      
      // Use FileSourceLlmPreparation to format the files
      const filePreparation = new this.fileSourceLlmPreparationClass(filesToRead, this.workingDir);
      return await filePreparation.renderForLlm(true); // true to include line numbers
    } catch (error) {
      // Use the common error handling method from the base class
      return this.handleToolError(error);
    }
  }

  /**
   * Get the syntax highlighting language based on file extension
   * @param extension - The file extension
   * @returns The syntax highlighting language
   * @private
   */
  private getFileSyntax(extension: string): string {
    const extensionMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rb': 'ruby',
      'php': 'php',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'txt': 'text',
      'sh': 'bash',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'swift': 'swift',
      'kt': 'kotlin',
      'rs': 'rust'
    };

    return extensionMap[extension.toLowerCase()] || 'text';
  }
}
