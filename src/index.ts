#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { startInteractiveSession } from './commands/interactive.js';
import { loadConfig } from './config/config.js';

// Initialize the CLI
const program = new Command();

// Load configuration
const config = loadConfig();

program
  .name('sirai')
  .description('Development Helper CLI Tool')
  .version('1.0.0');

// Define interface for command options
interface CommandOptions {
  local?: boolean;
  remote?: boolean;
  prompt?: string;
  list?: boolean;
  set?: string;
  debug?: boolean;
  task?: string;
}

// Default command (interactive mode)
program
  .command('chat', { isDefault: true })
  .description('Start an interactive chat session with the LLM')
  .option('-l, --local', 'Use local LLM only')
  .option('-r, --remote', 'Use remote LLM only')
  .option('-p, --prompt <name>', 'Use a stored prompt')
  .option('-d, --debug', 'Enable debug mode')
  .action(async (options: CommandOptions) => {
    try {
      await startInteractiveSession(options, config);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('An unknown error occurred'));
      }
      process.exit(1);
    }
  });

// Execute prompt from file
program
  .command('exec <promptFile>')
  .description('Execute a prompt from a file')
  .option('-l, --local', 'Use local LLM only')
  .option('-r, --remote', 'Use remote LLM only')
  .action(async (promptFile: string, options: CommandOptions) => {
    try {
      const { executePromptFromFile } = await import('./commands/execute.js');
      await executePromptFromFile(promptFile, options, config);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('An unknown error occurred'));
      }
      process.exit(1);
    }
  });

// Configure settings
program
  .command('config')
  .description('Configure settings')
  .option('-l, --list', 'List current configuration')
  .option('-s, --set <key=value>', 'Set a configuration value')
  .action(async (options: CommandOptions) => {
    try {
      const { configureSettings } = await import('./commands/configure.js');
      await configureSettings(options, config);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('An unknown error occurred'));
      }
      process.exit(1);
    }
  });

// Execute task directly
program
  .command('task')
  .description('Execute a task directly')
  .option('-l, --local', 'Use local LLM only')
  .option('-r, --remote', 'Use remote LLM only')
  .option('-d, --debug', 'Enable debug mode')
  .argument('<task>', 'Task specification to execute')
  .action(async (task: string, options: CommandOptions) => {
    try {
      const { executeTaskDirectly } = await import('./commands/execute-task.js');
      options.task = task;
      await executeTaskDirectly(options, config);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('An unknown error occurred'));
      }
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);
