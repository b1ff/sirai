import { BaseLLM } from '../llm/base.js';
import { AppConfig, LLMFactory } from '../llm/factory.js';
import { FileSystemUtils } from './file-system-utils.js';
import { MarkdownRenderer } from '../utils/markdown-renderer.js';
import { ComplexityLevel, ContextProfile, LLMType, Subtask, TaskPlan } from './schemas.js';
import { PrePlanner } from './pre-planner.js';
import { v4 as uuidv4 } from 'uuid';
import {
    StorePlanTool,
    ListFilesTool,
    ListDirectoriesTool,
    ReadFileTool,
    AskUserTool,
    RunProcessTool,
    DelegateToModelTool,
    BaseTool
} from '../llm/tools/index.js';
import inquirer from 'inquirer';

/**
 * Configuration for the LLM planner
 */
export interface LLMPlannerConfig {
    maxContextSize?: number; // Maximum context size in characters
    chunkSize?: number; // Size of chunks for context management
    preferredProvider?: string; // Preferred LLM provider (openai, claude, ollama)
    taskType?: string; // Type of task (planning, coding, etc.)
    debug?: boolean; // Enable debug mode
}

/**
 * Default configuration for the LLM planner
 */
const DEFAULT_CONFIG: LLMPlannerConfig = {
    maxContextSize: 8000, // Default maximum context size
    chunkSize: 1000, // Default chunk size
    preferredProvider: 'anthropic', // Default to Anthropic
    taskType: 'planning' // Default task type
};

/**
 * Main class for LLM-based task planning
 */
export class LLMPlanner {
    private config: LLMPlannerConfig;
    private appConfig: AppConfig;
    private llm: BaseLLM | null = null;
    private markdownRenderer?: MarkdownRenderer;


    constructor(appConfig: AppConfig, config: Partial<LLMPlannerConfig> | any = {}, markdownRenderer?: MarkdownRenderer) {
        this.appConfig = appConfig;
        this.config = {
            maxContextSize: config.maxContextSize || DEFAULT_CONFIG.maxContextSize,
            chunkSize: config.chunkSize || DEFAULT_CONFIG.chunkSize,
            preferredProvider: config.preferredProvider || DEFAULT_CONFIG.preferredProvider,
            taskType: config.taskType || DEFAULT_CONFIG.taskType,
            debug: config.debug || false
        };
        this.markdownRenderer = markdownRenderer;
    }

    /**
     * Initializes the LLM
     * @returns A promise that resolves when the LLM is initialized
     */
    async initialize(): Promise<BaseLLM> {
        if (this.llm) {
            return this.llm;
        }
        try {
            // Check if we have a task-specific provider configuration
            const taskType = this.config.taskType || 'default';
            const taskPlanningConfig = this.appConfig.taskPlanning;

            if (taskPlanningConfig?.providerConfig && taskPlanningConfig.providerConfig[taskType]) {
                // Use the provider specified for this task type
                const providerConfig = taskPlanningConfig.providerConfig[taskType];
                this.llm = LLMFactory.createLLMByProvider(
                    this.appConfig,
                    providerConfig.provider,
                    providerConfig.model
                );
            }
            // Fallback to preferredProvider if specified and no task-specific provider is found
            else if (this.config.preferredProvider || taskPlanningConfig?.preferredProvider) {
                const preferredProvider = this.config.preferredProvider || taskPlanningConfig?.preferredProvider;
                if (preferredProvider) {
                    this.llm = LLMFactory.createLLMByProvider(this.appConfig, preferredProvider);
                } else {
                    // Use the best available LLM as a last resort
                    this.llm = await LLMFactory.getBestLLM(this.appConfig);
                }
            } else {
                // Use the best available LLM
                this.llm = await LLMFactory.getBestLLM(this.appConfig);
            }

            await this.llm.initialize();

            return this.llm;
        } catch (error) {
            throw new Error(`Failed to initialize LLM: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async createContextProfile(
        projectRoot: string,
        currentDirectory: string
    ): Promise<ContextProfile> {
        return FileSystemUtils.createContextProfile(projectRoot, currentDirectory);
    }

    async createTaskPlan(
        request: string,
        contextProfile: ContextProfile
    ): Promise<TaskPlan> {
        // 1. Initialize LLM if not already initialized
        if (!this.llm) {
            await this.initialize();
        }

        if (!this.llm) {
            throw new Error('Failed to initialize LLM for task planning');
        }

        // 2. Check if pre-planning is enabled
        let prePlanningResult: string | null = null;
        if (this.appConfig.taskPlanning?.prePlanning?.enabled) {
            try {
                console.log('Starting pre-planning phase...');
                const prePlanner = new PrePlanner(this.appConfig, this.markdownRenderer);
                prePlanningResult = await prePlanner.analyze(request, contextProfile);
                console.log(`Pre-planning completed`);
            } catch (error) {
                console.warn(`Pre-planning failed: ${error instanceof Error ? error.message : String(error)}`);
                // Continue with main planning even if pre-planning fails
            }
        }

        const { listFilesTool, extractPlanTool, tools } = this.getTools(contextProfile);

        // Get directory structure
        let filesStructure = 'Could not retrieve directory structure.'; // Default message
        try {
            // Use the existing listDirsTool instance
            // Note: Assuming ListDirectoriesTool has similar parameters to ListFilesTool
            // We'll request directories only, up to depth 4
            filesStructure = await listFilesTool.execute({ directory: '.', depth: 4 });
        } catch (error) {
            console.warn(`[LLMPlanner] Failed to get directory structure: ${error instanceof Error ? error.message : String(error)}`);
        }

        let contextString = contextProfile.createContextString();

        // 3. Modify the prompt to include pre-planning results if available
        const prompt = this.getPrompt(contextProfile, filesStructure, contextString, prePlanningResult);

        // 4. Generate task plan using LLM with tools
        try {
            // Generate response using the regular LLM with streaming callback for rendering responses
            const response = await this.llm.generate(prompt, request, {
                tools,
                onTokenStream: (token: string) => {
                    // If markdown renderer is available, render the token
                    if (this.markdownRenderer) {
                        process.stdout.write(this.markdownRenderer.render(token));
                    } else {
                        process.stdout.write(token);
                    }
                }
            });

            // Get the saved plan from the tool
            const savedPlan = extractPlanTool.getSavedPlan();

            if (!savedPlan) {
                throw new Error(`No plan was saved by the LLM. Got response ${response}. Make sure the LLM is using the extract_plan tool correctly.`);
            }

            // Transform the saved plan into a TaskPlan
            const subtasks: Subtask[] = savedPlan.subtasks.map((subtask) => {
                // Generate ID if not provided
                const id = subtask.id || uuidv4();

                // Validate complexity
                const complexity = this.validateComplexityLevel(subtask.complexity || 'medium');

                // Validate dependencies
                const dependencies = Array.isArray(subtask.dependencies) ? subtask.dependencies : [];

                // Select LLM type based on complexity
                const llmType = this.selectLLMTypeByComplexity(complexity);

                // Include files_to_read if provided
                const filesToRead = Array.isArray(subtask.filesToRead) ? subtask.filesToRead : [];

                return {
                    id,
                    specification: subtask.specification || 'No spec provided',
                    complexity,
                    llmType,
                    dependencies,
                    filesToRead
                };
            });

            // Validate execution order
            const executionOrder = savedPlan.executionOrder?.filter((id: string) =>
                subtasks.some(subtask => subtask.id === id)
            ) || [];

            // If execution order is empty, create a default one
            if (executionOrder.length === 0) {
                subtasks.forEach(subtask => executionOrder.push(subtask.id));
            }

            // Determine overall complexity
            const overallComplexity = savedPlan.overallComplexity || this.determineOverallComplexity(subtasks);

            return {
                originalRequest: request,
                overallComplexity,
                subtasks,
                executionOrder,
                validationInstructions: savedPlan.validationInstructions
            };
        } catch (error) {
            console.error(`Error generating task plan with LLM: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            const subtask: Subtask = {
                id: uuidv4(),
                specification: request,
                complexity: ComplexityLevel.MEDIUM,
                llmType: LLMType.REMOTE,
                dependencies: []
            };

            return {
                originalRequest: request,
                overallComplexity: ComplexityLevel.MEDIUM,
                subtasks: [subtask],
                executionOrder: [subtask.id],
                validationInstructions: "Run basic tests to verify the implementation works as expected."
            };
        }
    }

    private getPrompt(
        contextProfile: ContextProfile, 
        filesStructure: string, 
        contextString: string,
        prePlanningResult: string | null = null
    ) {
        let prompt = `
You are a task planning assistant. Your job is to analyze a user request and create a detailed, executable plan to accomplish their goal. Count that plan execution will be automated, without user involvement or intervention.

PROJECT CONTEXT:
Current Directory: ${contextProfile.currentDirectory}
Project Root: ${contextProfile.projectRoot}

PROJECT DIRECTORY STRUCTURE (limited depth):
"""
${filesStructure}
"""`;

        if (prePlanningResult) {
            prompt += `

## PRE-PLANNING ANALYSIS
The following is an initial analysis performed by a simpler model. Use this as a starting point for your planning:

ANALYSIS:
${prePlanningResult}
`;
        }

        // Continue with the rest of the prompt
        prompt += `

## CONTEXT GATHERING PHASE
First, use the provided tools to explore the project and gather essential context. Focus on:
1. Necessary input files, and it's important for the task dependencies
2. Dependencies and their versions
3. Existing code patterns and architecture
4. Configuration files and settings
5. Build system specifics - how code is compiled and verified in this project
6. Test framework and conventions used

If you need clarification from the user, use the "ask_user" tool to ask specific questions. This is especially useful when:
- The request is ambiguous or lacks necessary details
- You need to confirm your understanding of requirements
- You need to gather preferences about implementation approaches
${this.appConfig?.askModel?.enabled ? `
If the "delegate_analysis_to_model" tool is available, you can use it to delegate analysis tasks to a smaller model. This is useful for:
- Analyzing file content, or its dependencies and providing summaries
- Extracting specific information from files
- Generating code snippets or suggestions based on existing code
- Reducing the cost of the task execution by using a cheaper model for simpler subtasks
- Please think on all analysis you need to make a good planning and call this tool with maximum tasks at once, rather then calling it one to one. Better to ask to analyze more during one tool call, than call it 10 times one by one.
Prefer to supply multiple files as input to the "delegate_analysis_to_model" tool and multiple queries. Queries will be executed one by one internally, so no quality decrease expected.

Example of good tool call:
"queries": [ "Analyze file x  if it is do Y. If it does not find all the dependencies to and make analysis where Y is done and these questions", "Analyze files to understand if they are doing Y and find error Z" ]

To use the "delegate_analysis_to_model" tool, provide an array of file paths and a query with questions or tasks. The model will read the files and respond to the query.
`: ''}

## TASK DECOMPOSITION PHASE

## Project specific GUIDELINES

${contextString}


## TASK PLANNING PHASE
Based on the gathered context, create a precise implementation plan by breaking down the request into executable subtasks.

For each subtask specification (subtasks[*].taskSpecification), use the following structured template in <subtask_specification_template> body:

<subtask_specification_template>
Title: [Descriptive Task Title]

Context of the task: [Description of the task context, considering that executor does not know on the initial task]

Goal: [Clear statement of what this subtask should accomplish]

Context:
- Files: [Full paths to files that need to be created or modified]
- Interfaces: [Description of public interfaces to implement or use]
- Project Patterns: [Highlight this project specific patterns to follow]

Requirements:
1. [Detailed requirement 1..n]

Input: [What the subtask starts with]

Output: [Expected deliverable]

Implementation Details:
[include method signatures, references, etc. to ensure implementation precision, guidance on maintaining code in a compilable state, error handling and defensive coding practices]
</subtask_specification_template>

## GUIDELINES FOR EFFECTIVE SUBTASKS:

1. ATOMIC & FOCUSED: Each subtask should be self-contained and accomplish exactly one logical action (create one file, modify one component, etc.). Never split a file creation or modification across multiple subtasks unless absolutely necessary.

2. COMPLETE & STANDALONE: Include all necessary context and details in each subtask specification. The implementing agent will not have access to the full context you have.

3. PRECISE PATHS: Always include full paths to files, exact module names, and complete interface specifications.

4. IMPLEMENTATION DETAIL: Provide enough technical guidance that an AI without context can implement correctly. You must act as senior developer guiding beloved junior developer, who wants task to be completed successfully. Include enough implementation guidance to ensure the task is done correctly. Executor won't have access to your gathered context, only what is specified within subtask.

5. CODE PATTERNS: Include examples of existing code patterns when relevant to ensure consistency.

6. INTERFACE DEFINITIONS: Clearly define how components will interact with each other.

7. Each subtask must provide guidance to ensure the code remains in a compilable, working state. Never leave the codebase in a broken state.

## VALIDATION INSTRUCTIONS

After all subtasks are implemented, validation will be performed to ensure the solution meets requirements. Include detailed validation instructions in your task plan by adding a "validationInstructions" field.

Your validation instructions should:

1. COMPREHENSIVE TESTING: Include steps to verify all aspects of the implementation, from basic functionality to edge cases.

2. SPECIFIC COMMANDS: Provide exact commands to run tests, build processes, or other verification steps using the RunProcessTool.

3. EXPECTED RESULTS: Clearly describe what successful validation looks like - what outputs to expect, what behavior should be observed.

Format your validation instructions as a series of numbered steps, with each step containing:
- The validation action to perform (e.g., run a command, check a file)
- The expected outcome
- How to interpret the results

ALWAYS call "store_plan" tool at the end of context gathering providing valid parameters. 
IT IS VERY IMPORTANT: follow "store_plan" tool scheme, do not try to call with the other parameters. Subtasks are objects, specification only one field of it, so be attentive. Make sure to include the "validationInstructions" field in your plan with detailed steps for validating the implementation.

ONLY WHEN the plan is saved successfully, provide a concise summary of your understanding of the task and the approach you've outlined.
`;

        return prompt;
    }

    private getTools(contextProfile: ContextProfile) {
        const readFileTool = new ReadFileTool(contextProfile.projectRoot);
        const listFilesTool = new ListFilesTool(contextProfile.projectRoot);
        const extractPlanTool = new StorePlanTool();
        const askUserTool = new AskUserTool();
        // todo: add config for trusted commands
        // const runProcessTool = new RunProcessTool({
        //     trustedCommands: [],
        // }, async command => {
        //     const { confirmation } = await inquirer.prompt<{ confirmation: string }>([
        //         {
        //             type: 'list',
        //             name: 'confirmation',
        //             message: `Do you allow to run "${command}"?`,
        //             choices: ['Yes', 'No'],
        //             default: 'Yes'
        //         }
        //     ]);
        //
        //     return confirmation === 'Yes';
        // })

        // Create AskModelTool if enabled in config
        let askModelTool: DelegateToModelTool | null = null;
        if (this.appConfig.askModel?.enabled) {
            askModelTool = new DelegateToModelTool(contextProfile.projectRoot, this.appConfig);
        }

        const tools: BaseTool[] = [
            listFilesTool,
            extractPlanTool,
            askUserTool,
        ];

        // Add AskModelTool if enabled
        if (askModelTool) {
            tools.push(askModelTool);
        } else {
            tools.push(readFileTool);
        }
        return { listFilesTool, extractPlanTool, tools };
    }

    private validateComplexityLevel(level: string): ComplexityLevel {
        level = level.toLowerCase();
        if (level === 'low' || level === ComplexityLevel.LOW) {
            return ComplexityLevel.LOW;
        } else if (level === 'medium' || level === ComplexityLevel.MEDIUM) {
            return ComplexityLevel.MEDIUM;
        } else if (level === 'high' || level === ComplexityLevel.HIGH) {
            return ComplexityLevel.HIGH;
        }
        return ComplexityLevel.MEDIUM; // Default to medium if invalid
    }

    /**
     * Selects an LLM type based on complexity
     * @param complexity - The complexity level
     * @returns The LLM type
     */
    private selectLLMTypeByComplexity(complexity: ComplexityLevel): LLMType {
        if (complexity === ComplexityLevel.HIGH) {
            return LLMType.REMOTE;
        } else if (complexity === ComplexityLevel.LOW) {
            return LLMType.LOCAL;
        }
        return LLMType.HYBRID;
    }

    /**
     * Determines the overall complexity of a task plan
     * @param subtasks - The subtasks
     * @returns The overall complexity
     */
    private determineOverallComplexity(subtasks: Subtask[]): ComplexityLevel {
        // Count the number of subtasks with each complexity level
        const complexityCounts = {
            [ComplexityLevel.LOW]: 0,
            [ComplexityLevel.MEDIUM]: 0,
            [ComplexityLevel.HIGH]: 0
        };

        subtasks.forEach(subtask => {
            complexityCounts[subtask.complexity]++;
        });

        // If there are any high complexity subtasks, the overall complexity is high
        if (complexityCounts[ComplexityLevel.HIGH] > 0) {
            return ComplexityLevel.HIGH;
        }

        // If there are more medium complexity subtasks than low, the overall complexity is medium
        if (complexityCounts[ComplexityLevel.MEDIUM] >= complexityCounts[ComplexityLevel.LOW]) {
            return ComplexityLevel.MEDIUM;
        }

        // Otherwise, the overall complexity is low
        return ComplexityLevel.LOW;
    }

    /**
     * Gets the explanation for the task plan
     * @param taskPlan - The task plan
     * @returns An explanation string
     */
    getExplanation(taskPlan: TaskPlan): string {
        let explanation = `# Task Planning Report\n\n`;

        // Add task decomposition explanation
        explanation += `## Task Decomposition\n\n`;
        explanation += `Task decomposed into ${taskPlan.subtasks.length} subtasks based on ${taskPlan.overallComplexity.toUpperCase()} complexity level.\n\n`;

        // Add subtasks explanation
        explanation += `## Subtasks\n\n`;
        taskPlan.subtasks.forEach((subtask, index) => {
            explanation += `### ${index + 1}. ${subtask.specification}\n`;
            explanation += `- Complexity: ${subtask.complexity.toUpperCase()}\n`;
            explanation += `- LLM Strategy: ${subtask.llmType.toUpperCase()}\n`;

            if (subtask.dependencies.length > 0) {
                const dependencyIndices = subtask.dependencies.map(depId => {
                    const depIndex = taskPlan.subtasks.findIndex(s => s.id === depId);
                    return depIndex !== -1 ? depIndex + 1 : '?';
                });

                explanation += `- Dependencies: ${dependencyIndices.join(', ')}\n`;
            }

            if (subtask.filesToRead && subtask.filesToRead.length > 0) {
                explanation += `- Files to Read:\n`;
                subtask.filesToRead.forEach(file => {
                    explanation += `  - ${file.path} (${file.syntax})\n`;
                });
            }

            explanation += `\n`;
        });

        // Add execution order explanation
        explanation += `## Execution Order\n\n`;
        const executionOrderIndices = taskPlan.executionOrder.map(id => {
            const index = taskPlan.subtasks.findIndex(s => s.id === id);
            return index !== -1 ? index + 1 : '?';
        });

        explanation += `${executionOrderIndices.join(' → ')}\n\n`;

        // Add validation instructions if available
        if (taskPlan.validationInstructions) {
            explanation += `## Validation Instructions\n\n`;
            explanation += `${taskPlan.validationInstructions}\n\n`;
        }

        // If markdown renderer is available, use it to render the explanation
        if (this.markdownRenderer) {
            return this.markdownRenderer.render(explanation);
        }

        return explanation;
    }
}
