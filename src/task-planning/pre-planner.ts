import { BaseLLM } from '../llm/base.js';
import { AppConfig, LLMFactory } from '../llm/factory.js';
import { ContextProfile } from './schemas.js';
import { MarkdownRenderer } from '../utils/markdown-renderer.js';
import { ListFilesTool, ReadFileTool } from '../llm/tools/index.js';
import { LlmRequest } from '../llm/LlmRequest.js';


export class PrePlanner {
    private readonly appConfig: AppConfig;
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
        if (!this.llm) {
            await this.initialize();
        }

        if (!this.llm) {
            throw new Error('Failed to initialize LLM for pre-planning');
        }

        const llmRequest = this.addTools(new LlmRequest(), contextProfile);

        const filesStructure = await this.getProjectInitialFileList(contextProfile);

        llmRequest
            .withSystemPrompt(this.getSystemPrompt())
            .withPrompt(this.getPrompt())
            .withUserMessage(`PROJECT FILES: ${filesStructure}`)
            .withUserMessage(`PROJECT CONTEXT: ${contextProfile.createContextString()}`)
            .withUserMessage(`USER REQUEST: ${request}`)
        ;

        if (contextProfile.referencedFiles) {
            for (let file in contextProfile.referencedFiles) {
                await llmRequest.addFile(file, contextProfile.projectRoot);
            }
        }

        try {
            const response = await this.llm.generateFrom(llmRequest);

            console.log(`Pre-planning analysis generated for request: ${request}`);
            console.log(this.markdownRenderer?.render(response));

            return response;
        } catch (error) {
            console.error(`Error generating pre-planning analysis: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            throw error;
        }
    }

    private async getProjectInitialFileList(contextProfile: ContextProfile) {
        let filesStructure = 'Could not retrieve directory structure.';
        try {
            const listFilesTool = new ListFilesTool(contextProfile.projectRoot);
            filesStructure = await listFilesTool.execute({ directory: '.', depth: 3 });
        } catch (error) {
            console.warn(`[PrePlanner] Failed to get directory structure: ${error instanceof Error ? error.message : String(error)}`);
        }
        return filesStructure;
    }

    private addTools(llmReq: LlmRequest, contextProfile: ContextProfile) {
        return llmReq
            .withTool(new ReadFileTool(contextProfile.projectRoot))
            .withTool(new ListFilesTool(contextProfile.projectRoot));
    }

    private getSystemPrompt(): string {
        return `You are a task pre-planning assistant. Your job is to perform an initial analysis of a user request to help with the main planning phase.
You should focus on understanding the request, identifying key files, components, interfaces and critical code sections, and suggesting a high-level approach.
Your goal is to reduce the amount of analysis needed for your teammate who will do the full analysis and implementation. You must provide specific files, locations, and code snippets when relevant.`;
    }

    private getPrompt(): string {
        return `
## INSTRUCTIONS
1. Analyze the user request and identify the key components and requirements within the project
2. Read necessary files within the project to understand context and dependencies
3. Identify and list all main files that need to be modified or created. Verify assumptions before adding new files.
4. Map out dependencies between the identified files
5. Extract existing, seen in the project source files, relevant code snippets that would be helpful for planning

## OUTPUT FORMAT
Provide your analysis in the following structured format:

ANALYSIS:
[Your detailed analysis of the request and its understanding]

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
Be precise with file paths and thorough in your analysis while remaining concise.
`;
    }
}
