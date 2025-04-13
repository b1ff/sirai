import { BaseLLM } from '../llm/base.js';
import { AppConfig, LLMFactory } from '../llm/factory.js';
import { ContextProfile } from './schemas.js';
import { MarkdownRenderer } from '../utils/markdown-renderer.js';
import { BaseTool, ListFilesTool, ReadFileTool } from '../llm/tools/index.js';

export class PrePlanner {
    private appConfig: AppConfig;
    private llm: BaseLLM | null = null;
    private markdownRenderer?: MarkdownRenderer;

    constructor(appConfig: AppConfig, markdownRenderer?: MarkdownRenderer) {
        this.appConfig = appConfig;
        this.markdownRenderer = markdownRenderer;
    }

    async initialize(): Promise<BaseLLM> {
        if (this.llm) {
            return this.llm;
        }

        // Check if pre-planning is enabled
        if (!this.appConfig.taskPlanning?.prePlanning?.enabled) {
            throw new Error('Pre-planning is disabled in configuration');
        }

        // Get the provider and model from configuration
        const prePlanningConfig = this.appConfig.taskPlanning.prePlanning;
        const provider = prePlanningConfig.provider;
        const model = prePlanningConfig.model;

        if (!provider) {
            throw new Error('No provider specified for pre-planning');
        }

        try {
            this.llm = LLMFactory.createLLMByProvider(this.appConfig, provider, model);
            await this.llm.initialize();
            console.log(`Pre-planning initialized with provider: ${provider}, model: ${model || 'default'}`)
            return this.llm;
        } catch (error) {
            throw new Error(`Failed to initialize LLM for pre-planning: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async analyze(request: string, contextProfile: ContextProfile): Promise<string> {
        // Initialize LLM if not already initialized
        if (!this.llm) {
            await this.initialize();
        }

        if (!this.llm) {
            throw new Error('Failed to initialize LLM for pre-planning');
        }

        // Get tools for pre-planning
        const tools = this.getTools(contextProfile);

        // Get directory structure using FileSystemUtils
        let filesStructure = 'Could not retrieve directory structure.';
        try {
            const listFilesTool = new ListFilesTool(contextProfile.projectRoot);
            filesStructure = await listFilesTool.execute({ directory: '.', depth: 3 });
        } catch (error) {
            console.warn(`[PrePlanner] Failed to get directory structure: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Create context string
        const contextString = contextProfile.createContextString();
        
        // Create prompt for pre-planning
        const prompt = this.getPrompt(filesStructure, contextString);

        // Generate pre-planning analysis
        try {
            const response = await this.llm.generate(prompt, request, {
                tools,
            });

            console.log(`Pre-planning analysis generated for request: ${request}`);
            console.log(this.markdownRenderer?.render(response));

            return response;
        } catch (error) {
            console.error(`Error generating pre-planning analysis: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            throw error;
        }
    }

    private getTools(contextProfile: ContextProfile): BaseTool[] {
        return [
            new ReadFileTool(contextProfile.projectRoot),
            new ListFilesTool(contextProfile.projectRoot)
        ];
    }

    private getPrompt(filesStructure: string, contextString: string): string {
        return `
You are a task pre-planning assistant. Your job is to perform an initial analysis of a user request to help with the main planning phase.
You should focus on understanding the request, identifying key files, components, interfaces and critical code sections, and suggesting a high-level approach.
Your goal is to reduce the amount of analysis needed for your teammate who will do the full analysis and implementation. You must provide specific files, locations, and code snippets when relevant.

## PROJECT CONTEXT
${contextString}

## DIRECTORY STRUCTURE
${filesStructure}

## INSTRUCTIONS
1. Analyze the user request and identify the key components and requirements within the project
2. Read necessary files to understand context and dependencies
3. Identify and list all main files that need to be modified or created
4. Map out dependencies between the identified files
5. Extract relevant code snippets that would be helpful for planning
6. Determine the general approach that would be suitable for this task
7. Estimate the overall complexity (LOW, MEDIUM, HIGH)
8. Provide a confidence score (0.0-1.0) for your analysis

## OUTPUT FORMAT
Provide your analysis in the following structured format:

ANALYSIS:
[Your detailed analysis of the request]

MAIN_FILES:
- [file_path_1]: [Brief description of why this file is relevant and what changes are needed]
- [file_path_2]: [Brief description of why this file is relevant and what changes are needed]
...

DEPENDENCIES:
- [file_path_1] depends on [file_path_2] because [reason]
- [file_path_3] is imported by [file_path_4] for [functionality]
...

RELEVANT_CODE_SNIPPETS:
[file_path_1]:
\`\`\`
[code snippet]
\`\`\`
[Brief explanation of this code's relevance]

[file_path_2]:
\`\`\`
[code snippet]
\`\`\`
[Brief explanation of this code's relevance]
...

SUGGESTED_APPROACH:
[Your suggested approach for implementing the request]

ESTIMATED_COMPLEXITY:
[LOW, MEDIUM, or HIGH]

CONFIDENCE:
[A number between 0.0 and 1.0]

Be precise with file paths and thorough in your analysis while remaining concise.
`;
    }
}
