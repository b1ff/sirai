import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for editing files using text matching to identify edit regions
 */
export class EditFileTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'edit_file';

  /**
   * The description of the tool
   */
  description = 'Edit a file by replacing content between specified text blocks. Requires the exact text to match at start and end of the edit region in file version BEFORE modification. Limited to the working directory.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The file to edit
     */
    file: z.string()
        .describe('The file path to edit (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),

    /**
     * The text to start modification from
     */
    textToStartModification: z.string()
        .describe('The exact text to find where modification should start within specified file. If this text does not exist in the file, the edit will not be made. This line will be replaced with the new content.'),

    /**
     * The text to end modification at
     */
    textToEndModification: z.string()
        .describe('The exact text to find where modification should end. If this text does not exist in the file, the edit will not be made. This line will be replaced with the new content'),

    /**
     * The new content to replace the matched region
     */
    newContent: z.string()
        .describe('The new content to replace everything from start to end text (inclusive)')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * Whether to request user approval before making changes
   */
  private promptForApproval: (filePath: string, content: string) => Promise<boolean>;

  /**
   * Constructor
   * @param workingDir - The working directory
   * @param promptForApproval - Function to prompt for user approval of changes
   */
  constructor(
      workingDir: string,
      promptForApproval: (filePath: string, content: string) => Promise<boolean> = async () => true
  ) {
    super();
    this.workingDir = path.resolve(workingDir);
    this.promptForApproval = promptForApproval;
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
        textToStartModification,
        textToEndModification,
        newContent
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

      // Find the start and end positions based on text matching
      let startLineIndex = -1;
      let endLineIndex = -1;

      // Find lines that match the start and end texts exactly
      for (let i = 0; i < lines.length; i++) {
        let currLine = lines[i].trim();
        if (currLine === textToStartModification.trim() && startLineIndex === -1) {
          startLineIndex = i;
        }
        // Only look for end text after finding start text
        if (startLineIndex !== -1 && currLine === textToEndModification.trim()) {
          endLineIndex = i;
          break;
        }
      }

      // Handle case where start text wasn't found
      if (startLineIndex === -1) {
        return JSON.stringify({
          status: 'error',
          message: 'Start text not found in file',
          textProvided: textToStartModification,
          suggestion: 'Make sure the text matches exactly, including whitespace and indentation'
        });
      }

      // Handle case where end text wasn't found
      if (endLineIndex === -1) {
        return JSON.stringify({
          status: 'error',
          message: 'End text not found after start text in file',
          startTextFound: textToStartModification,
          startLineNumber: startLineIndex + 1,
          endTextProvided: textToEndModification,
          suggestion: 'Make sure the end text matches exactly, including whitespace and indentation'
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
      await fs.writeFile(filePath, newFileLines.join('\n'), 'utf8');

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
