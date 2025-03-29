import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for editing files with line validation
 */
export class EditFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'edit_file';

  /**
   * The description of the tool
   */
  description = 'Edit a file with line validation. Takes starting line (number and content) and ending line (number and content) for validation. If validation fails, returns instructions to re-call with actual content. Limited to the working directory.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The file to edit
     */
    file: z.string()
      .describe('The file to edit (relative to working directory)'),

    /**
     * The starting line number
     */
    startLineNumber: z.number().int().min(1)
      .describe('The starting line number (1-based)'),

    /**
     * The starting line content
     */
    startLineCurrentContent: z.string()
      .describe('The exact current content of the starting line, used for validation that file has not changed before edit'),

    /**
     * The ending line number
     */
    endLineNumber: z.number().int().min(1)
      .describe('The ending line number (1-based)'),

    /**
     * The ending line content
     */
    endLineCurrentContent: z.string()
      .describe('The exact current content of the ending line, used for validation that file has not changed before edit'),

    /**
     * The new content to replace the lines between start and end (inclusive)
     */
    newContentBetweenLines: z.string()
      .describe('The new content to replace the lines between start and end (inclusive)')
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
   * @returns The result of the operation
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { 
        file, 
        startLineNumber, 
        startLineCurrentContent,
        endLineNumber, 
        endLineCurrentContent,
        newContentBetweenLines
      } = this.parameters.parse(args);

      // Ensure the file is in the working directory
      const filePath = ensurePathInWorkingDir(file, this.workingDir);

      // Check if the file exists
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          throw new Error(`${file} is not a file`);
        }
      } catch (error) {
        throw new Error(`File ${file} does not exist`);
      }

      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Validate line numbers
      if (startLineNumber > lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `Start line number ${startLineNumber} is out of range (file has ${lines.length} lines)`,
          actualLines: lines.length
        });
      }

      if (endLineNumber > lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `End line number ${endLineNumber} is out of range (file has ${lines.length} lines)`,
          actualLines: lines.length
        });
      }

      if (startLineNumber > endLineNumber) {
        return JSON.stringify({
          status: 'error',
          message: `Start line number ${startLineNumber} is greater than end line number ${endLineNumber}`
        });
      }

      // Validate line content
      const actualStartLine = lines[startLineNumber - 1]; // Convert to 0-based index
      const actualEndLine = lines[endLineNumber - 1]; // Convert to 0-based index

      if (actualStartLine !== startLineCurrentContent) {
        return JSON.stringify({
          status: 'error',
          message: 'Start line content does not match',
          expectedContent: startLineCurrentContent,
          actualContent: actualStartLine,
          instruction: 'Please re-call this tool with the actual content of the start line'
        });
      }

      if (actualEndLine !== endLineCurrentContent) {
        return JSON.stringify({
          status: 'error',
          message: 'End line content does not match',
          expectedContent: endLineCurrentContent,
          actualContent: actualEndLine,
          instruction: 'Please re-call this tool with the actual content of the end line'
        });
      }

      // All validations passed, update the file
      const newLines = [
        ...lines.slice(0, startLineNumber - 1),
        ...newContentBetweenLines.split('\n'),
        ...lines.slice(endLineNumber)
      ];

      // Write the updated content back to the file
      await fs.writeFile(filePath, newLines.join('\n'), 'utf8');

      return JSON.stringify({
        status: 'success',
        message: `File ${file} updated successfully`,
        linesReplaced: endLineNumber - startLineNumber + 1,
        newLinesCount: newContentBetweenLines.split('\n').length
      });
    } catch (error) {
      if (error instanceof Error) {
        return JSON.stringify({
          status: 'error',
          message: `Failed to edit file: ${error.message}`
        });
      }
      return JSON.stringify({
        status: 'error',
        message: 'Failed to edit file: Unknown error'
      });
    }
  }
}
