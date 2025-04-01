import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config/config.js';
import { LLMFactory } from '../llm/factory.js';
import { CodeRenderer } from '../utils/code-renderer.js';
import { ProjectContext } from '../utils/project-context.js';
import { TaskExecutor } from './interactive/task-executor.js';
import { Subtask, FileToRead } from '../task-planning/schemas.js';
import { FileSourceLlmPreparation } from '../llm/tools/file-source-llm-preparation.js';

/**
 * Interface for command options
 */
interface CommandOptions {
  local?: boolean; // Deprecated: Use provider instead
  remote?: boolean; // Deprecated: Use provider instead
  provider?: string; // Specific provider to use
  preferredProvider?: string; // Preferred provider to use if available
  prompt?: string;
  debug?: boolean;
  task?: string;
  taskFile?: string;
  taskType?: string;
  [key: string]: any;
}

/**
 * Executes a task directly without going through the interactive session
 * @param options - Command options
 * @param config - The configuration
 */
export async function executeTaskDirectly(options: CommandOptions, config: AppConfig): Promise<void> {
  console.log(chalk.cyan('Executing task directly...'));

  let taskSpecification: string;
  let filesToRead: FileToRead[] | undefined;

  if (options.taskFile) {
    try {
      // Read task from JSON file
      const filePath = path.isAbsolute(options.taskFile) 
        ? options.taskFile 
        : path.join(process.cwd(), options.taskFile);

      console.log(chalk.blue(`Reading task from file: ${filePath}`));
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const taskData = JSON.parse(fileContent);

      // Extract task specification from the JSON
      if (taskData.taskSpecification) {
        // If the JSON contains a direct task specification
        taskSpecification = taskData.taskSpecification;
        filesToRead = taskData.filesToRead;
      } else if (taskData.subtasks && taskData.subtasks.length > 0) {
        // If the JSON contains a task plan with subtasks, use the first subtask
        const subtask = taskData.subtasks[0] as Subtask;
        taskSpecification = subtask.taskSpecification;
        filesToRead = subtask.filesToRead;
      } else {
        throw new Error('Invalid task file format. Expected taskSpecification or subtasks array.');
      }
    } catch (error) {
      throw new Error(`Failed to read task file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (options.task) {
    // Use task specification provided directly
    taskSpecification = options.task;
  } else {
    throw new Error('No task specified. Use --task or provide a task file.');
  }

  // Initialize LLM
  const spinner = ora('Initializing LLM...').start();

  // Get task type
  const taskType = options.taskType || 'default';

  try {
    let llm;

    // Check if we have a task-specific provider configuration
    if (config.taskPlanning?.providerConfig && config.taskPlanning.providerConfig[taskType]) {
      // Use the provider specified for this task type
      const providerConfig = config.taskPlanning.providerConfig[taskType];
      llm = LLMFactory.createLLMByProvider(
        config, 
        providerConfig.provider,
        providerConfig.model
      );
    } 
    // Fallback to preferredProvider if specified
    else if (config.taskPlanning?.preferredProvider) {
      llm = LLMFactory.createLLMByProvider(config, config.taskPlanning.preferredProvider);
    }
    // Otherwise use the best available LLM based on options
    else {
      const llmOptions = {
        providerName: options.provider,
        preferredProvider: options.preferredProvider
      };
      llm = await LLMFactory.getBestLLM(config, llmOptions);
    }
    spinner.succeed(`Using ${llm.getProviderWithModel()}`);

    // Create code renderer and project context
    const codeRenderer = new CodeRenderer(config);
    const projectContext = new ProjectContext(config);

    // Create task executor
    const taskExecutor = new TaskExecutor(codeRenderer, projectContext);

    // Execute the task
    console.log(chalk.blue('\nExecuting task...'));
    console.log(chalk.yellow(`Task: ${taskSpecification}`));

    // Get project directory
    const projectDir = projectContext.getProjectContext().projectRoot;

    // Pre-load file contents if filesToRead is provided
    let fileContents = '';
    if (filesToRead && filesToRead.length > 0) {
      console.log(chalk.blue(`Reading ${filesToRead.map(f => f.path).join(', ')} file(s) for context...`));
      const filePreparation = new FileSourceLlmPreparation(filesToRead, projectDir);
      fileContents = await filePreparation.renderForLlm(true);
    }

    // Create a task-specific prompt using the shared method
    const taskPrompt = taskExecutor.createTaskPrompt();

    const userInput = `${taskSpecification}\n${fileContents}`;
    const success = await taskExecutor.executeTask(taskPrompt, userInput, llm);

    if (success) {
      console.log(chalk.green('\nTask executed successfully'));
    } else {
      console.error(chalk.red('\nTask execution failed'));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('LLM initialization failed');
    throw error;
  }
}
