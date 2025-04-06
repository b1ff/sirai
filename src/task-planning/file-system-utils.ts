import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { ContextProfile, DirectoryStructure } from './schemas.js';

/**
 * Utility class for file system operations related to task planning
 */

export class FileSystemUtils {
  /**
   * Gets the language of a file based on its extension
   * @param filePath - The path to the file
   * @returns The language of the file
   */
  static getFileLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const languageMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.md': 'markdown',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.sh': 'shell',
      '.bat': 'batch',
      '.ps1': 'powershell'
    };

    return languageMap[extension] || 'plaintext';
  }

  /**
   * Reads a file and returns its content
   * @param filePath - The path to the file
   * @returns The content of the file
   */
  static async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error reading file ${filePath}: ${error.message}`);
      }
      throw new Error(`Error reading file ${filePath}: Unknown error`);
    }
  }

  /**
   * Gets information about a file
   * @param filePath - The path to the file
   * @returns Information about the file
   */
  static async getFileInfo(filePath: string): Promise<{ path: string; language: string; size: number }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        path: filePath,
        language: this.getFileLanguage(filePath),
        size: stats.size
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error getting file info for ${filePath}: ${error.message}`);
      }
      throw new Error(`Error getting file info for ${filePath}: Unknown error`);
    }
  }

  /**
   * Scans a directory for files matching a pattern
   * @param directory - The directory to scan
   * @param pattern - The glob pattern to match
   * @returns An array of file paths
   */
  static async scanDirectory(directory: string, pattern: string = '**/*'): Promise<string[]> {
    try {
      const matches = await glob(pattern, { cwd: directory, nodir: true, absolute: true });
      return matches;
    } catch (err) {
      throw new Error(`Error scanning directory ${directory}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * Parses package.json to extract dependencies
   * @param projectRoot - The root directory of the project
   * @returns An array of dependencies
   */
  static async parseDependencies(projectRoot: string): Promise<{ name: string; version: string }[]> {
    const packageJsonPath = path.join(projectRoot, 'package.json');

    try {
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = JSON.parse(await this.readFile(packageJsonPath));
        const dependencies: { name: string; version: string }[] = [];

        // Process dependencies
        if (packageJson.dependencies) {
          Object.entries(packageJson.dependencies).forEach(([name, version]) => {
            dependencies.push({ name, version: version as string });
          });
        }

        // Process devDependencies
        if (packageJson.devDependencies) {
          Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
            dependencies.push({ name, version: version as string });
          });
        }

        return dependencies;
      }

      return [];
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error parsing dependencies: ${error.message}`);
      }
      throw new Error('Error parsing dependencies: Unknown error');
    }
  }

  /**
   * Detects the technology stack of a project
   * @param projectRoot - The root directory of the project
   * @param files - An array of file information
   * @returns An array of technology stack items
   */
  static async detectTechnologyStack(
    projectRoot: string,
    files: { path: string; language: string; size: number }[]
  ): Promise<string[]> {
    const technologyStack: string[] = [];
    const fileExtensions = files.map(file => path.extname(file.path).toLowerCase());
    const uniqueExtensions = [...new Set(fileExtensions)];

    // Check for package.json (Node.js)
    if (await fs.pathExists(path.join(projectRoot, 'package.json'))) {
      technologyStack.push('Node.js');

      // Check for specific frameworks
      const packageJson = JSON.parse(await this.readFile(path.join(projectRoot, 'package.json')));

      if (packageJson.dependencies) {
        if (packageJson.dependencies.react) technologyStack.push('React');
        if (packageJson.dependencies.vue) technologyStack.push('Vue.js');
        if (packageJson.dependencies.angular) technologyStack.push('Angular');
        if (packageJson.dependencies.express) technologyStack.push('Express');
        if (packageJson.dependencies.next) technologyStack.push('Next.js');
        if (packageJson.dependencies.gatsby) technologyStack.push('Gatsby');
      }
    }

    // Check for specific file types
    if (uniqueExtensions.includes('.py')) technologyStack.push('Python');
    if (uniqueExtensions.includes('.java')) technologyStack.push('Java');
    if (uniqueExtensions.includes('.go')) technologyStack.push('Go');
    if (uniqueExtensions.includes('.rb')) technologyStack.push('Ruby');
    if (uniqueExtensions.includes('.php')) technologyStack.push('PHP');
    if (uniqueExtensions.includes('.cs')) technologyStack.push('C#');
    if (uniqueExtensions.includes('.ts') || uniqueExtensions.includes('.tsx')) technologyStack.push('TypeScript');

    // Check for specific config files
    if (await fs.pathExists(path.join(projectRoot, 'docker-compose.yml'))) technologyStack.push('Docker');
    if (await fs.pathExists(path.join(projectRoot, 'Dockerfile'))) technologyStack.push('Docker');
    if (await fs.pathExists(path.join(projectRoot, 'kubernetes'))) technologyStack.push('Kubernetes');

    return technologyStack;
  }

  /**
   * Creates a directory structure representation
   * @param dir - The directory to create a structure for
   * @param maxDepth - Maximum depth to traverse
   * @returns A directory structure object
   */
  static async createDirectoryStructure(
    dir: string,
    maxDepth: number = 2
  ): Promise<DirectoryStructure> {
    try {
      const name = path.basename(dir);
      const structure: DirectoryStructure = {
        path: dir,
        name,
        type: 'directory',
        children: []
      };

      if (maxDepth <= 0) {
        return structure;
      }

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);

          // Skip .git and node_modules directories
          if (entry.name === '.git' || entry.name === 'node_modules') {
            continue;
          }

          const childStructure = await this.createDirectoryStructure(
            fullPath,
            maxDepth - 1
          );

          structure.children?.push(childStructure);
        }
      }

      return structure;
    } catch (error) {
      console.error(`Error creating directory structure for ${dir}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        path: dir,
        name: path.basename(dir),
        type: 'directory'
      };
    }
  }

  /**
   * Loads the guidelines files according to priority
   * @param projectRoot - The root directory of the project
   * @returns The contents of the guidelines files or null if not found
   */
  static async loadGuidelines(projectRoot: string): Promise<string | null> {
    const guidelinesPaths = [
      path.join(projectRoot, 'sirai/guidelines/index.md'),
      path.join(projectRoot, 'cursor/rules'),
      path.join(projectRoot, '.junie/guidelines.md')
    ];
    let guidelinesContent = '';

    for (const filePath of guidelinesPaths) {
      try {
        if (filePath.endsWith('.md')) {
          if (await fs.pathExists(filePath)) {
            guidelinesContent += await fs.readFile(filePath, 'utf8');
            break;
          }
        } else {
          // This is a directory, look for .mdc files
          if (await fs.pathExists(filePath)) {
            const files = (await fs.readdir(filePath)).filter(file => file.endsWith('.mdc'));
            for (const file of files) {
              guidelinesContent += await fs.readFile(path.join(filePath, file), 'utf8') + '\n';
            }

            if (files.length > 0) {
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Error reading guidelines file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return guidelinesContent || null;
  }

  /**
   * Creates a context profile for a project
   * @param projectRoot - The root directory of the project
   * @param currentDirectory - The current working directory
   * @returns A context profile
   */
  static async createContextProfile(
    projectRoot: string,
    currentDirectory: string
  ): Promise<ContextProfile> {
    try {
      // Scan for files
      const filePaths = await this.scanDirectory(projectRoot);

      // Get file info
      const filePromises = filePaths.map(filePath => this.getFileInfo(filePath));
      const files = await Promise.all(filePromises);

      // Parse dependencies
      const dependencies = await this.parseDependencies(projectRoot);

      // Detect technology stack
      const technologyStack = await this.detectTechnologyStack(projectRoot, files);

      // Create directory structure (limited to depth 2 for performance)
      const directoryStructure = await this.createDirectoryStructure(projectRoot, 2);

      // Load guidelines
      const guidelines = await this.loadGuidelines(projectRoot);

      const contextProfile: ContextProfile = {
        projectRoot,
        currentDirectory,
        files,
        dependencies,
        technologyStack,
        directoryStructure,
        guidelines: guidelines || undefined,
        createContextString: function() {
          let contextString = '';

          if (this.guidelines) {
            contextString += `<project_specific_guidelines>${this.guidelines}</project_specific_guidelines>`;
          }

          return contextString;
        }
      };

      return contextProfile;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error creating context profile: ${error.message}`);
      }
      throw new Error('Error creating context profile: Unknown error');
    }
  }
}
