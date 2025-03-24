import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BaseLLM } from '../../llm/base.js';
import { CodeRenderer } from '../../utils/code-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { ListFilesTool, ReadFileTool, WriteFileTool, ListDirectoriesTool, EditFileTool } from '../../llm/tools/index.js';

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
          new ListFilesTool(projectDir),
          new ListDirectoriesTool(projectDir),
          new ReadFileTool(projectDir),
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
   * @param basePrompt - The base prompt
   * @returns Whether all tasks were executed successfully
   */
  public async executeSubtasks(
    subtasks: Array<{ id: string; taskSpecification: string }>,
    executionOrder: string[],
    llm: BaseLLM,
    basePrompt: string
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

      // Create a task-specific prompt
      const taskPrompt = `
You are working on the following task:
"""
${subtask.taskSpecification}
"""

Your current working directory is: '${process.cwd()}'

Please complete this specific task. 
Write file using tool rather than output. Keep output only summary of what was done.

${basePrompt}
`;

      // Execute the task
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
