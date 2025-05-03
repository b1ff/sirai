import chalk from 'chalk';
import ora, { Ora } from 'ora';
import inquirer from 'inquirer';
import { BaseLLM } from '../../llm/base.js';
import { LlmRequest } from '../../llm/LlmRequest.js';
import { MarkdownRenderer } from '../../utils/markdown-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { WriteFileTool, PatchFileTool, ReadFileTool, BaseTool, ListFilesTool } from '../../llm/tools/index.js';
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
    2. ANALYZE the existing code to fully understand context before making changes
    3. ADHERE strictly to any file paths, module names, and interface definitions provided
    4. IMPLEMENT code consistent with the existing project patterns and styles using provided tools
    5. VERIFY implementation meets all verification criteria specified in the task
    6. PROVIDE implementation details in the last message after completing the task

  ## CODE INTEGRITY PRINCIPLES
    - PRESERVE COMPILABILITY: Ensure code remains in a compilable state after every modification
    - FOLLOW DEPENDENCY ORDER: Implement foundation components before their dependents
    - USE SCAFFOLDING FIRST: For complex changes, first implement minimal structure that maintains compilation
    - DEFENSIVE IMPLEMENTATION: Include proper error handling, input validation, and defensive coding practices
    - MAINTAIN CONSISTENCY: Match existing code style, patterns, and naming conventions exactly
    - INCLUDE PROPER TYPING: Ensure all new code has appropriate type annotations where used in the project
    - PRESERVE EXISTING BEHAVIOR: For modifications, ensure existing functionality continues to work

  ## IMPLEMENTATION GUIDELINES
    - USE the provided file system tools to write or modify files. Prefer batch modifications within one tool call when possible
    - EXAMINE existing files before modifying them to understand their structure and patterns
    - ALWAYS choose to call tools to make modifications - do not output outside tools calls, it won't be used
    - MAINTAIN the exact interfaces specified to ensure correct integration
    - RESPECT any dependencies mentioned in the task specification
    - FOLLOW verification criteria defined in the subtask to confirm implementation is correct
    - WHEN MODIFYING FILES:
        - Preserve existing imports, comments, and formatting
    - Match indentation style of the existing file
    - Add/modify only what's required by the specification
    - IF parts of the specification are ambiguous, make your best judgment based on the context provided and note your assumptions

  ## ERROR HANDLING
    - IF a modification would break compilation or runtime behavior, stop and analyze the issue
    - IF the issue can be fixed within the scope of the task, fix it and note the fix in your implementation details
    - IF the issue cannot be fixed within the scope of the task, describe the issue clearly in your implementation details
    - IF you encounter unexpected file content or missing files, examine the project structure and context to identify the correct approach

  ## VERIFICATION PROCESS
    - AFTER implementing each file change, review it against the verification criteria in the task
    - VERIFY changes don't introduce new errors in the codebase
    - CHECK for common issues like:
        - Missing imports
    - Incorrect function signatures
    - Type mismatches
    - Syntax errors
    - Improper error handling
    - Edge case handling

  ## IMPLEMENTATION DETAILS FORMAT
    After completing the task, provide implementation details in the last message with the following structure:

    1. SUMMARY: Brief overview of what was implemented
    2. FILES MODIFIED: List of all files created or modified
    3. IMPLEMENTATION DECISIONS: Any decisions made where the specification was ambiguous
    4. VERIFICATION RESULTS: Results of following the verification criteria
    5. POTENTIAL ISSUES: Any concerns or edge cases that might need attention in future tasks
    6. DEPENDENCIES: Any requirements for subsequent tasks that depend on this implementation
        `;
    }

    public async executeTask(prompt: string, userInput: string, llm: BaseLLM, taskId: string,
        allowRead: boolean = true
    ): Promise<{ success: boolean; implementationDetails: ImplementationDetails }> {
        console.log(chalk.blue('\nExecuting task...'));
        console.log(chalk.cyan(`Using ${llm.getProviderWithModel()}`));
        const spinner = ora('Thinking...').start();
        try {
            const projectDir = (await this.projectContext.getProjectContext()).projectRoot;
            let tools = this.createTools(projectDir, spinner, allowRead);

            // Create LlmRequest instance
            const llmRequest = new LlmRequest()
                .withPrompt(prompt)
                .withUserMessage(`<user_input>${userInput}</user_input>`)
                .withTools(tools);
                
            // Use generateFrom method with LlmRequest instead of direct generate call
            const response = await llm.generateFrom(llmRequest);

            spinner.stop();
            console.log(chalk.green('\nTask executed successfully'));
            console.log(chalk.blue('\nAssistant:'));
            process.stdout.write(this.markdownRenderer.render(response));

            // Return success and the response as implementation details
            return {
                success: true,
                implementationDetails: {
                    taskid: taskId,
                    content: response
                }
            };
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`Error executing task: ${error instanceof Error ? error.message : 'Unknown error'}`));
            return {
                success: false,
                implementationDetails: {
                    taskid: taskId,
                    content: ''
                }
            };
        }
    }

    private createTools(projectDir: string, spinner: Ora, allowRead: boolean) {
        let tools: BaseTool[] = [
            new PatchFileTool(projectDir),
            new WriteFileTool(projectDir, async (filePath, content) => {
                spinner.stop();
                const { confirmation } = await inquirer.prompt<{confirmation: string}>([
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
        ];

        if (allowRead) {
            tools.push(
                new ListFilesTool(projectDir),
                new ReadFileTool(projectDir));
        }
        return tools;
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
            console.log(chalk.yellow(`\nExecuting Task ${i + 1}/${orderedSubtasks.length}: ${subtask.specification}`));

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
                            return `## Implementation Details from Dependency: ${task.id}\n${task.implementationDetails.content}`;
                        }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n\n');
            }

            const userInput = `${subtask.specification}\n${fileContents}\n${dependencyDetails}`;

            // Add retry logic for individual subtasks
            let success = false;
            let retryCount = 0;
            const maxRetries = 5;
            let implementationDetails: ImplementationDetails = { taskid: subtask.id, content: '' };

            while (!success && retryCount < maxRetries) {
                if (retryCount > 0) {
                    console.log(chalk.yellow(`Retrying task ${i + 1}/${orderedSubtasks.length} (Attempt ${retryCount + 1}/${maxRetries})...`));
                }

                // Use the refactored executeTask method which now uses LlmRequest
                const result = await this.executeTask(taskPrompt, userInput, llm, subtask.id);
                success = result.success;
                implementationDetails = result.implementationDetails;

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

            // Store implementation details in the subtask
            subtask.implementationDetails = implementationDetails;

            // Mark subtask as COMPLETED and add to history
            subtask.status = TaskStatus.COMPLETED;

            // Create a minimal TaskPlan from the subtask to pass to addCompletedTask
            const taskPlan: TaskPlan = {
                originalRequest: subtask.specification,
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
            return `${index + 1}. ${statusIcon} [${subtask.status}] ${subtask.specification}`;
        }).join('\n')}

The files have been created/modified as requested.`;

        // Display the summary
        console.log(chalk.blue('\nAssistant:'));
        process.stdout.write(this.markdownRenderer.render(summary));
        console.log('\n');

        return true;
    }
}
