import { BaseLLM } from '../../llm/base.js';
import { LLMPlanner } from '../../task-planning/index.js';
import { AppConfig } from '../../config/config.js';
import { CodeRenderer } from '../../utils/code-renderer.js';
import { MarkdownRenderer } from '../../utils/markdown-renderer.js';
import { ProjectContext } from '../../utils/project-context.js';
import { PromptManager } from '../../utils/prompt-manager.js';
import { ChatHistoryManager } from '../../utils/chat-history-manager.js';
import { TaskHistoryManager } from '../../utils/task-history-manager.js';
import { ConversationManager } from './conversation-manager.js';
import { CommandHandler } from './command-handler.js';
import { TaskExecutor } from './task-executor.js';
import { CommandOptions } from './types.js';
import { ValidationResult } from '../../task-planning/schemas.js';

/**
 * Class representing the context data for the state machine
 */
export class ContextData {
  private projectContext: Map<string, any>;
  private changedFiles: string[];
  private referencedFiles: string[];
  private currentPlan: any;
  private tasks: any[];
  private retryCount: number;
  private userInput: string;
  private llm: BaseLLM | null;
  private conversationManager: ConversationManager;
  private commandHandler: CommandHandler;
  private taskExecutor: TaskExecutor;
  private taskPlanner: LLMPlanner;
  private options: CommandOptions;
  private config: AppConfig;
  private initialPrompt: string;
  private isActive: boolean;
  private markdownRenderer: MarkdownRenderer;
  private taskHistoryManager: TaskHistoryManager;
  private validationResult?: ValidationResult;
  private fixAttempts?: number;

  constructor(options: CommandOptions, config: AppConfig) {
    this.projectContext = new Map<string, any>();
    this.changedFiles = [];
    this.referencedFiles = [];
    this.currentPlan = null;
    this.tasks = [];
    this.retryCount = 0;
    this.userInput = '';
    this.llm = null;
    this.options = options;
    this.config = config;
    this.initialPrompt = '';
    this.isActive = true;

    // Initialize utilities
    const codeRenderer = new CodeRenderer(config);
    this.markdownRenderer = new MarkdownRenderer(config, codeRenderer);
    const projectContext = new ProjectContext(config);
    const promptManager = new PromptManager(config);
    const chatHistoryManager = new ChatHistoryManager(config);
    this.taskHistoryManager = new TaskHistoryManager(config);

    // Create task planner with debug option if provided
    const taskPlanningConfig = {
      ...config.taskPlanning,
      debug: options.debug,
      taskType: options.taskType || 'planning'
    };
    this.taskPlanner = new LLMPlanner(config, taskPlanningConfig, this.markdownRenderer);

    // Create managers
    this.conversationManager = new ConversationManager(
      codeRenderer,
      promptManager,
      chatHistoryManager,
      config,
      projectContext,
    );

    this.commandHandler = new CommandHandler(
      promptManager,
      chatHistoryManager,
      config
    );

    this.taskExecutor = new TaskExecutor(
      new MarkdownRenderer(config, codeRenderer),
      projectContext,
      this.taskHistoryManager
    );

    // Add project context
    this.addProjectContext('projectRoot', projectContext.findProjectRoot() || process.cwd());
    this.addProjectContext('currentDir', process.cwd());
  }

  // Getters and setters
  public getConversationManager(): ConversationManager {
    return this.conversationManager;
  }

  public getMarkdownRenderer(): MarkdownRenderer {
    return this.markdownRenderer;
  }

  public getCommandHandler(): CommandHandler {
    return this.commandHandler;
  }

  public getTaskExecutor(): TaskExecutor {
    return this.taskExecutor;
  }

  public getTaskPlanner(): LLMPlanner {
    return this.taskPlanner;
  }

  public getTaskHistoryManager(): TaskHistoryManager {
    return this.taskHistoryManager;
  }

  public getOptions(): CommandOptions {
    return this.options;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public setLLM(llm: BaseLLM): void {
    this.llm = llm;
  }

  public getLLM(): BaseLLM | null {
    return this.llm;
  }

  public setUserInput(input: string): void {
    this.userInput = input;
  }

  public getUserInput(): string {
    return this.userInput;
  }

  public setInitialPrompt(prompt: string): void {
    this.initialPrompt = prompt;
  }

  public getInitialPrompt(): string {
    return this.initialPrompt;
  }

  public setActive(active: boolean): void {
    this.isActive = active;
  }

  public isSessionActive(): boolean {
    return this.isActive;
  }

  public addProjectContext(key: string, value: any): void {
    this.projectContext.set(key, value);
  }

  public getProjectContext(key: string): any {
    return this.projectContext.get(key);
  }

  public setCurrentPlan(plan: any): void {
    this.currentPlan = plan;
  }

  public getCurrentPlan(): any {
    return this.currentPlan;
  }

  public incrementRetryCount(): void {
    this.retryCount++;
  }

  public getRetryCount(): number {
    return this.retryCount;
  }

  public resetRetryCount(): void {
    this.retryCount = 0;
  }

  public setValidationResult(result: ValidationResult): void {
    this.validationResult = result;
  }

  public getValidationResult(): ValidationResult | undefined {
    return this.validationResult;
  }

  public incrementFixAttempts(): void {
    this.fixAttempts = (this.fixAttempts || 0) + 1;
  }

  public getFixAttempts(): number {
    return this.fixAttempts || 0;
  }

  public resetFixAttempts(): void {
    this.fixAttempts = 0;
  }

  /**
   * Adds a file to the list of referenced files
   * @param filePath Path to the referenced file
   */
  public addReferencedFile(filePath: string): void {
    if (!this.referencedFiles.includes(filePath)) {
      this.referencedFiles.push(filePath);
    }
  }

  /**
   * Returns the list of referenced files
   * @returns Array of referenced file paths
   */
  public getReferencedFiles(): string[] {
    return [...this.referencedFiles];
  }

  /**
   * Returns all files (both explicitly included and referenced)
   * @returns Array of all file paths
   */
  public getAllFiles(): string[] {
    return [...this.changedFiles, ...this.referencedFiles];
  }
}
