import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { BaseTool, ensurePathInWorkingDir } from './base.js';

/**
 * Tool for listing files in a directory recursively
 */
export class ListFilesTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'list_files';

  /**
   * The description of the tool
   */
  description = 'List files in a directory recursively with configurable depth. Limited to the working directory. Excludes files from .gitignore if it exists.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The directory to list files from
     * @default "."
     */
    directory: z.string().optional().default('.')
      .describe('The directory to list files from (relative to working directory)'),

    /**
     * The maximum depth to recurse into subdirectories
     * @default 4
     */
    depth: z.number().int().min(0).optional().default(4)
      .describe('The maximum depth to recurse into subdirectories (0 means only list files in the specified directory)'),

    /**
     * Whether to include directories in the output
     * @default false
     */
    includeDirs: z.boolean().optional().default(false)
      .describe('Whether to include directories in the output'),

    /**
     * The file extension to filter by
     */
    extension: z.string().optional()
      .describe('The file extension to filter by (e.g., "js", "ts", "txt")')
  });

  /**
   * The working directory
   */
  private workingDir: string;

  /**
   * Gitignore patterns
   */
  private gitignorePatterns: string[] = [];

  /**
   * Negated gitignore patterns (patterns starting with !)
   */
  private negatedGitignorePatterns: string[] = [];

  /**
   * Constructor
   * @param workingDir - The working directory
   */
  constructor(workingDir: string) {
    super();
    this.workingDir = path.resolve(workingDir);
    // We'll load gitignore patterns when execute is called
  }

  /**
   * Load .gitignore file if it exists
   */
  private async loadGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workingDir, '.gitignore');

    try {
      try {
        // Check if the file exists using fs.access
        await fs.access(gitignorePath);
      } catch (error) {
        // File doesn't exist, return early
        return;
      }

      // Read the file content
      const content = await fs.readFile(gitignorePath, 'utf8');
      const lines = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      // Reset patterns
      this.gitignorePatterns = [];
      this.negatedGitignorePatterns = [];

      // Separate normal patterns from negated patterns
      for (const line of lines) {
        if (line.startsWith('!')) {
          // Negated pattern (exclude from ignore)
          this.negatedGitignorePatterns.push(line.substring(1));
        } else {
          // Normal pattern (include in ignore)
          this.gitignorePatterns.push(line);
        }
      }
    } catch (error) {
      // Silently fail if we can't read the .gitignore file
      console.warn(`Failed to read .gitignore file: ${error}`);
    }
  }

  /**
   * Check if a file should be excluded based on .gitignore patterns
   * @param filePath - The file path to check
   * @returns True if the file should be excluded, false otherwise
   */
  private shouldExclude(filePath: string): boolean {
    if (this.gitignorePatterns.length === 0) {
      return false;
    }

    // Get the relative path from the working directory
    const relativePath = path.relative(this.workingDir, filePath);
    if (relativePath.startsWith('.git') || relativePath.startsWith('./.git')) {
      // Exclude .git directory and its contents
      return true;
    }
    // Helper function to check if a path matches a pattern
    const matchesPattern = (path: string, pattern: string): boolean => {
      // Convert to lowercase for case-insensitive comparison
      // This matches Git's behavior on case-insensitive filesystems (Windows, macOS)
      const lowerPath = path.toLowerCase();
      let lowerPattern = pattern.toLowerCase();

      // Handle directory patterns with trailing slash
      if (lowerPattern.endsWith('/')) {
        // For directory patterns, we need to match both the directory itself
        // and any files/directories inside it
        const dirPattern = lowerPattern.slice(0, -1); // Remove trailing slash
        if (lowerPath === dirPattern || lowerPath.startsWith(dirPattern + '/')) {
          return true;
        }
      }

      if (lowerPattern.startsWith('*') && lowerPath.endsWith(lowerPattern.substring(1))) {
        // Wildcard at start (e.g., *.log)
        return true;
      } else if (lowerPattern.endsWith('*') && lowerPath.startsWith(lowerPattern.substring(0, lowerPattern.length - 1))) {
        // Wildcard at end (e.g., node_*)
        return true;
      } else if (lowerPath.startsWith(lowerPattern)) {
        // Prefix match
        return true;
      } else if (lowerPattern === lowerPath) {
        // Exact match
        return true;
      }
      return false;
    };

    // First check if the file matches any negated pattern
    for (const pattern of this.negatedGitignorePatterns) {
      if (matchesPattern(relativePath, pattern)) {
        // If it matches a negated pattern, it should NOT be excluded
        return false;
      }
    }

    // Then check if it matches any regular pattern
    for (const pattern of this.gitignorePatterns) {
      if (matchesPattern(relativePath, pattern)) {
        // If it matches a regular pattern and doesn't match any negated pattern, it should be excluded
        return true;
      }
    }

    return false;
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The list of files
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Load gitignore patterns if they exist
      await this.loadGitignore();

      // Parse and validate arguments
      const { directory, depth, includeDirs, extension } = this.parameters.parse(args);

      // Ensure the directory is in the working directory
      const listDir = ensurePathInWorkingDir(directory, this.workingDir);

      // Check if the directory exists
      try {
        const stats = await fs.stat(listDir);
        if (!stats.isDirectory()) {
          throw new Error(`${directory} is not a directory`);
        }
      } catch (error) {
        throw new Error(`Directory ${directory} does not exist`);
      }

      // List files recursively
      const files = await this.listFilesRecursively(listDir, depth, includeDirs, extension);

      // Format the results
      if (files.length === 0) {
        return 'No files found in the directory.';
      }

      return `Found ${files.length} files:\n${files.join('\n')}`;
    } catch (error) {
      // Use the common error handling method from the base class
      return this.handleToolError(error);
    }
  }

  /**
   * List files recursively
   * @param dir - The directory to list files from
   * @param maxDepth - The maximum depth to recurse
   * @param includeDirs - Whether to include directories in the output
   * @param extension - The file extension to filter by
   * @param currentDepth - The current depth (used internally)
   * @returns The list of files
   */
  private async listFilesRecursively(
    dir: string,
    maxDepth: number,
    includeDirs: boolean,
    extension?: string,
    currentDepth: number = 0
  ): Promise<string[]> {
    // If we've reached the maximum depth, stop recursing
    if (currentDepth > maxDepth) {
      return [];
    }

    // Read the directory
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result: string[] = [];

    // Process each entry
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.workingDir, fullPath);

      // Skip if the file should be excluded based on .gitignore patterns
      if (this.shouldExclude(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Include directory in the output if requested
        if (includeDirs) {
          result.push(`${relativePath}/`);
        }

        // Recurse into subdirectory
        if (currentDepth < maxDepth) {
          const subDirFiles = await this.listFilesRecursively(
            fullPath,
            maxDepth,
            includeDirs,
            extension,
            currentDepth + 1
          );
          result.push(...subDirFiles);
        }
      } else if (entry.isFile()) {
        // Filter by extension if provided
        if (extension) {
          const fileExt = path.extname(entry.name).slice(1); // Remove the leading dot
          if (fileExt.toLowerCase() !== extension.toLowerCase()) {
            continue;
          }
        }

        result.push(relativePath);
      }
    }

    return result;
  }
}
