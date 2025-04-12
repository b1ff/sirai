import chalk from 'chalk';
import ora, { Ora } from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config/config.js';
import { LLMFactory } from '../llm/factory.js';
import { CodeRenderer } from '../utils/code-renderer.js';
import { ProjectContext } from '../utils/project-context.js';
import { TaskExecutor } from './interactive/task-executor.js';
import { TaskHistoryManager } from '../utils/task-history-manager.js';
import { Subtask, FileToRead } from '../task-planning/schemas.js';
import { FileSourceLlmPreparation } from '../llm/tools/index.js';
import { MarkdownRenderer } from '../utils/markdown-renderer.js';
import { BaseLLM } from '../llm/base.js';

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


export async function executeTaskDirectly(options: CommandOptions, config: AppConfig): Promise<void> {
    console.log(chalk.cyan('Executing task directly...'));

    try {
        // Extract task data
        const { taskSpecification, filesToRead } = await extractTaskData(options);

        // Initialize LLM
        const spinner = ora('Initializing LLM...').start();
        const taskType = options.taskType || 'default';

        try {
            const llm = await initializeLLM(config, options, taskType, spinner);
            await executeTask(config, llm, taskSpecification, filesToRead);
        } catch (error) {
            spinner.fail('LLM initialization failed');
            throw error;
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
    }
}

async function extractTaskData(options: CommandOptions): Promise<{
    taskSpecification: string;
    filesToRead?: FileToRead[]
}> {
    if (options.taskFile) {
        return readTaskFromFile(options.taskFile);
    }

    if (options.task) {
        return { taskSpecification: options.task };
    }

    throw new Error('No task specified. Use --task or provide a task file.');
}

async function readTaskFromFile(taskFilePath: string): Promise<{
    taskSpecification: string;
    filesToRead?: FileToRead[]
}> {
    try {
        const filePath = path.isAbsolute(taskFilePath)
            ? taskFilePath
            : path.join(process.cwd(), taskFilePath);

        console.log(chalk.blue(`Reading task from file: ${filePath}`));
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const taskData = JSON.parse(fileContent);

        if (taskData.taskSpecification) {
            return {
                taskSpecification: taskData.taskSpecification,
                filesToRead: taskData.filesToRead
            };
        }

        if (taskData.subtasks && taskData.subtasks.length > 0) {
            const subtask = taskData.subtasks[0] as Subtask;
            return {
                taskSpecification: subtask.taskSpecification,
                filesToRead: subtask.filesToRead
            };
        }

        throw new Error('Invalid task file format. Expected taskSpecification or subtasks array.');
    } catch (error) {
        throw new Error(`Failed to read task file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function initializeLLM(
    config: AppConfig,
    options: CommandOptions,
    taskType: string,
    spinner: Ora
): Promise<BaseLLM> {
    let llm: BaseLLM;

    // Check if we have a task-specific provider configuration
    if (config.taskPlanning?.providerConfig?.[taskType]) {
        const providerConfig = config.taskPlanning.providerConfig[taskType];
        llm = LLMFactory.createLLMByProvider(config, providerConfig.provider, providerConfig.model);
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
    return llm;
}

async function executeTask(
    config: AppConfig,
    llm: BaseLLM,
    taskSpecification: string,
    filesToRead?: FileToRead[]
): Promise<void> {
    // Create dependencies
    const codeRenderer = new CodeRenderer(config);
    const projectContext = new ProjectContext(config);
    const taskHistoryManager = new TaskHistoryManager(config);
    const taskExecutor = new TaskExecutor(
        new MarkdownRenderer(config, codeRenderer),
        projectContext,
        taskHistoryManager
    );

    // Log task execution
    console.log(chalk.blue('\nExecuting task...'));
    console.log(chalk.yellow(`Task: ${taskSpecification}`));

    // Prepare file contents if needed
    const fileContents = await prepareFileContents(projectContext, filesToRead);

    // Execute the task
    const taskPrompt = await taskExecutor.createTaskPrompt();
    const userInput = `${taskSpecification}\n${fileContents}`;
    const success = await taskExecutor.executeTask(taskPrompt, userInput, llm, 'task-1');

    if (success) {
        console.log(chalk.green('\nTask executed successfully'));
    } else {
        console.error(chalk.red('\nTask execution failed'));
        process.exit(1);
    }
}

async function prepareFileContents(
    projectContext: ProjectContext,
    filesToRead?: FileToRead[]
): Promise<string> {
    if (!filesToRead || filesToRead.length === 0) {
        return '';
    }

    const projectDir = (await projectContext.getProjectContext()).projectRoot;
    console.log(chalk.blue(`Reading ${filesToRead.map(f => f.path).join(', ')} file(s) for context...`));

    const filePreparation = new FileSourceLlmPreparation(filesToRead, projectDir);
    return filePreparation.renderForLlm(true);
}
