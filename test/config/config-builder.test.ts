import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { ConfigBuilder } from '../../src/config/config-builder.js';
import { AppConfig, DEFAULT_PRICING_CONFIG } from '../../src/config/config.js';
import { LLMType } from '../../src/task-planning/schemas.js';

describe('ConfigBuilder', () => {
  let configBuilder: ConfigBuilder;
  let testConfigDir: string;

  // Sample configuration for testing
  const sampleConfig: AppConfig = {
    pricing: DEFAULT_PRICING_CONFIG,
    llm: {
      providers: {
        'ollama': {
          enabled: true,
          provider: 'ollama',
          model: 'test-model',
          baseUrl: 'http://localhost:11434',
        },
        'openai': {
          enabled: true,
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'test-api-key',
        },
        'anthropic': {
          enabled: true,
          provider: 'anthropic',
          model: 'claude-3',
          apiKey: 'test-api-key',
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
      markdownRendering: true,
    },
    prompts: {
      directory: '/test/prompts',
    },
    chat: {
      maxHistoryMessages: 20,
      saveHistory: true,
    },
    validation: {
      enabled: true,
      commands: ['npm test', 'npm run lint']
    },
    taskPlanning: {
      enabled: true,
      preferredProvider: 'anthropic',
      providerConfig: {
        'planning': {
          provider: 'anthropic',
          model: 'claude-3'
        },
        'coding': {
          provider: 'openai',
          model: 'gpt-4'
        },
        'default': {
          provider: 'anthropic',
          model: 'claude-3'
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

  beforeEach(() => {
    // Create a temporary test config directory
    testConfigDir = path.join(process.cwd(), 'test', 'temp-config-' + Date.now());
    fs.ensureDirSync(testConfigDir);

    // Set the test config directory and get the ConfigBuilder instance
    ConfigBuilder.setTestConfigDir(testConfigDir);
    configBuilder = ConfigBuilder.getInstance();
  });

  afterEach(() => {
    // Reset the test config directory
    ConfigBuilder.setTestConfigDir(null);

    // Clean up the temporary test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.removeSync(testConfigDir);
    }
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = ConfigBuilder.getInstance();
      const instance2 = ConfigBuilder.getInstance();
      expect(instance1).to.equal(instance2);
    });
  });

  describe('loadConfig', () => {
    it('should return a valid configuration object', () => {
      const config = configBuilder.loadConfig();
      expect(config).to.be.an('object');
      expect(config.llm).to.exist;
      expect(config.execution).to.exist;
      expect(config.output).to.exist;
    });
  });

  describe('saveConfig', () => {
    it('should save and retrieve the same configuration', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();

      // Create a modified config
      const modifiedConfig = { ...originalConfig };
      if (modifiedConfig.output) {
        modifiedConfig.output.colorEnabled = !originalConfig.output?.colorEnabled;
      }

      // Save the modified config
      configBuilder.saveConfig(modifiedConfig);

      // Get the config again
      const retrievedConfig = configBuilder.getConfig();

      // Verify that the retrieved config matches the modified config
      expect(retrievedConfig.output?.colorEnabled).to.equal(modifiedConfig.output?.colorEnabled);

      // Restore the original config
      configBuilder.saveConfig(originalConfig);
    });
  });

  describe('updateConfig', () => {
    it('should update a simple configuration value', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalValue = originalConfig.output?.colorEnabled;

      // Update the config
      const updatedConfig = configBuilder.updateConfig('output.colorEnabled', !originalValue);

      // Verify the update
      expect(updatedConfig.output?.colorEnabled).to.equal(!originalValue);

      // Restore the original config
      configBuilder.updateConfig('output.colorEnabled', originalValue);
    });

    it('should update a nested configuration value', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();

      // Find a provider to update
      let providerName = 'ollama';
      if (originalConfig.llm?.providers && Object.keys(originalConfig.llm.providers).length > 0) {
        providerName = Object.keys(originalConfig.llm.providers)[0];
      }

      const originalModel = originalConfig.llm?.providers?.[providerName]?.model;

      // Update the config
      const newModel = 'test-model-' + Date.now();
      const updatedConfig = configBuilder.updateConfig(`llm.providers.${providerName}.model`, newModel);

      // Verify the update
      expect(updatedConfig.llm?.providers?.[providerName]?.model).to.equal(newModel);

      // Restore the original config
      configBuilder.updateConfig(`llm.providers.${providerName}.model`, originalModel);
    });

    it('should create missing objects in the path', () => {
      // Update the config with a new section
      const testValue = 'test-value-' + Date.now();
      const updatedConfig = configBuilder.updateConfig('newSection.newSubsection.value', testValue);

      // Verify the update
      expect(updatedConfig.newSection?.newSubsection?.value).to.equal(testValue);

      // Clean up
      delete updatedConfig.newSection;
      configBuilder.saveConfig(updatedConfig);
    });
  });

  describe('getConfig', () => {
    it('should return a valid configuration object', () => {
      const config = configBuilder.getConfig();
      expect(config).to.be.an('object');
      expect(config.llm).to.exist;
      expect(config.execution).to.exist;
      expect(config.output).to.exist;
    });
  });

  describe('getConfigValue', () => {
    it('should return a specific configuration value', () => {
      // Get a value that should exist in any config
      const value = configBuilder.getConfigValue<boolean>('output.colorEnabled');
      expect(value).to.be.a('boolean');
    });

    it('should return undefined for non-existent keys', () => {
      const value = configBuilder.getConfigValue<string>('nonexistent.key');
      expect(value).to.be.undefined;
    });

    it('should return the default value for non-existent keys if provided', () => {
      const defaultValue = 'default-value-' + Date.now();
      const value = configBuilder.getConfigValue<string>('nonexistent.key', defaultValue);
      expect(value).to.equal(defaultValue);
    });
  });

  describe('getProviderConfig', () => {
    it('should return a valid provider configuration for a known provider', () => {
      // Get the current config to find a known provider
      const config = configBuilder.getConfig();
      let knownProvider = '';

      // Try to find a known provider from the config
      if (config.llm?.providers) {
        knownProvider = Object.keys(config.llm.providers)[0] || '';
      }

      // Skip the test if no known provider found
      if (!knownProvider) {
        console.log('No known provider found, skipping test');
        return;
      }

      // Get the provider config
      const providerConfig = configBuilder.getProviderConfig(knownProvider);

      // Verify the provider config
      expect(providerConfig).to.exist;
      expect(providerConfig?.provider).to.equal(knownProvider);
    });

    it('should return undefined for non-existent providers', () => {
      const nonExistentProvider = 'nonexistent-provider-' + Date.now();
      const providerConfig = configBuilder.getProviderConfig(nonExistentProvider);
      expect(providerConfig).to.be.undefined;
    });
  });

  describe('Validation Configuration', () => {
    it('should have default validation configuration', () => {
      // Get the current config
      const config = configBuilder.getConfig();
      
      // Verify default validation configuration exists
      expect(config.validation).to.exist;
      expect(config.validation.enabled).to.be.a('boolean');
      expect(config.validation.commands).to.be.an('array');
    });

    it('should update validation enabled setting', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalEnabled = originalConfig.validation?.enabled;

      // Update the validation enabled setting
      const updatedConfig = configBuilder.setValidationEnabled(!originalEnabled);

      // Verify the update
      expect(updatedConfig.getConfig().validation?.enabled).to.equal(!originalEnabled);

      // Restore the original config
      configBuilder.setValidationEnabled(originalEnabled);
    });

    it('should update validation commands', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalCommands = originalConfig.validation?.commands || [];

      // Create test commands
      const testCommands = ['test-command-1', 'test-command-2'];

      // Update the validation commands
      const updatedConfig = configBuilder.setValidationCommands(testCommands);

      // Verify the update
      expect(updatedConfig.getConfig().validation?.commands).to.deep.equal(testCommands);

      // Restore the original config
      configBuilder.setValidationCommands(originalCommands);
    });

    it('should handle empty validation commands array', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalCommands = originalConfig.validation?.commands || [];

      // Update with empty commands array
      const updatedConfig = configBuilder.setValidationCommands([]);

      // Verify the update
      expect(updatedConfig.getConfig().validation?.commands).to.be.an('array');
      expect(updatedConfig.getConfig().validation?.commands).to.be.empty;

      // Restore the original config
      configBuilder.setValidationCommands(originalCommands);
    });

    it('should create validation config if it does not exist', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      
      // Create a modified config without validation
      const modifiedConfig = { ...originalConfig } as any;
      delete modifiedConfig.validation;
      
      // Save the modified config
      configBuilder.saveConfig(modifiedConfig);
      
      // Update validation enabled
      const updatedConfig = configBuilder.setValidationEnabled(true).getConfig();
      
      // Verify the validation config was created
      expect(updatedConfig.validation).to.exist;
      expect(updatedConfig.validation.enabled).to.be.true;
      expect(updatedConfig.validation.commands).to.be.an('array');
      
      // Restore the original config
      configBuilder.saveConfig(originalConfig);
    });
  });

  describe('getTaskProviderConfig', () => {
    it('should return a valid task provider configuration', () => {
      // Get the current config
      const config = configBuilder.getConfig();

      // Find a task type that has a provider config
      let taskType = '';
      if (config.taskPlanning?.providerConfig) {
        taskType = Object.keys(config.taskPlanning.providerConfig)[0] || '';
      }

      // Skip the test if no task type found
      if (!taskType) {
        console.log('No task type found with provider config, skipping test');
        return;
      }

      // Get the task provider config
      const taskConfig = configBuilder.getTaskProviderConfig(taskType);

      // Verify the task provider config
      expect(taskConfig).to.exist;
      expect(taskConfig?.provider).to.be.a('string');
    });

    it('should handle non-existent task types', () => {
      const nonExistentTask = 'nonexistent-task-' + Date.now();
      const taskConfig = configBuilder.getTaskProviderConfig(nonExistentTask);

      // The result could be undefined or a default config
      if (taskConfig) {
        expect(taskConfig.provider).to.be.a('string');
      }
    });

    it('should handle configuration changes', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();

      // Create a test task type
      const testTaskType = 'test-task-' + Date.now();
      const testProvider = 'test-provider-' + Date.now();

      // Create a modified config with a new task type
      const modifiedConfig = { ...originalConfig };
      if (!modifiedConfig.taskPlanning) {
        modifiedConfig.taskPlanning = {
          enabled: true,
          complexity: { thresholds: { medium: 40, high: 70 }, weights: { taskType: 0.2, scopeSize: 0.3, dependenciesCount: 0.2, technologyComplexity: 0.2, priorSuccessRate: 0.1 } },
          llmStrategy: { thresholds: { remote: 70, hybrid: 40, local: 0 } }
        };
      }

      if (!modifiedConfig.taskPlanning.providerConfig) {
        modifiedConfig.taskPlanning.providerConfig = {};
      }

      modifiedConfig.taskPlanning.providerConfig[testTaskType] = {
        provider: testProvider
      };

      // Save the modified config
      configBuilder.saveConfig(modifiedConfig);

      // Get the task provider config
      const taskConfig = configBuilder.getTaskProviderConfig(testTaskType);

      // Verify the task provider config
      expect(taskConfig).to.exist;
      expect(taskConfig?.provider).to.equal(testProvider);

      // Restore the original config
      configBuilder.saveConfig(originalConfig);
    });
  });
});
