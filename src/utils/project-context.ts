import fs from 'fs-extra';
import path from 'path';
import { AppConfig } from '../config/config.js';

/**
 * Interface for project context
 */
export interface ProjectContextData {
  guidelines: string | null; // Added field for guidelines
  currentDirectory: string;
  projectRoot: string;
}

/**
 * Handles project context integration
 */
export class ProjectContext {
  private config: AppConfig;

  /**
   * Constructor
   * @param config - The configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Gets the current working directory
   * @returns The current working directory
   */
  getCurrentDirectory(): string {
    return process.cwd();
  }

  /**
   * Checks if a file exists in the given directory
   * @param directory - The directory to check
   * @param filename - The filename to check for
   * @returns True if the file exists
   */
  fileExistsInDirectory(directory: string, filename: string): boolean {
    const filePath = path.join(directory, filename);
    return fs.existsSync(filePath);
  }

  /**
   * Finds the project root directory by looking for a specific file
   * @param startDir - The directory to start searching from
   * @param markerFile - The file that indicates the project root
   * @returns The project root directory or null if not found
   */
  findProjectRoot(startDir: string = this.getCurrentDirectory(), markerFile: string = '.git'): string | null {
    let currentDir = startDir;

    // Limit the search to avoid infinite loops
    const maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      if (this.fileExistsInDirectory(currentDir, markerFile)) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached the root directory
        break;
      }

      currentDir = parentDir;
      depth++;
    }

    return null;
  }

  /**
   * Loads the cursor rules file if it exists
   * @param directory - The directory to look in
   * @returns The contents of the cursor rules file or null if not found
   */
  async loadGuidelines(): Promise<string | null> {
    const guidelinesPaths = [
      './sirai/guidelines/index.md',
      './cursor/rules/*.mdc',
      './junie/guidelines.md'
    ];
    let guidelinesContent = '';

    for (const filePath of guidelinesPaths) {
      try {
        if (filePath.endsWith('.md')) {
          if (fs.existsSync(filePath)) {
            guidelinesContent += fs.readFileSync(filePath, 'utf8');
            break;
          }
        } else if (filePath.endsWith('*.mdc')) {
          const dir = path.dirname(filePath);
          const files = fs.readdirSync(dir).filter(file => file.endsWith('.mdc'));
          for (const file of files) {
            guidelinesContent += fs.readFileSync(path.join(dir, file), 'utf8') + '\n';
          }

          if (files.length > 0) {
            break;
          }
        }
      } catch (error) {
        console.error(`Error reading guidelines file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return guidelinesContent || null;
  }

  /**
   * Gets the project context
   * @returns The project context
   */
  async getProjectContext(): Promise<ProjectContextData> {
    const currentDir = this.getCurrentDirectory();
    const projectRoot = this.findProjectRoot(currentDir) || currentDir;
    const guidelines = await this.loadGuidelines();

    return {
      guidelines,
      currentDirectory: currentDir,
      projectRoot,
    };
  }

  async createContextString(): Promise<string> {
    const context = await this.getProjectContext();
    let contextString = '';

    if (context.guidelines) {
      contextString += `<project_specific_guidelines>${context.guidelines}</project_specific_guidelines>`;
    }

    return contextString;
  }
}
