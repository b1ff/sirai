import * as fs from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';

/**
 * A utility class for file system operations and gitignore handling
 */
export class FileSystemHelper {
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
    this.workingDir = path.resolve(workingDir);
  }

  /**
   * Load .gitignore file if it exists
   * @param gitignorePath - Optional custom path to the gitignore file
   * @returns A promise that resolves when the gitignore file is loaded
   */
  public async loadGitignore(gitignorePath?: string): Promise<void> {
    const ignoreFilePath = gitignorePath || path.join(this.workingDir, '.gitignore');

    try {
      try {
        // Check if the file exists using fs.access
        await fs.access(ignoreFilePath);
      } catch (error) {
        // File doesn't exist, return early
        return;
      }

      // Read the file content
      const content = await fs.readFile(ignoreFilePath, 'utf8');
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
  public shouldExclude(filePath: string): boolean {
    if (this.gitignorePatterns.length === 0) {
      return false;
    }

    // Get the relative path from the working directory
    const relativePath = path.relative(this.workingDir, filePath);
    
    // Always exclude .git directory and its contents
    if (relativePath.startsWith('.git') || relativePath.startsWith('./.git')) {
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
   * List files recursively
   * @param dir - The directory to list files from
   * @param options - Options for listing files
   * @returns The list of files
   */
  public async listFilesRecursively(
    dir: string,
    options: {
      maxDepth?: number;
      includeDirs?: boolean;
      extension?: string;
      currentDepth?: number;
    } = {}
  ): Promise<string[]> {
    const {
      maxDepth = 4,
      includeDirs = false,
      extension,
      currentDepth = 0
    } = options;

    // If we've reached the maximum depth, stop recursing
    if (currentDepth > maxDepth) {
      return [];
    }

    // Ensure the directory exists
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        throw new Error(`${dir} is not a directory`);
      }
    } catch (error) {
      throw new Error(`Directory ${dir} does not exist or cannot be accessed`);
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
            {
              maxDepth,
              includeDirs,
              extension,
              currentDepth: currentDepth + 1
            }
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

  /**
   * List directories recursively
   * @param dir - The directory to list directories from
   * @param options - Options for listing directories
   * @returns The list of directories
   */
  public async listDirectoriesRecursively(
    dir: string,
    options: {
      maxDepth?: number;
      currentDepth?: number;
    } = {}
  ): Promise<string[]> {
    const {
      maxDepth = 1,
      currentDepth = 0
    } = options;

    // If we've reached the maximum depth, stop recursing
    if (currentDepth > maxDepth) {
      return [];
    }

    // Ensure the directory exists
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        throw new Error(`${dir} is not a directory`);
      }
    } catch (error) {
      throw new Error(`Directory ${dir} does not exist or cannot be accessed`);
    }

    // Read the directory
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result: string[] = [];

    // Process each entry
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.workingDir, fullPath);

        // Skip if the directory should be excluded based on .gitignore patterns
        if (this.shouldExclude(fullPath)) {
          continue;
        }

        // Add the directory to the result
        result.push(`${relativePath}/`);

        // Recurse into subdirectory if not at max depth
        if (currentDepth < maxDepth) {
          const subDirs = await this.listDirectoriesRecursively(
            fullPath,
            {
              maxDepth,
              currentDepth: currentDepth + 1
            }
          );
          result.push(...subDirs);
        }
      }
    }

    return result;
  }

  /**
   * Find files matching a glob pattern
   * @param pattern - The glob pattern to match
   * @param options - Options for finding files
   * @returns The list of files matching the pattern
   */
  public async findFiles(
    pattern: string,
    options: {
      cwd?: string;
      ignoreGitignore?: boolean;
    } = {}
  ): Promise<string[]> {
    const {
      cwd = this.workingDir,
      ignoreGitignore = true
    } = options;

    // Find files matching the pattern
    const matches = await glob(pattern, { 
      cwd, 
      nodir: true, 
      absolute: true 
    });

    // Filter out files that should be excluded based on .gitignore patterns
    if (ignoreGitignore) {
      return matches.filter(file => !this.shouldExclude(file));
    }

    return matches;
  }

  /**
   * Read a file and return its content
   * @param filePath - The path to the file
   * @param encoding - The encoding to use when reading the file
   * @returns The content of the file
   */
  public async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    try {
      // Ensure the file path is in the working directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(this.workingDir)) {
        throw new Error(`File path ${filePath} is outside the working directory`);
      }

      return await fs.readFile(resolvedPath, encoding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error reading file ${filePath}: ${error.message}`);
      }
      throw new Error(`Error reading file ${filePath}: Unknown error`);
    }
  }

  /**
   * Write content to a file
   * @param filePath - The path to the file
   * @param content - The content to write
   * @param encoding - The encoding to use when writing the file
   * @returns A promise that resolves when the file is written
   */
  public async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    try {
      // Ensure the file path is in the working directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(this.workingDir)) {
        throw new Error(`File path ${filePath} is outside the working directory`);
      }

      // Ensure the directory exists
      await fsExtra.ensureDir(path.dirname(resolvedPath));

      // Write the file
      await fs.writeFile(resolvedPath, content, encoding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error writing file ${filePath}: ${error.message}`);
      }
      throw new Error(`Error writing file ${filePath}: Unknown error`);
    }
  }

  /**
   * Check if a file exists
   * @param filePath - The path to the file
   * @returns True if the file exists, false otherwise
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure a path is within the working directory
   * @param filePath - The path to check
   * @returns The resolved path if it's within the working directory
   * @throws Error if the path is outside the working directory
   */
  public ensurePathInWorkingDir(filePath: string): string {
    const resolvedPath = path.resolve(this.workingDir, filePath);
    if (!resolvedPath.startsWith(this.workingDir)) {
      throw new Error(`Path ${filePath} is outside the working directory`);
    }
    return resolvedPath;
  }

  /**
   * Get the working directory
   * @returns The working directory
   */
  public getWorkingDir(): string {
    return this.workingDir;
  }

  /**
   * Set the working directory
   * @param workingDir - The new working directory
   */
  public setWorkingDir(workingDir: string): void {
    this.workingDir = path.resolve(workingDir);
  }

  public async isDirectory(listDir: string) {
    try {
      const stats = await fs.stat(listDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  public filterGitignored(strings: string[]) {
    return strings.filter((str) => {
      const relativePath = path.relative(this.workingDir, str);
      return !this.shouldExclude(relativePath);
    });
  }
}
