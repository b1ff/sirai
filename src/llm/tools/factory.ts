import { BaseTool } from './base.js';
import { ReadFileTool } from './read-file.js';
import { RunProcessTool } from './run-process.js';
import { FindFilesTool } from './find-files.js';
import { WriteFileTool } from './write-file.js';
import { ToolsConfig, defaultToolsConfig } from './config.js';

/**
 * Factory for creating tools
 */
export class ToolsFactory {
  /**
   * Create a ReadFileTool
   * @param config - The tools configuration
   * @returns A ReadFileTool instance
   */
  static createReadFileTool(config: ToolsConfig = defaultToolsConfig): ReadFileTool {
    return new ReadFileTool(config.workingDir);
  }

  /**
   * Create a RunProcessTool
   * @param config - The tools configuration
   * @param promptForApproval - Function to prompt for user approval
   * @returns A RunProcessTool instance
   */
  static createRunProcessTool(
    config: ToolsConfig = defaultToolsConfig,
    promptForApproval: (command: string) => Promise<boolean>
  ): RunProcessTool {
    return new RunProcessTool(config.trustedCommands, promptForApproval);
  }

  /**
   * Create a FindFilesTool
   * @param config - The tools configuration
   * @returns A FindFilesTool instance
   */
  static createFindFilesTool(config: ToolsConfig = defaultToolsConfig): FindFilesTool {
    return new FindFilesTool(config.workingDir);
  }

  /**
   * Create a WriteFileTool
   * @param config - The tools configuration
   * @param promptForApproval - Function to prompt for user approval
   * @returns A WriteFileTool instance
   */
  static createWriteFileTool(
    config: ToolsConfig = defaultToolsConfig,
    promptForApproval: (filePath: string, content: string) => Promise<boolean>
  ): WriteFileTool {
    return new WriteFileTool(config.workingDir, promptForApproval);
  }

  /**
   * Create all tools
   * @param config - The tools configuration
   * @param promptForCommandApproval - Function to prompt for command approval
   * @param promptForFileWriteApproval - Function to prompt for file write approval
   * @returns An array of all tools
   */
  static createAllTools(
    config: ToolsConfig = defaultToolsConfig,
    promptForCommandApproval: (command: string) => Promise<boolean>,
    promptForFileWriteApproval: (filePath: string, content: string) => Promise<boolean>
  ): BaseTool[] {
    return [
      this.createReadFileTool(config),
      this.createRunProcessTool(config, promptForCommandApproval),
      this.createFindFilesTool(config),
      this.createWriteFileTool(config, promptForFileWriteApproval)
    ];
  }
}
