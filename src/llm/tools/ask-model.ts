import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';
import { FileSystemHelper } from './file-system-helper.js';
import { BaseLLM } from '../base.js';
import { AppConfig, LLMFactory } from '../factory.js';
import { ReadFileTool } from './read-file.js';

/**
 * Tool for asking a local LLM model about files
 * This tool allows delegating tasks from a larger model to smaller, local models to reduce costs
 */
export class AskModelTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'ask_model';

  /**
   * The description of the tool
   */
  description = 'Ask a local or cheaper LLM model about files. Provide an array of file paths and a query with questions or tasks. The model will read the files if needed and respond to the query.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The paths to the files to analyze
     */
    paths: z.array(z.string()).describe('An array of file paths to analyze.'),

    /**
     * The query to ask the model
     */
    query: z.string().describe('The query or task for the model to respond to.')
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
   * The application configuration
   */
  private appConfig: AppConfig;

  /**
   * The LLM model to use
   */
  private llm: BaseLLM | null = null;

  /**
   * FileSourceLlmPreparation class (for testing)
   * @private
   */
  private fileSourceLlmPreparationClass: typeof FileSourceLlmPreparation = FileSourceLlmPreparation;

  /**
   * Constructor
   * @param workingDir - The working directory
   * @param appConfig - The application configuration
   */
  constructor(workingDir: string, appConfig: AppConfig) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.appConfig = appConfig;
    this.fileSystemHelper = new FileSystemHelper(this.workingDir);
  }

  /**
   * Initialize the LLM model
   * @private
   */
  private async initializeLLM(): Promise<BaseLLM> {
    if (this.llm) {
      return this.llm;
    }

    // Check if ask_model is enabled in the configuration
    if (!this.appConfig.askModel?.enabled) {
      throw new Error('ask_model tool is disabled in configuration');
    }

    // Get the provider name from the configuration
    const providerName = this.appConfig.askModel.provider;
    if (!providerName) {
      throw new Error('No provider specified for ask_model tool');
    }

    // Create the LLM model
    try {
      this.llm = LLMFactory.createLLMByProvider(this.appConfig, providerName, this.appConfig.askModel.model);
      return this.llm;
    } catch (error) {
      throw new Error(`Failed to initialize LLM for ask_model tool: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The response from the model
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { paths, query } = this.parameters.parse(args);

      // Initialize the LLM model
      const llm = await this.initializeLLM();

      // Create FileToRead objects for each path
      const filesToRead = await Promise.all(paths.map(async (filePath) => {
        try {
          // Use FileSystemHelper to resolve and validate the path
          const resolvedPath = this.fileSystemHelper.ensurePathInWorkingDir(filePath);

          // Check if the file exists
          try {
            await fsPromises.access(resolvedPath);
          } catch (error) {
            throw new Error(`File ${filePath} does not exist`);
          }

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
      const fileContent = await filePreparation.renderForLlm(false); // false to exclude line numbers

      // Construct the prompt for the model
      const prompt = `
You are a helpful assistant that analyzes files and responds to queries about them.

FILES:
${fileContent}

QUERY:
${query}

Please provide a concise and accurate response to the query based on the file content.
If query involves digging further, read needed files on your own to get the precise answer.
`;

      // Generate response using the LLM
      const response = await llm.generate(prompt, query, {
        tools: [new ReadFileTool(this.workingDir)]
      });
      return response;
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
