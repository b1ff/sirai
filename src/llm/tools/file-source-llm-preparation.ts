import fs from 'fs/promises';
import path from 'path';
import { FileToRead } from '../../task-planning/schemas.js';
import { estimateTokenCount } from '../../utils/token-counter.js';

/**
 * Configuration for token limits
 */
export interface TokenLimitConfig {
  /** Maximum number of tokens allowed for all files combined */
  maxTokens: number;
  /** Reserve tokens for other content (prompt, etc.) */
  reserveTokens?: number;
  /** Whether to show warnings when content is truncated */
  showTruncationWarnings?: boolean;
}

/**
 * Class for preparing file sources for LLM consumption
 */
export class FileSourceLlmPreparation {
  private readonly files: FileToRead[];
  private readonly referencedFiles: FileToRead[];
  private readonly projectDir: string;
  private tokenLimitConfig?: TokenLimitConfig;

  /**
   * Creates a new FileSourceLlmPreparation instance
   * @param files - Array of files to prepare
   * @param projectDir - The project directory
   * @param tokenLimitConfig - Configuration for token limits
   * @param referencedFiles - Array of referenced files to include
   */
  constructor(
    files: FileToRead[], 
    projectDir: string, 
    tokenLimitConfig?: TokenLimitConfig,
    referencedFiles: FileToRead[] = []
  ) {
    this.files = files;
    this.referencedFiles = referencedFiles;
    this.projectDir = path.resolve(projectDir);
    this.tokenLimitConfig = tokenLimitConfig;
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
    return lines.map((line, index) => `${index + 1}:${line}`).join('\n');
  }

  private truncateContent(content: string, maxTokens: number, filePath: string): { content: string; truncated: boolean } {
    const tokenCount = estimateTokenCount(content);
    
    if (tokenCount <= maxTokens) {
      return { content, truncated: false };
    }
    
    // Simple truncation strategy: keep the beginning of the file
    // A more sophisticated approach could be implemented based on specific needs
    const truncationRatio = maxTokens / tokenCount;
    const approximateCharCount = Math.floor(content.length * truncationRatio);
    const truncatedContent = content.substring(0, approximateCharCount);
    
    // Show warning if enabled
    if (this.tokenLimitConfig?.showTruncationWarnings) {
      console.warn(`File ${filePath} truncated from ${tokenCount} to ${maxTokens} tokens`);
    }
    
    return { 
      content: truncatedContent + '\n[Content truncated due to token limit]', 
      truncated: true 
    };
  }

  /**
   * Renders files for LLM consumption
   * @param withLineNumbers - Whether to include line numbers
   * @param includeReferencedFiles - Whether to include referenced files (default: true)
   * @returns The rendered file content
   */
  public async renderForLlm(withLineNumbers: boolean = false, includeReferencedFiles: boolean = true): Promise<string> {
    let fileContents = '';
    let totalTokens = 0;
    const maxTokens = this.tokenLimitConfig?.maxTokens;
    const reserveTokens = this.tokenLimitConfig?.reserveTokens || 0;
    
    // Combine explicitly included files and referenced files if needed
    const allFiles = includeReferencedFiles 
      ? [...this.files, ...this.referencedFiles]
      : this.files;
      
    if (allFiles && allFiles.length > 0) {
      // First pass: read all files and calculate token counts
      const fileData = await Promise.all(
        allFiles.map(async (file) => {
          try {
            const content = await this.readFileContent(file.path);
            const processedContent = withLineNumbers ? this.addLineNumbers(content) : content;
            const fileWrapper = this.wrapFile(file, processedContent) + `\n`;
            const tokenCount = estimateTokenCount(fileWrapper);
            
            return {
              file,
              content: processedContent,
              tokenCount,
              fileWrapper
            };
          } catch (error) {
            console.error(`Error processing file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
          }
        })
      );
      
      // Filter out null values from errors
      const validFileData = fileData.filter(data => data !== null);
      
      // If token limit is specified, apply it
      if (maxTokens) {
        let remainingTokens = maxTokens - reserveTokens;
        
        // Second pass: add files respecting token limits
        for (const data of validFileData) {
          if (!data) continue;
          
          if (data.tokenCount <= remainingTokens) {
            // File fits within remaining token budget
            fileContents += data.fileWrapper;
            remainingTokens -= data.tokenCount;
            totalTokens += data.tokenCount;
          } else if (remainingTokens > 0) {
            // File needs truncation
            let currFile = data.file;
            const wrapper = (content: string) =>
              `${this.wrapFile(currFile, content)}\n`;
            
            // Account for wrapper tokens
            const wrapperTokens = estimateTokenCount(wrapper(''));
            const contentTokens = remainingTokens - wrapperTokens;
            
            if (contentTokens > 0) {
              const { content: truncatedContent } = this.truncateContent(
                data.content, 
                contentTokens,
                currFile.path
              );
              
              fileContents += wrapper(truncatedContent);
              totalTokens += estimateTokenCount(wrapper(truncatedContent));
              remainingTokens = 0;
            }
          }
          
          // Stop if we've used all available tokens
          if (remainingTokens <= 0) {
            break;
          }
        }
        
        // Add warning if files were omitted due to token limits
        if (validFileData.some((data, index) => data && index >= validFileData.findIndex(d => !d || estimateTokenCount(d.fileWrapper) > remainingTokens))) {
          fileContents += '\n[Some files omitted due to token limit]\n';
        }
      } else {
        // No token limit, include all files
        for (const data of validFileData) {
          if (data) {
            fileContents += data.fileWrapper;
            totalTokens += data.tokenCount;
          }
        }
      }
    }

    return fileContents;
  }

  /**
   * Adds a referenced file to be included in the LLM preparation
   * @param file - The file to add as a reference
   */
  public addReferencedFile(file: FileToRead): void {
    // Check if the file is already in the referenced files list
    if (!this.referencedFiles.some(existingFile => existingFile.path === file.path)) {
      this.referencedFiles.push(file);
    }
  }

  /**
   * Adds multiple referenced files to be included in the LLM preparation
   * @param files - The files to add as references
   */
  public addReferencedFiles(files: FileToRead[]): void {
    for (const file of files) {
      this.addReferencedFile(file);
    }
  }

  /**
   * Gets all referenced files
   * @returns Array of referenced files
   */
  public getReferencedFiles(): FileToRead[] {
    return [...this.referencedFiles];
  }

  /**
   * Gets all files (both explicitly included and referenced)
   * @returns Combined array of all files
   */
  public getAllFiles(): FileToRead[] {
    return [...this.files, ...this.referencedFiles];
  }

  private wrapFile(currFile: FileToRead, content: string) {
    const syntax = currFile.syntax ? ` syntax="${currFile.syntax}"` : '';
    return `<file path="${currFile.path}"${syntax}>\n${content}\n</file>`;
  }
}
