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
 * Interface for provider selection answers
 */
interface ProviderSelectionAnswers {
  provider: string;
}

/**
 * Interface for provider configuration answers
 */
interface ProviderConfigAnswers {
  enabled: boolean;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
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

  // LLM Providers
  console.log(chalk.yellow('\nLLM Providers:'));
  if (config.llm?.providers) {
    for (const [providerName, providerConfig] of Object.entries(config.llm.providers)) {
      console.log(chalk.cyan(`\n  ${providerName}:`));
      console.log(`    Enabled: ${providerConfig.enabled ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`    Model: ${chalk.blue(providerConfig.model || 'Not set')}`);

      if (providerName === 'ollama') {
        console.log(`    Base URL: ${chalk.blue(providerConfig.baseUrl || 'Not set')}`);
      } else {
        console.log(`    API Key: ${providerConfig.apiKey ? chalk.green('Set') : chalk.red('Not set')}`);
      }
    }
  } else {
    console.log(chalk.red('  No providers configured'));
  }

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
    section: 'providers' | 'execution' | 'output' | 'prompts' | 'exit';
  }

  const { section } = await inquirer.prompt<SectionAnswer>([
    {
      type: 'list',
      name: 'section',
      message: 'Which section would you like to configure?',
      choices: [
        { name: 'LLM Providers', value: 'providers' },
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
    case 'providers':
      await configureProviders(config);
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
 * Configures LLM providers
 * @param config - The configuration
 */
async function configureProviders(config: AppConfig): Promise<void> {
  // First, select which provider to configure
  const providerChoices = [
    { name: 'OpenAI', value: 'openai' },
    { name: 'Anthropic (Claude)', value: 'anthropic' },
    { name: 'Google', value: 'google' },
    { name: 'Ollama (Local)', value: 'ollama' }
  ];

  // Add any other providers from the config that aren't in the default list
  if (config.llm?.providers) {
    for (const providerName of Object.keys(config.llm.providers)) {
      if (!providerChoices.some(choice => choice.value === providerName)) {
        providerChoices.push({ name: providerName, value: providerName });
      }
    }
  }

  const { provider } = await inquirer.prompt<ProviderSelectionAnswers>([
    {
      type: 'list',
      name: 'provider',
      message: 'Which provider would you like to configure?',
      choices: providerChoices
    }
  ]);

  // Get the current provider config if it exists
  const providerConfig = config.llm?.providers?.[provider] || {
    enabled: true,
    provider,
    model: getDefaultModelForProvider(provider),
    apiKey: '',
    baseUrl: provider === 'ollama' ? 'http://localhost:11434' : undefined
  };

  // Configure the selected provider
  const answers = await inquirer.prompt<ProviderConfigAnswers>([
    {
      type: 'confirm',
      name: 'enabled',
      message: `Enable ${provider} provider?`,
      default: providerConfig.enabled !== false
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter model name:',
      default: providerConfig.model || getDefaultModelForProvider(provider),
      when: (answers) => answers.enabled
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter API key:',
      default: providerConfig.apiKey || '',
      when: (answers) => answers.enabled && provider !== 'ollama'
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter base URL:',
      default: providerConfig.baseUrl || 'http://localhost:11434',
      when: (answers) => answers.enabled && provider === 'ollama'
    }
  ]);

  // Update configuration
  if (answers.enabled) {
    updateConfig(`llm.providers.${provider}.enabled`, true);
    updateConfig(`llm.providers.${provider}.provider`, provider);
    if (answers.model) updateConfig(`llm.providers.${provider}.model`, answers.model);

    if (provider !== 'ollama' && answers.apiKey) {
      updateConfig(`llm.providers.${provider}.apiKey`, answers.apiKey);
    }

    if (provider === 'ollama' && answers.baseUrl) {
      updateConfig(`llm.providers.${provider}.baseUrl`, answers.baseUrl);
    }
  } else {
    updateConfig(`llm.providers.${provider}.enabled`, false);
  }

  console.log(chalk.green(`Provider ${provider} configuration updated`));
}

/**
 * Gets the default model for a provider
 * @param provider - The provider name
 * @returns The default model name
 */
function getDefaultModelForProvider(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4';
    case 'anthropic':
      return 'claude-3-7-sonnet-latest';
    case 'google':
      return 'gemini-2.5-pro-exp-03-25';
    case 'ollama':
      return 'command-r';
    default:
      return '';
  }
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
