import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';

export class EditFileTool extends BaseTool {
  name = 'edit_file';

  description = 'Edit a file by replacing content between specified line positions. Requires line numbers and expected content at those lines for verification. Limited to the working directory.';

  parameters = z.object({
    file_path: z.string()
        .describe('The file path to edit (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),

    starting_position_line_number: z.number()
        .int()
        .positive()
        .describe('The line number where modification should start'),

    starting_position_current_content: z.string()
        .describe('The current content at the starting line. Used to verify the correct position.'),

    end_position_line_number: z.number()
        .int()
        .positive()
        .describe('The line number where modification should end'),

    end_position_current_content: z.string()
        .describe('The current content at the ending line. Used to verify the correct position.'),

    new_content: z.string()
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
      const {
        file_path: passedFilePath,
        starting_position_current_content,
        end_position_line_number,
        end_position_current_content,
        starting_position_line_number,
        new_content
      } = this.parameters.parse(args);
      const file = passedFilePath;
      const starting_position = {
        line_number: starting_position_line_number,
        current_content: starting_position_current_content
      };

      const end_position = {
        line_number: end_position_line_number,
        current_content: end_position_current_content
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
      const startLineIndex = starting_position.line_number - 1;
      const endLineIndex = end_position.line_number - 1;

      // Validate line numbers are within file bounds
      if (startLineIndex < 0 || startLineIndex >= lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `Starting line number ${starting_position.line_number} is out of bounds (file has ${lines.length} lines)`,
          suggestion: 'Provide a valid line number within the file bounds'
        });
      }

      if (endLineIndex < 0 || endLineIndex >= lines.length) {
        return JSON.stringify({
          status: 'error',
          message: `Ending line number ${end_position.line_number} is out of bounds (file has ${lines.length} lines)`,
          suggestion: 'Provide a valid line number within the file bounds'
        });
      }

      if (endLineIndex < startLineIndex) {
        return JSON.stringify({
          status: 'error',
          message: `Ending line number ${end_position.line_number} is before starting line number ${starting_position.line_number}`,
          suggestion: 'Ensure the ending line number is greater than or equal to the starting line number'
        });
      }

      const fileSourceLlmPreparation = new FileSourceLlmPreparation([{
        path: filePath,
        syntax: path.extname(filePath),
      }], this.workingDir);

      // Verify content at the specified lines
      if (lines[startLineIndex].trim() !== starting_position.current_content.trim()) {
        return JSON.stringify({
          status: 'error',
          message: 'Content at starting line does not match expected content',
          lineNumber: starting_position.line_number,
          expectedContent: starting_position.current_content,
          actualContent: lines[startLineIndex],
          currentFileContent: fileSourceLlmPreparation.renderForLlm(true),
          suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
        });
      }

      if (lines[endLineIndex].trim() !== end_position.current_content.trim()) {
        return JSON.stringify({
          status: 'error',
          message: 'Content at ending line does not match expected content',
          lineNumber: end_position.line_number,
          expectedContent: end_position.current_content,
          actualContent: lines[endLineIndex],
          currentFileContent: fileSourceLlmPreparation.renderForLlm(true),
          suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
        });
      }

      // Create a diff to show what will change
      const linesToReplace = lines.slice(startLineIndex, endLineIndex + 1);
      const newLines = new_content.split('\n');

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
        newContent: fileSourceLlmPreparation.renderForLlm(true)
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
