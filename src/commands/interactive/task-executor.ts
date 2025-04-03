import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BaseLLM } from '../../llm/base.js';
import { MarkdownRenderer } from '../../utils/markdown-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { WriteFileTool, EditFileTool, PatchFileTool, RunProcessTool } from '../../llm/tools/index.js';
import { FileToRead } from '../../task-planning/schemas.js';
import { FileSourceLlmPreparation } from '../../llm/tools/file-source-llm-preparation.js';

/**
 * Class that executes tasks using the LLM
 */
export class TaskExecutor {
  private markdownRenderer: MarkdownRenderer;
  private projectContext: ProjectContext;

  /**
   * Creates a new task executor
   * @param markdownRenderer - The markdown renderer
   * @param projectContext - The project context
   */
  constructor(
    markdownRenderer: MarkdownRenderer,
    projectContext: ProjectContext
  ) {
    this.markdownRenderer = markdownRenderer;
    this.projectContext = projectContext;
  }

  public createTaskPrompt(): string {
    const projectDir = process.cwd();

    return `
You are a precise task executor working in the automation. 
Your job is to implement exactly what has been planned in the task specification, without deviation or creative additions unless explicitly required.

Current working directory: '${projectDir}'

## EXECUTION INSTRUCTIONS
1. READ the task specification completely before beginning implementation
2. ADHERE strictly to any file paths, module names, and interface definitions provided
3. IMPLEMENT code consistent with the existing project patterns and styles using provided tools

## IMPLEMENTATION GUIDELINES
- USE the provided file system tools to write, or modify files. Prefer batch modifications within one tool call when possible
- ALWAYS choose to call tools to make modifications - do not output outside tools calls, it won't be used
- MAINTAIN the exact interfaces specified to ensure correct integration
- RESPECT any dependencies mentioned in the task specification
- IF parts of the specification are ambiguous, make your best judgment based on the context provided and note your assumptions
`;
  }

  public async executeTask(prompt: string, userInput: string, llm: BaseLLM): Promise<boolean> {
    try {
      console.log(chalk.blue('\nExecuting task...'));

      // Display provider and model information
      console.log(chalk.cyan(`Using ${llm.getProviderWithModel()}`));

      // Create a spinner
      const spinner = ora('Thinking...').start();

      // Get project directory
      const projectDir = this.projectContext.getProjectContext().projectRoot;

      // Execute the task with function calling enabled
      const response = await llm.generate(undefined, `${prompt}\n<user_input>${userInput}</user_input>`, {
        // Enable function calling
        tools: [
          // new EditFileTool(projectDir),
          new PatchFileTool(projectDir),
          new WriteFileTool(projectDir, async (filePath, content) => {
            spinner.stop();
            const { confirmation } = await inquirer.prompt<{ confirmation: string }>([
              {
                type: 'list',
                name: 'confirmation',
                message: `Do you accept write to ${filePath}?`,
                choices: ['Yes', 'No'],
                default: 'Yes'
              }
            ]);

            spinner.start("Thinking...");
            return confirmation === 'Yes';
          }),
        ],
      });

      spinner.stop();
      console.log(chalk.green('\nTask executed successfully'));
      console.log(chalk.blue('\nAssistant:'));
      process.stdout.write(this.markdownRenderer.render(response));
      return true;
    } catch (error) {
      console.error(chalk.red(`Error executing task: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return false;
    }
  }

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

    // Display provider and model information
    console.log(chalk.cyan(`Using ${llm.getProviderWithModel()} for all tasks`));

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
      const taskPrompt = this.createTaskPrompt();

      const userInput = `${subtask.taskSpecification}\n${fileContents}`;
      
      // Add retry logic for individual subtasks
      let success = false;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!success && retryCount < maxRetries) {
        if (retryCount > 0) {
          console.log(chalk.yellow(`Retrying task ${i + 1}/${orderedSubtasks.length} (Attempt ${retryCount + 1}/${maxRetries})...`));
        }
        
        success = await this.executeTask(taskPrompt, userInput, llm);
        
        if (!success) {
          retryCount++;
          if (retryCount >= maxRetries) {
            console.error(chalk.red(`Failed to execute task after ${maxRetries} attempts, moving to next task`));
          }
        }
      }
      
      // If all retries failed for this subtask, return false to indicate failure
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
    process.stdout.write(this.markdownRenderer.render(summary));
    console.log('\n');

    return true;
  }

  public async validateTaskExecution(validationInstructions: string, executedTaskPlan: string, llm: BaseLLM): Promise<{ passed: boolean, feedback: string }> {
    try {
      console.log(chalk.blue('\nValidating task execution...'));

      // Display provider and model information
      console.log(chalk.cyan(`Using ${llm.getProviderWithModel()} for validation`));

      // Create a spinner
      const spinner = ora('Validating...').start();

      // Get project directory
      const projectDir = this.projectContext.getProjectContext().projectRoot;

      // Execute the validation with function calling enabled
      const response = await llm.generate(undefined, `${validationInstructions}\n<executed_task_plan>${executedTaskPlan}</executed_task_plan>`, {
        // Enable function calling
        tools: [
          new RunProcessTool({ trustedCommands: [] }, async (command: string) => {
            spinner.stop();
            const { confirmation } = await inquirer.prompt<{ confirmation: string }>([
              {
                type: 'list',
                name: 'confirmation',
                message: `Do you approve running the command: ${command}?`,
                choices: ['Yes', 'No'],
                default: 'Yes'
              }
            ]);

            spinner.start("Validating...");
            return confirmation === 'Yes';
          })
        ],
      });

      spinner.stop();
      console.log(chalk.green('\nValidation completed'));

      // Parse the response to determine if validation passed or failed
      const validationPassed = response.includes('Validation Passed');
      const feedback = this.markdownRenderer.render(response);

      return { passed: validationPassed, feedback };
    } catch (error) {
      console.error(chalk.red(`Error during validation: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return { passed: false, feedback: 'Validation failed due to an error.' };
    }
  }
}
