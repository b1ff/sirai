import * as path from 'path';
import { FileSystemHelper } from '../llm/tools/file-system-helper.js';

/**
 * A utility class for processing file references in user messages
 */
export class FileReferenceProcessor {
  private fileSystemHelper: FileSystemHelper;

  /**
   * Constructor
   * @param workingDir - The working directory
   */
  constructor(workingDir: string) {
    this.fileSystemHelper = new FileSystemHelper(workingDir);
  }

  /**
   * Extracts file references from a message
   * @param message - The message to extract file references from
   * @returns An array of file references
   */
  public extractFileReferences(message: string): string[] {
    // Match @filename patterns, handling spaces in file paths
    // This regex matches @filename or @"filename with spaces" or @'filename with spaces'
    const regex = /@(?:([^\s"']+)|"([^"]+)"|'([^']+)')/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(message)) !== null) {
      // The file path will be in one of the capturing groups
      const filePath = match[1] || match[2] || match[3];
      if (filePath) {
        matches.push(filePath);
      }
    }

    return matches;
  }

  /**
   * Reads the content of a file
   * @param filePath - The path to the file
   * @returns The content of the file
   */
  public async readFileContent(filePath: string): Promise<string> {
    try {
      return await this.fileSystemHelper.readFile(filePath);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error reading file ${filePath}: ${error.message}`);
      }
      throw new Error(`Error reading file ${filePath}: Unknown error`);
    }
  }

  /**
   * Formats file content for inclusion in the prompt
   * @param filePath - The path to the file
   * @param content - The content of the file
   * @returns The formatted file content
   */
  private formatFileContent(filePath: string, content: string): string {
    const extension = path.extname(filePath).slice(1); // Remove the leading dot
    return `<file path="${filePath}" ${extension ? `syntax="${extension}"` : ''}>
${content}
</file>`;
  }

  /**
   * Processes a message by replacing file references with file content
   * @param message - The message to process
   * @returns The processed message
   */
  public async processMessage(message: string): Promise<string> {
    const fileReferences = this.extractFileReferences(message);
    let processedMessage = message;

    for (const filePath of fileReferences) {
      try {
        const content = await this.readFileContent(filePath);
        const formattedContent = this.formatFileContent(filePath, content);
        
        // Replace the file reference with the file content
        // Handle different formats of file references (@file, @"file", @'file')
        const escapedFilePath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`@(?:${escapedFilePath}|"${escapedFilePath}"|'${escapedFilePath}')`, 'g');
        processedMessage = processedMessage.replace(regex, formattedContent);
      } catch (error) {
        // If there's an error reading the file, leave the reference as is
        console.warn(`Failed to process file reference @${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return processedMessage;
  }
}