import { BaseLLM } from '../llm/base.js';
import { AppConfig, LLMFactory } from '../llm/factory.js';
import { ContextProfile } from './schemas.js';
import { MarkdownRenderer } from '../utils/markdown-renderer.js';
import { BaseTool, ListFilesTool, ReadFileTool } from '../llm/tools/index.js';

/**
 * Result of the pre-planning phase
 */
export interface PrePlanningResult {
    analysis: string;
    suggestedApproach: string;
    estimatedComplexity: string;
    confidence: number;
}

/**
 * Class for pre-planning using a cheaper/local model
 */
export class PrePlanner {
    private appConfig: AppConfig;
    private llm: BaseLLM | null = null;
    private markdownRenderer?: MarkdownRenderer;

    constructor(appConfig: AppConfig, markdownRenderer?: MarkdownRenderer) {
        this.appConfig = appConfig;
        this.markdownRenderer = markdownRenderer;
    }

    /**
     * Initializes the LLM for pre-planning
     */
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

    /**
     * Performs pre-planning analysis
     */
    async analyze(request: string, contextProfile: ContextProfile): Promise<PrePlanningResult> {
        // Initialize LLM if not already initialized
        if (!this.llm) {
            await this.initialize();
        }

        if (!this.llm) {
            throw new Error('Failed to initialize LLM for pre-planning');
        }

        // Get tools for pre-planning
        const tools = this.getTools(contextProfile);

        // Get directory structure
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

            // Parse the response to extract pre-planning result
            const result = this.parseResponse(response);
            return result;
        } catch (error) {
            console.error(`Error generating pre-planning analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Gets the tools for pre-planning
     */
    private getTools(contextProfile: ContextProfile): BaseTool[] {
        return [
            new ReadFileTool(contextProfile.projectRoot),
            new ListFilesTool(contextProfile.projectRoot)
        ];
    }

    private getPrompt(filesStructure: string, contextString: string): string {
        return `
You are a task pre-planning assistant. Your job is to perform an initial analysis of a user request to help with the main planning phase.
You should focus on understanding the request, identifying key files, components, interface and hot places, and suggesting a high-level approach.
Goal is to reduce the amount of analysis that is needed for your teammate who is going to do full analysis and implementation. You must provide specific files, places and even pieces of codes if needed, so the teammate perform less actions.
With explanation include exact references to files paths, code, and other relevant information.

## PROJECT CONTEXT
${contextString}

## DIRECTORY STRUCTURE
${filesStructure}

## INSTRUCTIONS
1. Analyze the user request and identify within project the key components and requirements
2. Read needed files to understand context and dependencies.
3. Determine the general approach that would be suitable for this task
4. Estimate the overall complexity (LOW, MEDIUM, HIGH)
5. Provide a confidence score (0.0-1.0) for your analysis

## OUTPUT FORMAT
Provide your analysis in the following format:

ANALYSIS:
[Your detailed analysis of the request]

SUGGESTED_APPROACH:
[Your suggested approach for implementing the request]

ESTIMATED_COMPLEXITY:
[LOW, MEDIUM, or HIGH]

CONFIDENCE:
[A number between 0.0 and 1.0]

Remember to be concise but thorough in your analysis.
`;
    }

    private parseResponse(response: string): PrePlanningResult {
        // Default values
        let analysis = '';
        let suggestedApproach = '';
        let estimatedComplexity = 'MEDIUM';
        let confidence = 0.5;

        // Extract analysis
        const analysisMatch = response.match(/ANALYSIS:\s*([\s\S]*?)(?=SUGGESTED_APPROACH:|$)/i);
        if (analysisMatch && analysisMatch[1]) {
            analysis = analysisMatch[1].trim();
        }

        // Extract suggested approach
        const approachMatch = response.match(/SUGGESTED_APPROACH:\s*([\s\S]*?)(?=ESTIMATED_COMPLEXITY:|$)/i);
        if (approachMatch && approachMatch[1]) {
            suggestedApproach = approachMatch[1].trim();
        }

        // Extract estimated complexity
        const complexityMatch = response.match(/ESTIMATED_COMPLEXITY:\s*(LOW|MEDIUM|HIGH)/i);
        if (complexityMatch && complexityMatch[1]) {
            estimatedComplexity = complexityMatch[1].toUpperCase();
        }

        // Extract confidence
        const confidenceMatch = response.match(/CONFIDENCE:\s*([0-9]*\.?[0-9]+)/i);
        if (confidenceMatch && confidenceMatch[1]) {
            confidence = parseFloat(confidenceMatch[1]);
            // Ensure confidence is between 0 and 1
            confidence = Math.max(0, Math.min(1, confidence));
        }

        return {
            analysis,
            suggestedApproach,
            estimatedComplexity,
            confidence
        };
    }
}
