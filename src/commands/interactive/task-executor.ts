import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BaseLLM } from '../../llm/base.js';
import { MarkdownRenderer } from '../../utils/markdown-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { WriteFileTool, PatchFileTool } from '../../llm/tools/index.js';
import { Subtask, TaskPlan, ImplementationDetails } from '../../task-planning/schemas.js';
import { TaskStatus } from '../interactive/task-types.js';
import { TaskHistoryManager } from '../../utils/task-history-manager.js';
import { FileSourceLlmPreparation } from '../../llm/tools/file-source-llm-preparation.js';

/**
 * Class that executes tasks using the LLM
 */
export class TaskExecutor {
  private markdownRenderer: MarkdownRenderer;
  private projectContext: ProjectContext;
  private taskHistoryManager: TaskHistoryManager;

  constructor(
    markdownRenderer: MarkdownRenderer,
    projectContext: ProjectContext,
    taskHistoryManager: TaskHistoryManager
  ) {
    this.markdownRenderer = markdownRenderer;
    this.projectContext = projectContext;
    this.taskHistoryManager = taskHistoryManager;
  }

  public async createTaskPrompt(): Promise<string> {
    const projectDir = process.cwd();

    const projectContextString = await this.projectContext.createContextString();

    return `
You are a precise task executor working in the automation. 
Your job is to implement exactly what has been planned in the task specification, without deviation or creative additions unless explicitly required.

Current working directory: '${projectDir}'

${projectContextString}

## EXECUTION INSTRUCTIONS
1. READ the task specification completely before beginning implementation
2. ADHERE strictly to any file paths, module names, and interface definitions provided
3. IMPLEMENT code consistent with the existing project patterns and styles using provided tools
4. PROVIDE implementation details in the specified format after completing the task

## IMPLEMENTATION GUIDELINES
- USE the provided file system tools to write, or modify files. Prefer batch modifications within one tool call when possible
- ALWAYS choose to call tools to make modifications - do not output outside tools calls, it won't be used
- MAINTAIN the exact interfaces specified to ensure correct integration
- RESPECT any dependencies mentioned in the task specification
- IF parts of the specification are ambiguous, make your best judgment based on the context provided and note your assumptions

## IMPLEMENTATION DETAILS FORMAT
After completing the task, provide implementation details in the following format:

\`\`\`markdown
## Implementation Details

### Modified/Created Files
- /path/to/file1 - Brief description of changes
- /path/to/file2 - Brief description of changes

### Public Interfaces
\`\`\`typescript
// Document any new or modified public interfaces
// Include method signatures and types
\`\`\`

### Additional Context
- Important implementation details
- Dependencies or configurations added
- Patterns or approaches used
- Information needed for future tasks
\`\`\`

These details will be used by dependent tasks, so be thorough and precise.
`;
  }

  private parseImplementationDetails(response: string): ImplementationDetails | undefined {
    try {
      const modifiedFilesMatch = response.match(/### Modified\/Created Files\n([\s\S]*?)(?=###|$)/);
      const publicInterfacesMatch = response.match(/### Public Interfaces\n\`\`\`typescript\n([\s\S]*?)\`\`\`/);
      const additionalContextMatch = response.match(/### Additional Context\n([\s\S]*?)(?=```|$)/);

      if (!modifiedFilesMatch && !publicInterfacesMatch && !additionalContextMatch) {
        return undefined;
      }

      const implementationDetails: ImplementationDetails = {
        modifiedFiles: [],
        publicInterfaces: [],
        additionalContext: []
      };

      if (modifiedFilesMatch) {
        const filesText = modifiedFilesMatch[1];
        implementationDetails.modifiedFiles = filesText
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => {
            const [path, ...description] = line.replace('-', '').trim().split(' - ');
            return {
              path: path.trim(),
              description: description.join(' - ').trim()
            };
          });
      }

      if (publicInterfacesMatch) {
        const interfacesText = publicInterfacesMatch[1];
        // Simple parsing of interfaces - can be enhanced based on needs
        implementationDetails.publicInterfaces = interfacesText
          .split('\n')
          .filter(line => line.trim() && !line.trim().startsWith('//'))
          .map(line => ({
            name: line.split('(')[0].trim(),
            type: 'interface',
            signature: line.trim()
          }));
      }

      if (additionalContextMatch) {
        const contextText = additionalContextMatch[1];
        implementationDetails.additionalContext = contextText
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => {
            const [key, ...value] = line.replace('-', '').trim().split(':');
            return {
              key: key.trim(),
              value: value.join(':').trim()
            };
          });
      }

      return implementationDetails;
    } catch (error) {
      console.error('Error parsing implementation details:', error);
      return undefined;
    }
  }

  public async executeTask(prompt: string, userInput: string, llm: BaseLLM): Promise<boolean> {
    console.log(chalk.blue('\nExecuting task...'));

    // Display provider and model information
    console.log(chalk.cyan(`Using ${llm.getProviderWithModel()}`));

    // Create a spinner
    const spinner = ora('Thinking...').start();
    try {
      // Get project directory
      const projectDir = (await this.projectContext.getProjectContext()).projectRoot;

      // Execute the task with function calling enabled
      const response = await llm.generate(undefined, `${prompt}\n<user_input>${userInput}</user_input>`, {
        tools: [
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

      // Parse and return implementation details
      const implementationDetails = this.parseImplementationDetails(response);
      return implementationDetails !== undefined;
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Error executing task: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return false;
    }
  }

  public async executeSubtasks(
    subtasks: Subtask[],
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

      // Mark subtask as IN_PROGRESS
      subtask.status = TaskStatus.IN_PROGRESS;
      console.log(chalk.yellow(`\nExecuting Task ${i + 1}/${orderedSubtasks.length}: ${subtask.taskSpecification}`));

      // Get project directory
      const projectDir = (await this.projectContext.getProjectContext()).projectRoot;

      // Pre-load file contents if files_to_read is provided
      let fileContents = '';
      if (subtask.filesToRead && subtask.filesToRead.length > 0) {
        const filePreparation = new FileSourceLlmPreparation(subtask.filesToRead, projectDir);
        fileContents = await filePreparation.renderForLlm(false);
      }

      // Create a task-specific prompt using the shared method
      const taskPrompt = await this.createTaskPrompt();

      // Include implementation details from dependencies
      let dependencyDetails = '';
      if (subtask.dependencies && subtask.dependencies.length > 0) {
        const dependencyTasks = orderedSubtasks.filter(t => subtask.dependencies.includes(t.id));
        dependencyDetails = dependencyTasks
          .map(task => {
            if (task.implementationDetails) {
              return `## Implementation Details from Dependency: ${task.id}\n${JSON.stringify(task.implementationDetails, null, 2)}`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n\n');
      }

      const userInput = `${subtask.taskSpecification}\n${fileContents}\n${dependencyDetails}`;

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

      // If all retries failed for this subtask, mark as FAILED and return false
      if (!success) {
        subtask.status = TaskStatus.FAILED;
        return false;
      }

      // Mark subtask as COMPLETED and add to history
      subtask.status = TaskStatus.COMPLETED;

      // Create a minimal TaskPlan from the subtask to pass to addCompletedTask
      const taskPlan: TaskPlan = {
        originalRequest: subtask.taskSpecification,
        overallComplexity: subtask.complexity,
        subtasks: [subtask],
        executionOrder: [subtask.id],
        implementationDetails: subtask.implementationDetails,
        completedAt: Date.now()
      };
      this.taskHistoryManager.addCompletedTask(taskPlan);
    }

    console.log(chalk.cyan('\n--- All Tasks Completed ---\n'));

    // Create a summary response
    const summary = `I've completed all the tasks in the plan. Here's a summary of what was done:

${orderedSubtasks.map((subtask, index) => {
      const statusIcon = subtask.status === TaskStatus.COMPLETED ? '✅' : 
                        subtask.status === TaskStatus.FAILED ? '❌' : 
                        subtask.status === TaskStatus.IN_PROGRESS ? '⏳' : '⏱️';
      return `${index + 1}. ${statusIcon} [${subtask.status}] ${subtask.taskSpecification}`;
    }).join('\n')}

The files have been created/modified as requested.`;

    // Display the summary
    console.log(chalk.blue('\nAssistant:'));
    process.stdout.write(this.markdownRenderer.render(summary));
    console.log('\n');

    return true;
  }
}
