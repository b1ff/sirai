import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, updateConfig, AppConfig } from '../config/config.js';

/**
 * Interface for command options
 */
export interface CommandOptions {
  list?: boolean;
  set?: string;
  [key: string]: any;
}

/**
 * Interface for local LLM answers
 */
interface LocalLLMAnswers {
  enabled: boolean;
  provider?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Interface for remote LLM answers
 */
interface RemoteLLMAnswers {
  enabled: boolean;
  provider?: string;
  model?: string;
  apiKey?: string;
}

/**
 * Interface for execution answers
 */
interface ExecutionAnswers {
  parallel: boolean;
  maxParallel?: number;
}

/**
 * Interface for output answers
 */
interface OutputAnswers {
  colorEnabled: boolean;
  syntaxHighlighting: boolean;
}

/**
 * Interface for prompts answers
 */
interface PromptsAnswers {
  directory: string;
}

/**
 * Configures settings
 * @param options - Command options
 * @param config - The configuration
 */
export async function configureSettings(options: CommandOptions, config: AppConfig): Promise<void> {
  // List current configuration
  if (options.list) {
    listConfiguration(config);
    return;
  }
  
  // Set a configuration value
  if (options.set) {
    setConfigurationValue(options.set, config);
    return;
  }
  
  // Interactive configuration
  await interactiveConfiguration(config);
}

/**
 * Lists the current configuration
 * @param config - The configuration
 */
function listConfiguration(config: AppConfig): void {
  console.log(chalk.cyan('Current configuration:'));
  
  // Local LLM
  console.log(chalk.yellow('\nLocal LLM:'));
  console.log(`  Enabled: ${config.llm?.local?.enabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Provider: ${chalk.blue(config.llm?.local?.provider || 'Not set')}`);
  console.log(`  Model: ${chalk.blue(config.llm?.local?.model || 'Not set')}`);
  console.log(`  Base URL: ${chalk.blue(config.llm?.local?.baseUrl || 'Not set')}`);
  
  // Remote LLM
  console.log(chalk.yellow('\nRemote LLM:'));
  console.log(`  Enabled: ${config.llm?.remote?.enabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Provider: ${chalk.blue(config.llm?.remote?.provider || 'Not set')}`);
  console.log(`  Model: ${chalk.blue(config.llm?.remote?.model || 'Not set')}`);
  console.log(`  API Key: ${config.llm?.remote?.apiKey ? chalk.green('Set') : chalk.red('Not set')}`);
  
  // Execution
  console.log(chalk.yellow('\nExecution:'));
  console.log(`  Parallel: ${config.execution?.parallel ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Max Parallel: ${chalk.blue(config.execution?.maxParallel || '1')}`);
  
  // Output
  console.log(chalk.yellow('\nOutput:'));
  console.log(`  Color Enabled: ${config.output?.colorEnabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Syntax Highlighting: ${config.output?.syntaxHighlighting ? chalk.green('Yes') : chalk.red('No')}`);
  
  // Prompts
  console.log(chalk.yellow('\nPrompts:'));
  console.log(`  Directory: ${chalk.blue(config.prompts?.directory || 'Not set')}`);
}

/**
 * Sets a configuration value
 * @param keyValue - The key=value string
 * @param config - The configuration
 */
function setConfigurationValue(keyValue: string, config: AppConfig): void {
  const parts = keyValue.split('=');
  
  if (parts.length !== 2) {
    console.error(chalk.red('Invalid format. Use key=value'));
    return;
  }
  
  const [key, value] = parts;
  
  // Convert value to appropriate type
  let typedValue: string | boolean | number = value;
  
  if (value.toLowerCase() === 'true') {
    typedValue = true;
  } else if (value.toLowerCase() === 'false') {
    typedValue = false;
  } else if (!isNaN(Number(value)) && value.trim() !== '') {
    typedValue = Number(value);
  }
  
  try {
    const updatedConfig = updateConfig(key, typedValue);
    console.log(chalk.green(`Configuration updated: ${key} = ${typedValue}`));
    
    // Show the updated value
    const keys = key.split('.');
    let current: any = updatedConfig;
    
    for (const k of keys) {
      current = current[k];
      if (current === undefined) {
        break;
      }
    }
    
    if (current !== undefined) {
      console.log(chalk.blue(`New value: ${JSON.stringify(current)}`));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error updating configuration: ${error.message}`));
    } else {
      console.error(chalk.red('Error updating configuration: Unknown error'));
    }
  }
}

/**
 * Interactive configuration
 * @param config - The configuration
 */
async function interactiveConfiguration(config: AppConfig): Promise<void> {
  interface SectionAnswer {
    section: 'local' | 'remote' | 'execution' | 'output' | 'prompts' | 'exit';
  }

  const { section } = await inquirer.prompt<SectionAnswer>([
    {
      type: 'list',
      name: 'section',
      message: 'Which section would you like to configure?',
      choices: [
        { name: 'Local LLM', value: 'local' },
        { name: 'Remote LLM', value: 'remote' },
        { name: 'Execution', value: 'execution' },
        { name: 'Output', value: 'output' },
        { name: 'Prompts', value: 'prompts' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);
  
  if (section === 'exit') {
    return;
  }
  
  switch (section) {
    case 'local':
      await configureLocalLLM(config);
      break;
    case 'remote':
      await configureRemoteLLM(config);
      break;
    case 'execution':
      await configureExecution(config);
      break;
    case 'output':
      await configureOutput(config);
      break;
    case 'prompts':
      await configurePrompts(config);
      break;
  }
}

/**
 * Configures local LLM
 * @param config - The configuration
 */
async function configureLocalLLM(config: AppConfig): Promise<void> {
  const answers = await inquirer.prompt<LocalLLMAnswers>([
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable local LLM?',
      default: config.llm?.local?.enabled !== false
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Select local LLM provider:',
      choices: [
        { name: 'Ollama', value: 'ollama' }
      ],
      default: config.llm?.local?.provider || 'ollama',
      when: (answers) => answers.enabled
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter model name:',
      default: config.llm?.local?.model || 'command-r',
      when: (answers) => answers.enabled
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter base URL:',
      default: config.llm?.local?.baseUrl || 'http://localhost:11434',
      when: (answers) => answers.enabled && answers.provider === 'ollama'
    }
  ]);
  
  // Update configuration
  if (answers.enabled) {
    updateConfig('llm.local.enabled', true);
    if (answers.provider) updateConfig('llm.local.provider', answers.provider);
    if (answers.model) updateConfig('llm.local.model', answers.model);
    
    if (answers.provider === 'ollama' && answers.baseUrl) {
      updateConfig('llm.local.baseUrl', answers.baseUrl);
    }
  } else {
    updateConfig('llm.local.enabled', false);
  }
  
  console.log(chalk.green('Local LLM configuration updated'));
}

/**
 * Configures remote LLM
 * @param config - The configuration
 */
async function configureRemoteLLM(config: AppConfig): Promise<void> {
  const answers = await inquirer.prompt<RemoteLLMAnswers>([
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable remote LLM?',
      default: config.llm?.remote?.enabled !== false
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Select remote LLM provider:',
      choices: [
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic (Claude)', value: 'anthropic' }
      ],
      default: config.llm?.remote?.provider || 'openai',
      when: (answers) => answers.enabled
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter model name:',
      default: (answers: RemoteLLMAnswers) => {
        if (answers.provider === 'openai') {
          return config.llm?.remote?.model || 'gpt-4';
        } else if (answers.provider === 'anthropic') {
          return config.llm?.remote?.model || 'claude-2';
        }
        return '';
      },
      when: (answers) => answers.enabled
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter API key:',
      default: config.llm?.remote?.apiKey || '',
      when: (answers) => answers.enabled
    }
  ]);
  
  // Update configuration
  if (answers.enabled) {
    updateConfig('llm.remote.enabled', true);
    if (answers.provider) updateConfig('llm.remote.provider', answers.provider);
    if (answers.model) updateConfig('llm.remote.model', answers.model);
    if (answers.apiKey) updateConfig('llm.remote.apiKey', answers.apiKey);
  } else {
    updateConfig('llm.remote.enabled', false);
  }
  
  console.log(chalk.green('Remote LLM configuration updated'));
}

/**
 * Configures execution
 * @param config - The configuration
 */
async function configureExecution(config: AppConfig): Promise<void> {
  const answers = await inquirer.prompt<ExecutionAnswers>([
    {
      type: 'confirm',
      name: 'parallel',
      message: 'Enable parallel execution?',
      default: config.execution?.parallel || false
    },
    {
      type: 'number',
      name: 'maxParallel',
      message: 'Maximum parallel executions:',
      default: config.execution?.maxParallel || 2,
      when: (answers) => answers.parallel,
      validate: (value) => value > 0 ? true : 'Must be greater than 0'
    }
  ]);
  
  // Update configuration
  updateConfig('execution.parallel', answers.parallel);
  
  if (answers.parallel && answers.maxParallel) {
    updateConfig('execution.maxParallel', answers.maxParallel);
  }
  
  console.log(chalk.green('Execution configuration updated'));
}

/**
 * Configures output
 * @param config - The configuration
 */
async function configureOutput(config: AppConfig): Promise<void> {
  const answers = await inquirer.prompt<OutputAnswers>([
    {
      type: 'confirm',
      name: 'colorEnabled',
      message: 'Enable colored output?',
      default: config.output?.colorEnabled !== false
    },
    {
      type: 'confirm',
      name: 'syntaxHighlighting',
      message: 'Enable syntax highlighting?',
      default: config.output?.syntaxHighlighting !== false
    }
  ]);
  
  // Update configuration
  updateConfig('output.colorEnabled', answers.colorEnabled);
  updateConfig('output.syntaxHighlighting', answers.syntaxHighlighting);
  
  console.log(chalk.green('Output configuration updated'));
}

/**
 * Configures prompts
 * @param config - The configuration
 */
async function configurePrompts(config: AppConfig): Promise<void> {
  const answers = await inquirer.prompt<PromptsAnswers>([
    {
      type: 'input',
      name: 'directory',
      message: 'Prompts directory:',
      default: config.prompts?.directory || ''
    }
  ]);
  
  // Update configuration
  if (answers.directory) {
    updateConfig('prompts.directory', answers.directory);
  }
  
  console.log(chalk.green('Prompts configuration updated'));
}