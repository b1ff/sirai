import { z } from 'zod';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { BaseTool, ensurePathInWorkingDir, handleZodError } from './base.js';
import { FileSourceLlmPreparation } from './file-source-llm-preparation.js';

/**
 * Schema for a single patch operation.
 */
const patchSchema = z.object({
    find: z.string()
        .describe('The exactly current content to be replaced.'),
    replace: z.string()
        .describe('The new content to replace the found content with.'),
});

/**
 * Schema for the PatchFileTool parameters.
 */
const patchFileParametersSchema = z.object({
    file_path: z.string()
        .describe('The file path to patch (relative to working directory). Pay attention to the file path within <file> tags if provided in the prompt.'),
    changes:
        z.array(patchSchema)
            .describe('An array of changes to apply to the file. Each change specifies old content to find and new content to replace it with.')
});

/**
 * A tool for patching files by replacing content.
 * This tool operates by finding the old content and replacing it with new content.
 */
export class PatchFileTool extends BaseTool {
    name = 'patch_file';
    description = 'Patches a file by finding and replacing content. Supports multiple changes in a single call. Limited to the working directory.';
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

        const { file_path: file, changes } = parsedArgs;

        let filePath: string;
        try {
            filePath = ensurePathInWorkingDir(file, this.workingDir);
        } catch (error) {
            return JSON.stringify({
                status: 'error',
                message: `${file} is outside the working directory`
            });
        }

        // Normalize changes to an array
        const changesArray = Array.isArray(changes) ? changes : [changes];

        let originalContent: string;
        try {
            const stats = await this.fs.stat(filePath);
            if (!stats.isFile()) {
                return JSON.stringify({ status: 'error', message: `${file} is not a file.` });
            }
            originalContent = await this.fs.readFile(filePath, 'utf8');
        } catch (error) {
            // Check for file not found errors - either by code or message
            if (
                (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') ||
                (error instanceof Error && error.message.includes('not found'))
            ) {
                return JSON.stringify({ status: 'error', message: `File ${file} does not exist` });
            }
            return JSON.stringify({
                status: 'error',
                message: `Error accessing file ${file}: ${error instanceof Error ? error.message : String(error)}`
            });
        }

        // We'll work with the full content as a string
        let currentContent = originalContent;

        // No need to sort changes as we're working with content directly
        const sortedChanges = [...changesArray];

        const appliedChangesInfo: {
            find: string;
            replace: string
        }[] = [];

        let diff = `File: ${file}
`;
        diff += `Applying ${sortedChanges.length} sequential change(s):

`;

        // Apply each change
        for (let i = 0; i < sortedChanges.length; i++) {
            const change = sortedChanges[i];
            const { find, replace } = change;

            // Check if find exists in the current content
            if (!currentContent.includes(find)) {
                return JSON.stringify({
                    status: 'error',
                    message: `Change #${i + 1} failed: Could not find the specified content in the file.`,
                    expected: find
                });
            }

            // Build diff segment for this change
            diff += `--- Change #${i + 1} ---
`;
            diff += `Replacing:
"${find}"
`;
            diff += `With:
"${replace}"

`;

            // Apply the change
            currentContent = currentContent.replace(find, replace);

            appliedChangesInfo.push({
                find,
                replace
            });
        }

        // Use the updated content
        const newContent = currentContent;

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
            await this.fs.writeFile(filePath, newContent, 'utf8');

            const fileSourcePrep = new FileSourceLlmPreparation([{
                path: filePath,
                syntax: path.extname(filePath)
            }], this.workingDir);
            const newContentForLlm = await fileSourcePrep.renderForLlm(false);

            return JSON.stringify({
                status: 'success',
                message: `File ${file} patched successfully with ${appliedChangesInfo.length} changes.`,
                changesApplied: appliedChangesInfo.length,
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
    private getLineAndColumn(text: string, index: number): {lineNumber: number; columnNumber: number} {
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
