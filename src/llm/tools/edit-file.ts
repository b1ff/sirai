import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';

export class EditFileTool extends BaseTool {
  name = 'edit_file';

  description = 'Edit a file by replacing content between specified line positions. Supports multiple changes in a single call. Requires line numbers and expected content at those lines for verification. Limited to the working directory.';

  private changeSchema = z.object({
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

  parameters = z.object({
    file_path: z.string()
        .describe('The file path to edit (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),

    changes: z.union([
      this.changeSchema,
      z.array(this.changeSchema)
    ]).describe('One or more changes to apply to the file. Each change specifies start/end positions and new content.')
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
      const parsedArgs = this.parameters.parse(args);
      const file = parsedArgs.file_path;
      const filePath = ensurePathInWorkingDir(file, this.workingDir);

      // Normalize changes to always be an array
      const changesArray = Array.isArray(parsedArgs.changes) 
        ? parsedArgs.changes 
        : [parsedArgs.changes];

      // Sort changes by starting line in descending order to avoid line number shifts
      const sortedChanges = [...changesArray].sort((a, b) => 
        b.starting_position_line_number - a.starting_position_line_number
      );

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

      const fileSourceLlmPreparation = new FileSourceLlmPreparation([{
        path: filePath,
        syntax: path.extname(filePath),
      }], this.workingDir);

      // Validate all changes before applying any
      for (const change of changesArray) {
        const startLineIndex = change.starting_position_line_number - 1;
        const endLineIndex = change.end_position_line_number - 1;

        // Validate line numbers are within file bounds
        if (startLineIndex < 0 || startLineIndex >= lines.length) {
          return JSON.stringify({
            status: 'error',
            message: `Starting line number ${change.starting_position_line_number} is out of bounds (file has ${lines.length} lines)`,
            suggestion: 'Provide a valid line number within the file bounds'
          });
        }

        if (endLineIndex < 0 || endLineIndex >= lines.length) {
          return JSON.stringify({
            status: 'error',
            message: `Ending line number ${change.end_position_line_number} is out of bounds (file has ${lines.length} lines)`,
            suggestion: 'Provide a valid line number within the file bounds'
          });
        }

        if (endLineIndex < startLineIndex) {
          return JSON.stringify({
            status: 'error',
            message: `Ending line number ${change.end_position_line_number} is before starting line number ${change.starting_position_line_number}`,
            suggestion: 'Ensure the ending line number is greater than or equal to the starting line number'
          });
        }

        // Verify content at the specified lines
        if (lines[startLineIndex].trim() !== change.starting_position_current_content.trim()) {
          return JSON.stringify({
            status: 'error',
            message: 'Content at starting line does not match expected content',
            lineNumber: change.starting_position_line_number,
            expectedContent: change.starting_position_current_content,
            actualContent: lines[startLineIndex],
            currentFileContent: await fileSourceLlmPreparation.renderForLlm(true),
            suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
          });
        }

        if (lines[endLineIndex].trim() !== change.end_position_current_content.trim()) {
          return JSON.stringify({
            status: 'error',
            message: 'Content at ending line does not match expected content',
            lineNumber: change.end_position_line_number,
            expectedContent: change.end_position_current_content,
            actualContent: lines[endLineIndex],
            currentFileContent: await fileSourceLlmPreparation.renderForLlm(true),
            suggestion: 'Make sure the expected content matches exactly, including whitespace and indentation'
          });
        }
      }

      // Create a diff to show what will change
      let diff = `File: ${file}\n`;
      diff += `Number of changes: ${changesArray.length}\n\n`;

      for (let i = 0; i < changesArray.length; i++) {
        const change = changesArray[i];
        const startLineIndex = change.starting_position_line_number - 1;
        const endLineIndex = change.end_position_line_number - 1;
        const linesToReplace = lines.slice(startLineIndex, endLineIndex + 1);
        const newLines = change.new_content.split('\n');

        diff += `Change #${i + 1}:\n`;
        diff += `Replacing content from line ${startLineIndex + 1} to ${endLineIndex + 1} (${linesToReplace.length} lines)\n`;
        diff += `With ${newLines.length} new lines\n\n`;

        diff += "Content being replaced:\n";
        linesToReplace.forEach((line, j) => {
          diff += `${startLineIndex + j + 1}: ${line}\n`;
        });

        diff += "\nNew content:\n";
        newLines.forEach((line) => {
          diff += `${line}\n`;
        });
        
        diff += "\n---\n\n";
      }

      // Get approval if configured
      const approved = await this.promptForApproval(filePath, diff);
      if (!approved) {
        return JSON.stringify({
          status: 'canceled',
          message: 'Edit was not approved by the user'
        });
      }

      // All validations passed, apply changes in reverse order (to avoid line number shifts)
      let updatedLines = [...lines];
      
      for (const change of sortedChanges) {
        const startLineIndex = change.starting_position_line_number - 1;
        const endLineIndex = change.end_position_line_number - 1;
        const newLines = change.new_content.split('\n');
        
        updatedLines = [
          ...updatedLines.slice(0, startLineIndex),
          ...newLines,
          ...updatedLines.slice(endLineIndex + 1)
        ];
      }

      // Write the updated content back to the file
      await this.fs.writeFile(filePath, updatedLines.join('\n'), 'utf8');

      return JSON.stringify({
        status: 'success',
        message: `File ${file} updated successfully with ${changesArray.length} changes`,
        changesApplied: changesArray.length,
        newContent: await fileSourceLlmPreparation.renderForLlm(true)
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
