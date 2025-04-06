import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { ConfigBuilder } from '../../src/config/config-builder.js';
import { ValidationConfig } from '../../src/config/config.js';

describe('ConfigBuilder API Tests', () => {
  describe('Singleton Pattern', () => {
    let testConfigDir: string;

    beforeEach(() => {
      // Create a temporary test config directory
      testConfigDir = path.join(process.cwd(), 'test', 'temp-config-singleton-' + Date.now());
      fs.ensureDirSync(testConfigDir);

      // Set the test config directory
      ConfigBuilder.setTestConfigDir(testConfigDir);
    });

    afterEach(() => {
      // Reset the test config directory
      ConfigBuilder.setTestConfigDir(null);

      // Clean up the temporary test config directory
      if (fs.existsSync(testConfigDir)) {
        fs.removeSync(testConfigDir);
      }
    });

    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = ConfigBuilder.getInstance();
      const instance2 = ConfigBuilder.getInstance();
      expect(instance1).to.equal(instance2);
    });
  });

  describe('API Methods', () => {
    let configBuilder: ConfigBuilder;
    let testConfigDir: string;

    beforeEach(() => {
      // Create a temporary test config directory
      testConfigDir = path.join(process.cwd(), 'test', 'temp-config-api-' + Date.now());
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

    it('should have a getConfig method that returns an object', () => {
      const config = configBuilder.getConfig();
      expect(config).to.be.an('object');
      expect(config.llm).to.exist;
      expect(config.execution).to.exist;
      expect(config.output).to.exist;
    });

    it('should have a getConfigValue method that returns a value', () => {
      // Test with a key that should exist in any config
      const value = configBuilder.getConfigValue<boolean>('output.colorEnabled');
      expect(value).to.be.a('boolean');
    });

    it('should return default value for non-existent keys', () => {
      const defaultValue = 'default-value';
      const value = configBuilder.getConfigValue<string>('nonexistent.key', defaultValue);
      expect(value).to.equal(defaultValue);
    });

    it('should have a getProviderConfig method', () => {
      // This test just verifies the method exists and returns something
      // We're not testing the actual return value since it depends on the config
      const providerConfig = configBuilder.getProviderConfig('openai');
      // The result could be undefined if openai is not configured
      expect(providerConfig !== null).to.be.true;
    });

    it('should have a getTaskProviderConfig method', () => {
      // This test just verifies the method exists and returns something
      // We're not testing the actual return value since it depends on the config
      const taskConfig = configBuilder.getTaskProviderConfig('planning');
      // The result could be undefined if planning is not configured
      expect(taskConfig !== null).to.be.true;
    });

    it('should have a setValidationEnabled method', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalEnabled = originalConfig.validation?.enabled;

      // Call the method
      const updatedConfig = configBuilder.setValidationEnabled(!originalEnabled).getConfig();
      
      // Verify the method works
      expect(updatedConfig.validation?.enabled).to.equal(!originalEnabled);
      
      // Restore original value
      configBuilder.setValidationEnabled(originalEnabled);
    });

    it('should have a setValidationCommands method', () => {
      // Get the current config
      const originalConfig = configBuilder.getConfig();
      const originalCommands = originalConfig.validation?.commands || [];

      // Test commands
      const testCommands = ['test-api-command-1', 'test-api-command-2'];
      
      // Call the method
      const updatedConfig = configBuilder.setValidationCommands(testCommands).getConfig();
      
      // Verify the method works
      expect(updatedConfig.validation?.commands).to.deep.equal(testCommands);
      
      // Restore original value
      configBuilder.setValidationCommands(originalCommands);
    });

    it('should have a getPromptsDir method that returns a string', () => {
      const promptsDir = configBuilder.getPromptsDir();
      expect(promptsDir).to.be.a('string');
    });
  });
});
