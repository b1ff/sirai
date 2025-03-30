import chalk from 'chalk';
import ora from 'ora';
import { AppConfig } from '../config/config.js';
import { LLMFactory } from '../llm/factory.js';
import { CodeRenderer } from '../utils/code-renderer.js';
import { ProjectContext } from '../utils/project-context.js';
import { TaskExecutor } from './interactive/task-executor.js';

/**
 * Interface for command options
 */
interface CommandOptions {
  local?: boolean;
  remote?: boolean;
  prompt?: string;
  debug?: boolean;
  task?: string;
  [key: string]: any;
}

/**
 * Executes a task directly without going through the interactive session
 * @param options - Command options
 * @param config - The configuration
 */
export async function executeTaskDirectly(options: CommandOptions, config: AppConfig): Promise<void> {
  console.log(chalk.cyan('Executing task directly...'));

  if (!options.task) {
    throw new Error('No task specified');
  }

  // Initialize LLM
  const spinner = ora('Initializing LLM...').start();

  // Get LLM options
  const llmOptions = {
    localOnly: options.local,
    remoteOnly: options.remote,
    preferLocal: !options.remote
  };

  try {
    const llm = await LLMFactory.getBestLLM(config, llmOptions);
    spinner.succeed(`Using ${llm.provider}`);

    // Create code renderer and project context
    const codeRenderer = new CodeRenderer(config);
    const projectContext = new ProjectContext(config);

    // Create task executor
    const taskExecutor = new TaskExecutor(codeRenderer, projectContext);

    // Execute the task
    console.log(chalk.blue('\nExecuting task...'));
    console.log(chalk.yellow(`Task: ${options.task}`));

    const taskPrompt = `
You are a precise task executor. Your job is to implement exactly what has been planned in the task specification, without deviation or creative additions unless explicitly required.

<task_specification>
${options.task}
</task_specification>

Current working directory: '${process.cwd()}'

## EXECUTION INSTRUCTIONS
1. READ the task specification completely before beginning implementation
2. FOLLOW all implementation steps in the exact order specified
3. ADHERE strictly to any file paths, module names, and interface definitions provided
4. IMPLEMENT code consistent with the existing project patterns and styles
5. VERIFY your implementation against the provided testing criteria

## IMPLEMENTATION GUIDELINES
- USE the provided file system tools to write, or modify files
- ALWAYS choose to call tools to make modifications - do not output outside tools calls, it won't be used
- MAINTAIN the exact interfaces specified to ensure correct integration
- RESPECT any dependencies mentioned in the task specification
- IF parts of the specification are ambiguous, make your best judgment based on the context provided and note your assumptions
`;

    const success = await taskExecutor.executeTask(taskPrompt, llm);

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
