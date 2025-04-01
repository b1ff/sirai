import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { LLMType } from '../task-planning/schemas.js';
import {
  AppConfig,
  LLMProviderConfig,
  ProvidersConfig,
  LLMConfig,
  ExecutionConfig,
  OutputConfig,
  PromptsConfig,
  ChatConfig,
  TaskPlanningConfig
} from './config.js';

/**
 * ConfigBuilder class for managing application configuration
 */
export class ConfigBuilder {
  private static instance: ConfigBuilder;
  private static testConfigDir: string | null = null;
  private config: AppConfig;
  private configDir: string;
  private configFile: string;
  private promptsDir: string;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Define the configuration directory and file
    this.configDir = ConfigBuilder.testConfigDir || path.join(process.cwd(), '.sirai');
    this.configFile = path.join(this.configDir, 'config.yaml');
    this.promptsDir = path.join(this.configDir, 'prompts');

    // Load or create default configuration
    this.config = this.loadConfig();
  }

  /**
   * Get the singleton instance of ConfigBuilder
   * @returns The ConfigBuilder instance
   */
  public static getInstance(): ConfigBuilder {
    if (!ConfigBuilder.instance) {
      ConfigBuilder.instance = new ConfigBuilder();
    }
    return ConfigBuilder.instance;
  }

  /**
   * Set a custom config directory for testing
   * This will reset the singleton instance
   * @param configDir - The custom config directory
   */
  public static setTestConfigDir(configDir: string | null): void {
    ConfigBuilder.testConfigDir = configDir;
    ConfigBuilder.instance = null as unknown as ConfigBuilder;
  }

  /**
   * Get the default configuration
   * @returns The default configuration
   */
  private getDefaultConfig(): AppConfig {
    return {
      llm: {
        local: {
          enabled: true,
          provider: 'ollama',
          model: 'command-r',
          baseUrl: 'http://localhost:11434',
        },
        remote: {
          enabled: true,
          provider: 'openai',
          model: 'gpt-4',
          apiKey: '',
        },
        providers: {
          'openai': {
            enabled: true,
            provider: 'openai',
            model: 'gpt-4',
            apiKey: '',
          },
          'anthropic': {
            enabled: true,
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-latest',
            apiKey: '',
          },
          'google': {
            enabled: true,
            provider: 'google',
            model: 'gemini-2.5-pro-exp-03-25',
            apiKey: '',
          },
          'ollama': {
            enabled: true,
            provider: 'ollama',
            model: 'command-r',
            baseUrl: 'http://localhost:11434',
          },
        },
      },
      execution: {
        parallel: false,
        maxParallel: 2,
      },
      output: {
        colorEnabled: true,
        syntaxHighlighting: true,
      },
      prompts: {
        directory: this.promptsDir,
      },
      chat: {
        maxHistoryMessages: 20,
        saveHistory: true,
      },
      taskPlanning: {
        enabled: true,
        preferredProvider: 'anthropic',
        providerConfig: {
          'planning': {
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-latest'
          },
          'coding': {
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-latest'
          },
          'default': {
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-latest'
          }
        },
        complexity: {
          thresholds: {
            medium: 40,
            high: 70
          },
          weights: {
            taskType: 0.2,
            scopeSize: 0.3,
            dependenciesCount: 0.2,
            technologyComplexity: 0.2,
            priorSuccessRate: 0.1
          }
        },
        llmStrategy: {
          thresholds: {
            remote: 70,
            hybrid: 40,
            local: 0
          },
          overrides: {
            'critical': LLMType.REMOTE,
            'simple': LLMType.LOCAL
          }
        }
      },
    };
  }

  /**
   * Ensures the configuration directory exists
   */
  private ensureConfigDir(): void {
    fs.ensureDirSync(this.configDir);
    fs.ensureDirSync(this.promptsDir);
  }

  /**
   * Loads the configuration from the config file
   * If the file doesn't exist, creates it with default values
   * @returns The configuration object
   */
  public loadConfig(): AppConfig {
    this.ensureConfigDir();

    try {
      if (!fs.existsSync(this.configFile)) {
        console.log(chalk.yellow('Configuration file not found. Creating with default values...'));
        const defaultConfig = this.getDefaultConfig();
        this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      const configYaml = fs.readFileSync(this.configFile, 'utf8');
      const config = yaml.load(configYaml) as AppConfig;

      // Convert string values to LLMType enum values for llmStrategy.overrides
      if (config.taskPlanning?.llmStrategy?.overrides) {
        const overrides = config.taskPlanning.llmStrategy.overrides;
        for (const key in overrides) {
          const value = overrides[key];
          if (typeof value === 'string') {
            switch (value.toLowerCase()) {
              case 'remote':
                overrides[key] = LLMType.REMOTE;
                break;
              case 'local':
                overrides[key] = LLMType.LOCAL;
                break;
              case 'hybrid':
                overrides[key] = LLMType.HYBRID;
                break;
              default:
                // Keep as is, will cause type error if invalid
                break;
            }
          }
        }
      }

      return config;
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error loading configuration: ${error.message}`));
      } else {
        console.error(chalk.red('Error loading configuration: Unknown error'));
      }
      const defaultConfig = this.getDefaultConfig();
      console.log(chalk.yellow('Using default configuration...'));
      return defaultConfig;
    }
  }

  /**
   * Saves the configuration to the config file
   * @param config - The configuration object to save
   */
  public saveConfig(config: AppConfig): void {
    this.ensureConfigDir();

    try {
      const configYaml = yaml.dump(config, { indent: 2 });
      fs.writeFileSync(this.configFile, configYaml, 'utf8');
      this.config = config;
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error saving configuration: ${error.message}`));
      } else {
        console.error(chalk.red('Error saving configuration: Unknown error'));
      }
    }
  }

  /**
   * Updates a specific configuration value
   * @param key - The key to update (dot notation supported)
   * @param value - The value to set
   * @returns The updated configuration
   */
  public updateConfig(key: string, value: any): AppConfig {
    // Handle dot notation (e.g., "llm.local.model")
    const keys = key.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    // Set the value
    current[keys[keys.length - 1]] = value;

    // Save the updated config
    this.saveConfig(this.config);

    return this.config;
  }

  /**
   * Gets the current configuration
   * @returns The current configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Gets the path to the prompts directory
   * @returns The path to the prompts directory
   */
  public getPromptsDir(): string {
    return this.config.prompts?.directory || this.promptsDir;
  }

  /**
   * Gets a specific configuration value
   * @param key - The key to get (dot notation supported)
   * @param defaultValue - The default value to return if the key doesn't exist
   * @returns The configuration value
   */
  public getConfigValue<T>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let current: any = this.config;

    for (const k of keys) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[k];
    }

    return current !== undefined ? current : defaultValue as T;
  }

  /**
   * Gets the LLM provider configuration for a specific provider
   * @param providerName - The name of the provider
   * @returns The provider configuration
   */
  public getProviderConfig(providerName: string): LLMProviderConfig | undefined {
    if (this.config.llm?.providers && this.config.llm.providers[providerName]) {
      return this.config.llm.providers[providerName];
    }

    if (this.config.llm?.local?.provider === providerName) {
      return this.config.llm.local;
    }

    if (this.config.llm?.remote?.provider === providerName) {
      return this.config.llm.remote;
    }

    return undefined;
  }

  /**
   * Gets the task-specific provider configuration
   * @param taskType - The type of task
   * @returns The provider and model to use for the task
   */
  public getTaskProviderConfig(taskType: string): { provider: string; model?: string } | undefined {
    if (this.config.taskPlanning?.providerConfig && this.config.taskPlanning.providerConfig[taskType]) {
      return this.config.taskPlanning.providerConfig[taskType];
    }

    if (this.config.taskPlanning?.providerConfig?.default) {
      return this.config.taskPlanning.providerConfig.default;
    }

    if (this.config.taskPlanning?.preferredProvider) {
      return { provider: this.config.taskPlanning.preferredProvider };
    }

    return undefined;
  }
}

// Note: The functions loadConfig, saveConfig, updateConfig, and getPromptsDir
// are exported from config.ts for backward compatibility
