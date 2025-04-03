import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { LLMFactory } from '../llm/factory.js';
import { CodeRenderer } from '../utils/code-renderer.js';
import { ProjectContext } from '../utils/project-context.js';
import { PromptManager } from '../utils/prompt-manager.js';
import { AppConfig } from '../config/config.js';
import { BaseLLM } from '../llm/base.js';

/**
 * Interface for command options
 */
export interface CommandOptions {
  local?: boolean; // Deprecated: Use provider instead
  remote?: boolean; // Deprecated: Use provider instead
  provider?: string; // Specific provider to use
  preferredProvider?: string; // Preferred provider to use if available
  execute?: boolean;
  [key: string]: any;
}

/**
 * Interface for code block
 */
interface CodeBlock {
  code: string;
  language: string;
}

/**
 * Executes a prompt from a file
 * @param promptFile - The path to the prompt file
 * @param options - Command options
 * @param config - The configuration
 */
export async function executePromptFromFile(
  promptFile: string, 
  options: CommandOptions, 
  config: AppConfig
): Promise<void> {
  // Initialize utilities
  const codeRenderer = new CodeRenderer(config);
  const projectContext = new ProjectContext(config);
  const promptManager = new PromptManager(config);

  // Get LLM options
  const llmOptions = {
    providerName: options.provider,
    preferredProvider: options.preferredProvider
  };

  // Try to get the LLM
  let llm: BaseLLM;
  const spinner = ora('Initializing LLM...').start();

  try {
    llm = await LLMFactory.getBestLLM(config, llmOptions);
    spinner.succeed(`Using ${llm.constructor.name}`);
  } catch (error) {
    if (error instanceof Error) {
      spinner.fail(`Error initializing LLM: ${error.message}`);
    } else {
      spinner.fail('Error initializing LLM: Unknown error');
    }
    return;
  }

  // Load the prompt file
  let promptContent: string;
  try {
    // Check if the file exists
    const filePath = path.resolve(promptFile);
    if (!fs.existsSync(filePath)) {
      // Try to load from prompt manager
      const loadedPrompt = promptManager.loadPrompt(promptFile);

      if (!loadedPrompt) {
        throw new Error(`File not found: ${promptFile}`);
      }

      promptContent = loadedPrompt;
      console.log(chalk.yellow(`Loaded prompt: ${promptFile}`));
    } else {
      promptContent = fs.readFileSync(filePath, 'utf8');
      console.log(chalk.yellow(`Loaded file: ${filePath}`));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error loading prompt file: ${error.message}`));
    } else {
      console.error(chalk.red('Error loading prompt file: Unknown error'));
    }
    return;
  }

  // Process the prompt to replace prompt references
  promptContent = promptManager.processMessage(promptContent);

  // Get project context
  const contextString = projectContext.createContextString();

  // Create the full prompt with context
  let fullPrompt = '';

  // Add context if available
  if (contextString) {
    fullPrompt += `${contextString}\n`;
  }

  // Add the prompt content
  fullPrompt += promptContent;

  // Generate response
  try {
    console.log(chalk.blue('\nGenerating response...'));


    let response = '';
    await llm.generateStream(undefined, fullPrompt,  (chunk) => {
      response += chunk;
      const renderedChunk = codeRenderer.renderCodeBlocks(chunk);
      process.stdout.write(renderedChunk);
    });

    console.log('\n');

    // Extract and execute code blocks if requested
    if (options.execute) {
      await executeCodeBlocks(codeRenderer.extractCodeBlocks(response));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\nError generating response: ${error.message}`));
    } else {
      console.error(chalk.red('\nError generating response: Unknown error'));
    }
  }
}

/**
 * Executes code blocks
 * @param codeBlocks - The code blocks to execute
 */
async function executeCodeBlocks(codeBlocks: CodeBlock[]): Promise<void> {
  if (codeBlocks.length === 0) {
    console.log(chalk.yellow('No code blocks to execute'));
    return;
  }

  console.log(chalk.yellow(`\nFound ${codeBlocks.length} code block(s) to execute`));

  for (let i = 0; i < codeBlocks.length; i++) {
    const { code, language } = codeBlocks[i];

    console.log(chalk.cyan(`\nExecuting code block ${i + 1} (${language}):`));

    try {
      // For now, we'll just log the code that would be executed
      // In a real implementation, we would execute the code based on the language
      console.log(chalk.gray('Code execution is not implemented yet'));
      console.log(chalk.gray('Would execute:'));
      console.log(code);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error executing code block: ${error.message}`));
      } else {
        console.error(chalk.red('Error executing code block: Unknown error'));
      }
    }
  }
}
