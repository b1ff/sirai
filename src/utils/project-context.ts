import fs from 'fs-extra';
import path from 'path';
import { AppConfig } from '../config/config.js';

/**
 * Interface for project context
 */
export interface ProjectContextData {
  currentDirectory: string;
  projectRoot: string;
  cursorRules: string | null;
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
  loadCursorRules(directory: string = this.getCurrentDirectory()): string | null {
    const cursorRulesPath = path.join(directory, '.cursorrules');
    
    if (fs.existsSync(cursorRulesPath)) {
      try {
        return fs.readFileSync(cursorRulesPath, 'utf8');
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error reading .cursorrules file: ${error.message}`);
        } else {
          console.error('Error reading .cursorrules file: Unknown error');
        }
      }
    }
    
    return null;
  }

  /**
   * Gets the project context
   * @returns The project context
   */
  getProjectContext(): ProjectContextData {
    const currentDir = this.getCurrentDirectory();
    const projectRoot = this.findProjectRoot(currentDir) || currentDir;
    const cursorRules = this.loadCursorRules(projectRoot);
    
    return {
      currentDirectory: currentDir,
      projectRoot,
      cursorRules
    };
  }

  /**
   * Creates a context string for the LLM
   * @returns The context string
   */
  createContextString(): string {
    const context = this.getProjectContext();
    let contextString = '';
    
    if (context.cursorRules) {
      contextString += `Project cursor rules:\n${context.cursorRules}\n\n`;
    }
    
    return contextString;
  }
}