import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, TrustedCommandsConfig } from './base.js';

const execAsync = promisify(exec);

/**
 * Tool for running processes
 * Implements permission system for command execution
 */
export class RunProcessTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'run_process';

  /**
   * The description of the tool
   */
  description = 'Run a process with the given command. Requires permission for non-trusted commands.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    /**
     * The command to execute
     */
    command: z.string().describe('The command to execute'),
    
    /**
     * The timeout in milliseconds
     * @default 30000 (30 seconds)
     */
    timeout: z.number().optional().default(30000)
      .describe('The timeout in milliseconds')
  });

  /**
   * The trusted commands configuration
   */
  private config: TrustedCommandsConfig;

  /**
   * The function to prompt for user approval
   */
  private promptForApproval: (command: string) => Promise<boolean>;

  /**
   * Constructor
   * @param config - The trusted commands configuration
   * @param promptForApproval - Function to prompt for user approval
   */
  constructor(
    config: TrustedCommandsConfig,
    promptForApproval: (command: string) => Promise<boolean>
  ) {
    super();
    this.config = config;
    this.promptForApproval = promptForApproval;
  }

  /**
   * Check if a command is trusted
   * @param command - The command to check
   * @returns True if the command is trusted
   */
  private isTrustedCommand(command: string): boolean {
    return this.config.trustedCommands.some(trustedCommand => {
      // Check if the command starts with a trusted command
      // This allows for trusted commands with arguments
      return command.startsWith(trustedCommand);
    });
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The output of the command
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Parse and validate arguments
      const { command, timeout } = this.parameters.parse(args);
      
      // Check if the command is trusted
      const isTrusted = this.isTrustedCommand(command);
      
      // If the command is not trusted, prompt for approval
      if (!isTrusted) {
        const approved = await this.promptForApproval(command);
        if (!approved) {
          return 'Command execution was not approved by the user.';
        }
      }
      
      // Execute the command with timeout
      const { stdout, stderr } = await Promise.race([
        execAsync(command),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Command timed out after ${timeout}ms`));
          }, timeout);
        })
      ]);
      
      // Return the output
      if (stderr) {
        return `Command executed with warnings:\n${stdout}\n\nWarnings:\n${stderr}`;
      }
      
      return stdout;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to execute command: ${error.message}`);
      }
      throw new Error('Failed to execute command: Unknown error');
    }
  }
}
