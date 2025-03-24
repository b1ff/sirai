import { BaseLLM } from '../llm/base.js';
import { AppConfig, LLMFactory } from '../llm/factory.js';
import { FileSystemUtils } from './file-system-utils.js';
import { ComplexityLevel, ContextProfile, LLMType, Subtask, TaskPlan, TaskType } from './schemas.js';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool, ExtractPlanTool, FindFilesTool, ListFilesTool, ReadFileTool } from '../llm/tools/index.js';

/**
 * Configuration for the LLM planner
 */
export interface LLMPlannerConfig {
  maxContextSize?: number; // Maximum context size in characters
  chunkSize?: number; // Size of chunks for context management
  preferredProvider?: string; // Preferred LLM provider (openai, claude, ollama)
  debug?: boolean; // Enable debug mode
}

/**
 * Default configuration for the LLM planner
 */
const DEFAULT_CONFIG: LLMPlannerConfig = {
  maxContextSize: 8000, // Default maximum context size
  chunkSize: 1000, // Default chunk size
  preferredProvider: 'openai' // Default to OpenAI
};

/**
 * Main class for LLM-based task planning
 */
export class LLMPlanner {
  private config: LLMPlannerConfig;
  private appConfig: AppConfig;
  private llm: BaseLLM | null = null;
  private debug: boolean = true;

  /**
   * Constructor
   * @param appConfig - Application configuration
   * @param config - Configuration for the LLM planner or task planning configuration
   */
  constructor(appConfig: AppConfig, config: Partial<LLMPlannerConfig> | any = {}) {
    this.appConfig = appConfig;
    this.config = {
      maxContextSize: config.maxContextSize || DEFAULT_CONFIG.maxContextSize,
      chunkSize: config.chunkSize || DEFAULT_CONFIG.chunkSize,
      preferredProvider: config.preferredProvider || DEFAULT_CONFIG.preferredProvider,
      debug: true// config.debug || false
    };
    // this.debug = this.config.debug || false;
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
      // Use the preferred provider if specified
      if (this.config.preferredProvider) {
        const providerType = this.isRemoteProvider(this.config.preferredProvider) ? 'remote' : 'local';

        // Override the provider in the config
        const configCopy = { ...this.appConfig };
        if (!configCopy.llm) {
          configCopy.llm = {};
        }

        if (!configCopy.llm[providerType]) {
          configCopy.llm[providerType] = {};
        }

        configCopy.llm[providerType].provider = this.config.preferredProvider;
        configCopy.llm[providerType].enabled = true;

        this.llm = LLMFactory.createLLM(configCopy, providerType);
      } else {
        // Use the best available LLM
        this.llm = await LLMFactory.getBestLLM(this.appConfig, { preferLocal: false });
      }

      await this.llm.initialize();

      return await this.llm;
    } catch (error) {
      throw new Error(`Failed to initialize LLM: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Determines if a provider is remote
   * @param provider - The provider name
   * @returns True if the provider is remote
   */
  private isRemoteProvider(provider: string): boolean {
    const remoteProviders = ['openai', 'claude'];
    return remoteProviders.includes(provider.toLowerCase());
  }

  /**
   * Wraps a tool with logging functionality
   * @param tool - The tool to wrap
   * @returns A new tool that logs when it's called
   */
  private wrapToolWithLogging(tool: BaseTool): BaseTool {
    const originalExecute = tool.execute.bind(tool);

    // Create a proxy object that wraps the original tool
    const proxy = Object.create(tool);

    // Override the execute method to add logging
    proxy.execute = async (args: Record<string, unknown>): Promise<string> => {
      console.log(`[DEBUG] Tool called: ${tool.name} with args:`, args);
      let result = await originalExecute(args);
      console.log(`[DEBUG] Tool called: ${result}`);
      return result;
    };

    return proxy as BaseTool;
  }

  /**
   * Creates a context profile for a project
   * @param projectRoot - The root directory of the project
   * @param currentDirectory - The current working directory
   * @returns A context profile
   */
  async createContextProfile(
    projectRoot: string,
    currentDirectory: string
  ): Promise<ContextProfile> {
    return FileSystemUtils.createContextProfile(projectRoot, currentDirectory);
  }

  /**
   * Creates a task plan for a user request
   * @param request - The user request
   * @param contextProfile - The context profile
   * @returns A task plan
   */
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

    // 2. Create tools for the LLM to use
    const readFileTool = new ReadFileTool(contextProfile.projectRoot);
    const listFilesTool = new ListFilesTool(contextProfile.projectRoot);
    const extractPlanTool = new ExtractPlanTool();

    // Wrap tools with debug logging if debug is enabled
    const tools = this.debug 
      ? [
          this.wrapToolWithLogging(readFileTool),
          this.wrapToolWithLogging(listFilesTool),
          this.wrapToolWithLogging(extractPlanTool)
        ]
      : [readFileTool, listFilesTool, extractPlanTool];

    // 3. Create prompt for LLM
    const prompt = `
You are a task planning assistant. Your job is to analyze a user request and create a plan to accomplish user goal.

<user_request>
${request}
</user_request>

PROJECT CONTEXT:
You can use the provided tools to explore the project and gather context.

Current Directory: ${contextProfile.currentDirectory}

Based on the above information, use tools to gather context, and based on the context create a task plan by breaking down the request into subtasks. You must derive minimal amount of subtasks to accomplish the user goal.

For each subtask, provide a clear specification, a complexity level (low, medium, high), and dependencies (which subtasks must be completed before this one). 
Also provide an execution order for the subtasks.

Each task and subtask must be actionable by LLM, either gather SPECIFIC information or perform a SPECIFIC action, like edit a file, create a file, etc.

Graining should be based on the tasks that LLM can perform. Do not make very chatty tasks. You can create plan from one sub-task or multiple sub-tasks.

Decide on task whether it can be executed by LLM, which has limited input and limited output. 
If task consists of multiple components, files or modules you can crate a specification for every module or file in subtask. Ensure that public interfaces are communicated so that everthing is wired together correctly at the end.
Include in the task specification any other important information. Specification should be like you explaining for very novice developer. Include in the subtask specification details from the gathered context, so the implementation does not need to gather context again.
Include into subtask specification full paths to the files, directories, name of modules, etc. so the LLM can use it directly.
If there is a single file that can be modified for the one taks - you must ensure that it is only one subtask related to that file and no more. If file edits should be done in sequencing, i.e. each modification depends on other sub-tasks, you can split it. For example if task is to write tests on the existing module - which results in the creation of the test file - writing all tests in that file should be strictly one sub-task.

IMPORTANT: After creating the plan, you MUST use the extract_plan tool to save the plan. Pass the plan directly as JSON to the tool. Do not pass the plan as a string or try to format it yourself.

After plan is saved successfully, write a summary of your understanding of the task.
`;

    // 4. Generate task plan using LLM with tools
    try {
      // Generate response using the regular LLM
      await this.llm.generate(prompt, { tools });

      // Get the saved plan from the tool
      const savedPlan = extractPlanTool.getSavedPlan();

      if (!savedPlan) {
        throw new Error('No plan was saved by the LLM. Make sure the LLM is using the extract_plan tool correctly.');
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

        return {
          id,
          taskSpecification: subtask.taskSpecification || 'No spec provided',
          complexity,
          llmType,
          dependencies
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
        executionOrder
      };
    } catch (error) {
      console.error(`Error generating task plan with LLM: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Fallback to a simple task plan
      const subtask: Subtask = {
        id: uuidv4(),
        taskSpecification: request,
        complexity: ComplexityLevel.MEDIUM,
        llmType: LLMType.REMOTE,
        dependencies: []
      };

      return {
        originalRequest: request,
        overallComplexity: ComplexityLevel.MEDIUM,
        subtasks: [subtask],
        executionOrder: [subtask.id]
      };
    }
  }

  /**
   * Validates a complexity level string
   * @param level - The complexity level string
   * @returns A valid complexity level
   */
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
      explanation += `### ${index + 1}. ${subtask.taskSpecification}\n`;
      explanation += `- Complexity: ${subtask.complexity.toUpperCase()}\n`;
      explanation += `- LLM Strategy: ${subtask.llmType.toUpperCase()}\n`;

      if (subtask.dependencies.length > 0) {
        const dependencyIndices = subtask.dependencies.map(depId => {
          const depIndex = taskPlan.subtasks.findIndex(s => s.id === depId);
          return depIndex !== -1 ? depIndex + 1 : '?';
        });

        explanation += `- Dependencies: ${dependencyIndices.join(', ')}\n`;
      }

      explanation += `\n`;
    });

    // Add execution order explanation
    explanation += `## Execution Order\n\n`;
    const executionOrderIndices = taskPlan.executionOrder.map(id => {
      const index = taskPlan.subtasks.findIndex(s => s.id === id);
      return index !== -1 ? index + 1 : '?';
    });

    explanation += `${executionOrderIndices.join(' → ')}\n`;

    return explanation;
  }
}
