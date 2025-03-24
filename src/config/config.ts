import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { LLMType } from '../task-planning/schemas.js';

/**
 * Interface for LLM provider configuration
 */
export interface LLMProviderConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: any;
}

/**
 * Interface for LLM configuration
 */
export interface LLMConfig {
  local: LLMProviderConfig;
  remote: LLMProviderConfig;
}

/**
 * Interface for execution configuration
 */
export interface ExecutionConfig {
  parallel: boolean;
  maxParallel: number;
}

/**
 * Interface for output configuration
 */
export interface OutputConfig {
  colorEnabled: boolean;
  syntaxHighlighting: boolean;
}

/**
 * Interface for prompts configuration
 */
export interface PromptsConfig {
  directory: string;
}

/**
 * Interface for chat configuration
 */
export interface ChatConfig {
  maxHistoryMessages: number;
  saveHistory: boolean;
}

/**
 * Interface for task planning configuration
 */
export interface TaskPlanningConfig {
  enabled: boolean;
  complexity: {
    thresholds: {
      medium: number;
      high: number;
    };
    weights: {
      taskType: number;
      scopeSize: number;
      dependenciesCount: number;
      technologyComplexity: number;
      priorSuccessRate: number;
    };
  };
  llmStrategy: {
    thresholds: {
      remote: number;
      hybrid: number;
      local: number;
    };
    overrides?: {
      [key: string]: LLMType;
    };
  };
}

/**
 * Interface for the complete application configuration
 */
export interface AppConfig {
  llm: LLMConfig;
  execution: ExecutionConfig;
  output: OutputConfig;
  prompts: PromptsConfig;
  chat: ChatConfig;
  taskPlanning: TaskPlanningConfig;
  [key: string]: any;
}

// Define the configuration directory and file
// const CONFIG_DIR = path.join(os.homedir(), '.sirai');
const CONFIG_DIR = path.join(process.cwd(), '.sirai');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');
const PROMPTS_DIR = path.join(CONFIG_DIR, 'prompts');

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
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
    directory: PROMPTS_DIR,
  },
  chat: {
    maxHistoryMessages: 20,
    saveHistory: true,
  },
  taskPlanning: {
    enabled: true,
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

/**
 * Ensures the configuration directory exists
 */
function ensureConfigDir(): void {
  fs.ensureDirSync(CONFIG_DIR);
  fs.ensureDirSync(PROMPTS_DIR);
}

/**
 * Loads the configuration from the config file
 * If the file doesn't exist, creates it with default values
 * @returns The configuration object
 */
export function loadConfig(): AppConfig {
  ensureConfigDir();

  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.log(chalk.yellow('Configuration file not found. Creating with default values...'));
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    const configYaml = fs.readFileSync(CONFIG_FILE, 'utf8');
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
    console.log(chalk.yellow('Using default configuration...'));
    return DEFAULT_CONFIG;
  }
}

/**
 * Saves the configuration to the config file
 * @param config - The configuration object to save
 */
export function saveConfig(config: AppConfig): void {
  ensureConfigDir();

  try {
    const configYaml = yaml.dump(config, { indent: 2 });
    fs.writeFileSync(CONFIG_FILE, configYaml, 'utf8');
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
export function updateConfig(key: string, value: any): AppConfig {
  const config = loadConfig();

  // Handle dot notation (e.g., "llm.local.model")
  const keys = key.split('.');
  let current: any = config;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  // Set the value
  current[keys[keys.length - 1]] = value;

  // Save the updated config
  saveConfig(config);

  return config;
}

/**
 * Gets the path to the prompts directory
 * @returns The path to the prompts directory
 */
export function getPromptsDir(): string {
  const config = loadConfig();
  return config.prompts?.directory || PROMPTS_DIR;
}
