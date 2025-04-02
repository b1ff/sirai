import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir, handleZodError } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';

/**
 * Schema for a single patch operation.
 */
const patchSchema = z.object({
  find_pattern: z.string()
    .min(1)
    .describe('The exact text pattern to find in the file.'),
  replacement_content: z.string()
    .describe('The content to replace the found pattern with.'),
});

/**
 * Schema for the PatchFileTool parameters.
 */
const patchFileParametersSchema = z.object({
  file_path: z.string()
    .describe('The file path to patch (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),
  patches: z.array(patchSchema)
    .min(1)
    .describe('An array of patch operations to apply sequentially. Each patch finds the first occurrence of a pattern and replaces it.')
});

/**
 * A tool for patching files by finding and replacing text patterns.
 * This tool operates based on content patterns rather than line numbers,
 * offering a more robust way to apply changes when line numbers might shift.
 */
export class PatchFileTool extends BaseTool {
  name = 'patch_file';
  description = 'Patches a file by finding and replacing text patterns sequentially. Finds the first occurrence of each pattern and replaces it. Supports multiple patches in a single call. Limited to the working directory.';
  parameters = patchFileParametersSchema;

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * Function to prompt the user for approval before applying changes.
   */
  private promptForApproval: (filePath: string, diff: string) => Promise<boolean>;

  /**
   * Filesystem operations interface.
   */
  private fs: {
    stat: typeof fsPromises.stat;
    readFile: typeof fsPromises.readFile;
    writeFile: typeof fsPromises.writeFile;
  };

  /**
   * Creates an instance of PatchFileTool.
   * @param workingDir - The absolute path to the working directory.
   * @param promptForApproval - An async function to confirm changes with the user. Defaults to always returning true.
   * @param fs - Optional filesystem implementation for testing.
   */
  constructor(
    workingDir: string,
    promptForApproval: (filePath: string, diff: string) => Promise<boolean> = async () => true,
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
   * Executes the patch operation.
   * @param args - The arguments for the tool, matching the parameters schema.
   * @returns A JSON string indicating the result (success or error).
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    let parsedArgs: z.infer<typeof patchFileParametersSchema>;
    try {
      parsedArgs = this.parameters.parse(args);
    } catch (error) {
      return handleZodError(error);
    }

    const { file_path: file, patches } = parsedArgs;
    const filePath = ensurePathInWorkingDir(file, this.workingDir);

    let originalContent: string;
    try {
      const stats = await this.fs.stat(filePath);
      if (!stats.isFile()) {
        return JSON.stringify({ status: 'error', message: `${file} is not a file.` });
      }
      originalContent = await this.fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return JSON.stringify({ status: 'error', message: `File not found: ${file}` });
      }
      return JSON.stringify({ status: 'error', message: `Error accessing file ${file}: ${error instanceof Error ? error.message : String(error)}` });
    }

    let currentContent = originalContent;
    const appliedPatchesInfo: { find_pattern: string; replacement_content: string; index: number }[] = [];
    let diff = `File: ${file}
`;
    diff += `Applying ${patches.length} sequential patch(es):

`;

    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      const index = currentContent.indexOf(patch.find_pattern);

      if (index === -1) {
        // Try to provide context if a patch fails
        const fileSourcePrep = new FileSourceLlmPreparation([{ path: filePath, syntax: path.extname(filePath) }], this.workingDir);
        const currentFileState = await fileSourcePrep.renderForLlm(true);
        return JSON.stringify({
          status: 'error',
          message: `Patch #${i + 1} failed: Pattern not found.`,
          failed_pattern: patch.find_pattern,
          patches_applied_successfully: appliedPatchesInfo.length,
          current_file_content_before_failure: currentFileState, // Show content as it was when the pattern was searched
          suggestion: 'Verify the pattern exists in the current state of the file or adjust the pattern. Ensure previous patches did not unintentionally remove or alter the pattern.'
        });
      }

      // Build diff segment for this patch
      const { lineNumber, columnNumber } = this.getLineAndColumn(currentContent, index);
      diff += `--- Patch #${i + 1} ---
`;
      diff += `Finding pattern at Line ${lineNumber}, Column ${columnNumber}:
"${patch.find_pattern}"
`;
      diff += `Replacing with:
"${patch.replacement_content}"

`;

      // Apply the replacement
      currentContent = currentContent.substring(0, index) + patch.replacement_content + currentContent.substring(index + patch.find_pattern.length);
      appliedPatchesInfo.push({ ...patch, index });
    }

    // Get approval if configured
    const approved = await this.promptForApproval(filePath, diff);
    if (!approved) {
      return JSON.stringify({
        status: 'canceled',
        message: 'Patch operation was not approved by the user.'
      });
    }

    try {
      // Write the fully patched content back to the file
      await this.fs.writeFile(filePath, currentContent, 'utf8');

      const fileSourcePrep = new FileSourceLlmPreparation([{ path: filePath, syntax: path.extname(filePath) }], this.workingDir);
      const newContentForLlm = await fileSourcePrep.renderForLlm(false);

      return JSON.stringify({
        status: 'success',
        message: `File ${file} patched successfully with ${appliedPatchesInfo.length} changes.`,
        patchesApplied: appliedPatchesInfo.length,
        newContent: newContentForLlm
      });
    } catch (error) {
      return JSON.stringify({
        status: 'error',
        message: `Failed to write patched file ${file}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Calculates the line and column number for a given index in a string.
   * @param text - The text content.
   * @param index - The character index.
   * @returns An object with lineNumber and columnNumber (1-based).
   */
  private getLineAndColumn(text: string, index: number): { lineNumber: number; columnNumber: number } {
    let lineNumber = 1;
    let lastNewlineIndex = -1;
    for (let i = 0; i < index; i++) {
      if (text[i] === '\n') {
        lineNumber++;
        lastNewlineIndex = i;
      }
    }
    const columnNumber = index - lastNewlineIndex;
    return { lineNumber, columnNumber };
  }
}
