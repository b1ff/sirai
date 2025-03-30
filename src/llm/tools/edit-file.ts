import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for editing files using line numbers and content verification to identify edit regions
 */
export class EditFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'edit_file';

  /**
   * The description of the tool
   */
  description = 'Edit a file by replacing content between specified line positions. Requires line numbers and expected content at those lines for verification. Limited to the working directory.';

  parameters = z.object({
    file: z.string()
        .describe('The file path to edit (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),

    startingPositionLineNumber: z.number()
        .int()
        .positive()
        .describe('The line number where modification should start'),

    startingPositionCurrentContent: z.string()
        .describe('The current content at the starting line. Used to verify the correct position.'),

    endPositionLineNumber: z.number()
          .int()
          .positive()
          .describe('The line number where modification should end '),

    endPositionCurrentContent: z.string()
          .describe('The current content at the ending line. Used to verify the correct position.'),

    newContent: z.string()
        .describe('The new content to replace everything from start to end position (inclusive)')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  private promptForApproval: (filePath: string, content: string) => Promise<boolean>;

  private fs: {
    stat: typeof fsPromises.stat;
    readFile: typeof fsPromises.readFile;
    writeFile: typeof fsPromises.writeFile;
  };

  constructor(
      workingDir: string,
      promptForApproval: (filePath: string, content: string) => Promise<boolean> = async () => true,
      fs?: {
        stat: typeof fsPromises.stat;
        readFile: typeof fsPromises.readFile;
        writeFile: typeof fsPromises.writeFile;
      }
  ) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.promptForApproval = promptForApproval;
    this.fs = fs || fsPromises;
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
        startingPositionLineNumber,
        startingPositionCurrentContent,
        endPositionLineNumber,
        endPositionCurrentContent,
        newContent
      } = this.parameters.parse(args);

      const startingPosition = {
        lineNumber: startingPositionLineNumber,
        currentContent: startingPositionCurrentContent
      };

      const endPosition = {
        lineNumber: endPositionLineNumber,
        currentContent: endPositionCurrentContent
      };


      const filePath = ensurePathInWorkingDir(file, this.workingDir);

      try {
        const stats = await this.fs.stat(filePath);
        if (!stats.isFile()) {
          throw new Error(`${file} is not a file`);
        }
      } catch (error) {
        throw new Error(`File ${file} does not exist`);
      }

      // Read the file content
      const content = await this.fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Convert 1-based line numbers to 0-based indices
      const startLineIndex = startingPosition.lineNumber - 1;
      const endLineIndex = endPosition.lineNumber - 1;

      // Validate line numbers are within file bounds
      if (startLineIndex < 0 || startLineIndex >= lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `Starting line number ${startingPosition.lineNumber} is out of bounds (file has ${lines.length} lines)`,
          suggestion: 'Provide a valid line number within the file bounds'
        });
      }

      if (endLineIndex < 0 || endLineIndex >= lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `Ending line number ${endPosition.lineNumber} is out of bounds (file has ${lines.length} lines)`,
          suggestion: 'Provide a valid line number within the file bounds'
        });
      }

      if (endLineIndex < startLineIndex) {
        return JSON.stringify({
          status: 'error',
          message: `Ending line number ${endPosition.lineNumber} is before starting line number ${startingPosition.lineNumber}`,
          suggestion: 'Ensure the ending line number is greater than or equal to the starting line number'
        });
      }

      // Verify content at the specified lines
      if (lines[startLineIndex].trim() !== startingPosition.currentContent.trim()) {
        return JSON.stringify({
          status: 'error',
          message: 'Content at starting line does not match expected content',
          lineNumber: startingPosition.lineNumber,
          expectedContent: startingPosition.currentContent,
          actualContent: lines[startLineIndex],
          suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
        });
      }

      if (lines[endLineIndex].trim() !== endPosition.currentContent.trim()) {
        return JSON.stringify({
          status: 'error',
          message: 'Content at ending line does not match expected content',
          lineNumber: endPosition.lineNumber,
          expectedContent: endPosition.currentContent,
          actualContent: lines[endLineIndex],
          suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
        });
      }

      // Create a diff to show what will change
      const linesToReplace = lines.slice(startLineIndex, endLineIndex + 1);
      const newLines = newContent.split('\n');

      let diff = `File: ${file}\n`;
      diff += `Replacing content from line ${startLineIndex + 1} to ${endLineIndex + 1} (${linesToReplace.length} lines)\n`;
      diff += `With ${newLines.length} new lines\n\n`;

      diff += "Content being replaced:\n";
      linesToReplace.forEach((line, i) => {
        diff += `${startLineIndex + i + 1}: ${line}\n`;
      });

      diff += "\nNew content:\n";
      newLines.forEach((line) => {
        diff += `${line}\n`;
      });

      // Get approval if configured
      const approved = await this.promptForApproval(filePath, diff);
      if (!approved) {
        return JSON.stringify({
          status: 'canceled',
          message: 'Edit was not approved by the user'
        });
      }

      // All validations passed, update the file
      const newFileLines = [
        ...lines.slice(0, startLineIndex),
        ...newLines,
        ...lines.slice(endLineIndex + 1)
      ];

      // Write the updated content back to the file
      await this.fs.writeFile(filePath, newFileLines.join('\n'), 'utf8');

      return JSON.stringify({
        status: 'success',
        message: `File ${file} updated successfully`,
        linesReplaced: endLineIndex - startLineIndex + 1,
        newLinesCount: newLines.length,
        startLine: startLineIndex + 1,
        endLine: endLineIndex + 1
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
