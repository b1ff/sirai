import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BaseLLM } from '../../llm/base.js';
import { CodeRenderer } from '../../utils/code-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { WriteFileTool, EditFileTool } from '../../llm/tools/index.js';
import { FileToRead } from '../../task-planning/schemas.js';
import { FileSourceLlmPreparation } from '../../llm/tools/file-source-llm-preparation.js';

/**
 * Class that executes tasks using the LLM
 */
export class TaskExecutor {
  private codeRenderer: CodeRenderer;
  private projectContext: ProjectContext;

  /**
   * Creates a new task executor
   * @param codeRenderer - The code renderer
   * @param projectContext - The project context
   */
  constructor(
    codeRenderer: CodeRenderer,
    projectContext: ProjectContext
  ) {
    this.codeRenderer = codeRenderer;
    this.projectContext = projectContext;
  }

  /**
   * Creates a standard task prompt
   * @param taskSpecification - The task specification
   * @param fileContents - Optional file contents to include in the prompt
   * @returns The formatted task prompt
   */
  public createTaskPrompt(taskSpecification: string, fileContents: string = ''): string {
    const projectDir = process.cwd();

    return `
You are a precise task executor. Your job is to implement exactly what has been planned in the task specification, without deviation or creative additions unless explicitly required.

<task_specification>
${taskSpecification}
</task_specification>

Current working directory: '${projectDir}'

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

${fileContents}
`;
  }

  /**
   * Executes a task using the LLM
   * @param prompt - The task prompt
   * @param llm - The LLM to use
   * @returns Whether the task was executed successfully
   */
  public async executeTask(prompt: string, llm: BaseLLM): Promise<boolean> {
    try {
      console.log(chalk.blue('\nExecuting task...'));

      // Create a spinner
      const spinner = ora('Thinking...').start();

      // Get project directory
      const projectDir = this.projectContext.getProjectContext().projectRoot;

      // Execute the task with function calling enabled
      await llm.generateStream(prompt, (chunk) => {
        spinner.info(chunk);
      }, {
        // Enable function calling
        tools: [
          new EditFileTool(projectDir),
          new WriteFileTool(projectDir, async (filePath, content) => {
            const { confirmation } = await inquirer.prompt<{ confirmation: string }>([
              {
                type: 'list',
                name: 'confirmation',
                message: `Do you accept write to ${filePath}?`,
                choices: ['Yes', 'No'],
                default: 'Yes'
              }
            ]);

            return confirmation === 'Yes';
          }),
        ],
      });

      spinner.stop();
      return true;
    } catch (error) {
      console.error(chalk.red(`Error executing task: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return false;
    }
  }


  /**
   * Executes a list of subtasks
   * @param subtasks - The subtasks to execute
   * @param executionOrder - The execution order of subtasks
   * @param llm - The LLM to use
   * @param compiledHistory - The base prompt
   * @returns Whether all tasks were executed successfully
   */
  public async executeSubtasks(
    subtasks: Array<{ id: string; taskSpecification: string; filesToRead?: FileToRead[] }>,
    executionOrder: string[],
    llm: BaseLLM,
    compiledHistory: string
  ): Promise<boolean> {
    console.log(chalk.cyan('\n--- Executing Tasks ---'));

    // Sort subtasks based on execution order
    const orderedSubtasks = [...subtasks].sort((a, b) => {
      const aIndex = executionOrder.indexOf(a.id);
      const bIndex = executionOrder.indexOf(b.id);
      return aIndex - bIndex;
    });

    // Execute each subtask
    for (let i = 0; i < orderedSubtasks.length; i++) {
      const subtask = orderedSubtasks[i];
      console.log(chalk.yellow(`\nExecuting Task ${i + 1}/${orderedSubtasks.length}: ${subtask.taskSpecification}`));

      // Get project directory
      const projectDir = this.projectContext.getProjectContext().projectRoot;

      // Pre-load file contents if files_to_read is provided
      let fileContents = '';
      if (subtask.filesToRead && subtask.filesToRead.length > 0) {
        const filePreparation = new FileSourceLlmPreparation(subtask.filesToRead, projectDir);
        fileContents = await filePreparation.renderForLlm(true); // true to include line numbers
      }

      // Create a task-specific prompt using the shared method
      const taskPrompt = this.createTaskPrompt(subtask.taskSpecification, fileContents);

      console.log(taskPrompt);

      const success = await this.executeTask(taskPrompt, llm);
      if (!success) {
        return false;
      }
    }

    console.log(chalk.cyan('\n--- All Tasks Completed ---\n'));

    // Create a summary response
    const summary = `I've completed all the tasks in the plan. Here's a summary of what was done:

${orderedSubtasks.map((subtask, index) => `${index + 1}. ${subtask.taskSpecification}`).join('\n')}

The files have been created/modified as requested.`;

    // Display the summary
    console.log(chalk.blue('\nAssistant:'));
    process.stdout.write(this.codeRenderer.renderCodeBlocks(summary));
    console.log('\n');

    return true;
  }
}
