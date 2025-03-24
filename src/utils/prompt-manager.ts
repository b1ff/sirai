import fs from 'fs-extra';
import path from 'path';
import { getPromptsDir } from '../config/config.js';
import { AppConfig } from '../config/config.js';

/**
 * Manages prompts
 */
export class PromptManager {
  private config: AppConfig;
  private promptsDir: string;

  /**
   * Constructor
   * @param config - The configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.promptsDir = getPromptsDir();
    
    // Ensure the prompts directory exists
    fs.ensureDirSync(this.promptsDir);
  }

  /**
   * Gets the list of available prompts
   * @returns The list of prompt names
   */
  getPromptList(): string[] {
    try {
      const files = fs.readdirSync(this.promptsDir);
      return files
        .filter(file => file.endsWith('.txt') || file.endsWith('.md'))
        .map(file => path.basename(file, path.extname(file)));
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error reading prompts directory: ${error.message}`);
      } else {
        console.error('Error reading prompts directory: Unknown error');
      }
      return [];
    }
  }

  /**
   * Gets the path to a prompt file
   * @param name - The name of the prompt
   * @returns The path to the prompt file or null if not found
   */
  getPromptPath(name: string): string | null {
    // Check for exact match with extension
    const exactPath = path.join(this.promptsDir, name);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }
    
    // Check for .txt extension
    const txtPath = path.join(this.promptsDir, `${name}.txt`);
    if (fs.existsSync(txtPath)) {
      return txtPath;
    }
    
    // Check for .md extension
    const mdPath = path.join(this.promptsDir, `${name}.md`);
    if (fs.existsSync(mdPath)) {
      return mdPath;
    }
    
    return null;
  }

  /**
   * Loads a prompt
   * @param name - The name of the prompt
   * @returns The prompt content or null if not found
   */
  loadPrompt(name: string): string | null {
    const promptPath = this.getPromptPath(name);
    
    if (!promptPath) {
      return null;
    }
    
    try {
      return fs.readFileSync(promptPath, 'utf8');
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error reading prompt file: ${error.message}`);
      } else {
        console.error('Error reading prompt file: Unknown error');
      }
      return null;
    }
  }

  /**
   * Saves a prompt
   * @param name - The name of the prompt
   * @param content - The prompt content
   * @returns True if the prompt was saved successfully
   */
  savePrompt(name: string, content: string): boolean {
    try {
      // Add .txt extension if not provided
      const promptName = name.endsWith('.txt') || name.endsWith('.md')
        ? name
        : `${name}.txt`;
      
      const promptPath = path.join(this.promptsDir, promptName);
      fs.writeFileSync(promptPath, content, 'utf8');
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error saving prompt: ${error.message}`);
      } else {
        console.error('Error saving prompt: Unknown error');
      }
      return false;
    }
  }

  /**
   * Deletes a prompt
   * @param name - The name of the prompt
   * @returns True if the prompt was deleted successfully
   */
  deletePrompt(name: string): boolean {
    const promptPath = this.getPromptPath(name);
    
    if (!promptPath) {
      return false;
    }
    
    try {
      fs.unlinkSync(promptPath);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error deleting prompt: ${error.message}`);
      } else {
        console.error('Error deleting prompt: Unknown error');
      }
      return false;
    }
  }

  /**
   * Processes a message to replace prompt references
   * @param message - The message to process
   * @returns The processed message
   */
  processMessage(message: string): string {
    // Replace @promptname with the prompt content
    return message.replace(/@(\w+)/g, (match, promptName) => {
      const promptContent = this.loadPrompt(promptName);
      return promptContent || match;
    });
  }
}