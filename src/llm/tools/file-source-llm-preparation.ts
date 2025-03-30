import fs from 'fs/promises';
import path from 'path';
import { FileToRead } from '../../task-planning/schemas.js';

/**
 * Class for preparing file sources for LLM consumption
 */
export class FileSourceLlmPreparation {
  private files: FileToRead[];
  private projectDir: string;

  /**
   * Creates a new FileSourceLlmPreparation instance
   * @param files - Array of files to prepare
   * @param projectDir - The project directory
   */
  constructor(files: FileToRead[], projectDir: string) {
    this.files = files;
    this.projectDir = path.resolve(projectDir);
  }

  /**
   * Reads the content of a file
   * @param filePath - The path to the file
   * @returns The content of the file
   * @private
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectDir, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error reading file: ${filePath}`;
    }
  }

  /**
   * Adds line numbers to file content
   * @param content - The file content
   * @returns The file content with line numbers
   * @private
   */
  private addLineNumbers(content: string): string {
    const lines = content.split('\n');
    return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
  }

  /**
   * Renders files for LLM consumption
   * @param withLineNumbers - Whether to include line numbers
   * @returns The rendered file content
   */
  public async renderForLlm(withLineNumbers: boolean = false): Promise<string> {
    let fileContents = '';
    
    if (this.files && this.files.length > 0) {
      for (const file of this.files) {
        try {
          const content = await this.readFileContent(file.path);
          const processedContent = withLineNumbers ? this.addLineNumbers(content) : content;
          fileContents += `<file path="${file.path}" syntax="${file.syntax}">\n${processedContent}\n</file>\n`;
        } catch (error) {
          console.error(`Error processing file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    return fileContents;
  }
}
