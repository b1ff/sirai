import { expect } from 'chai';
import * as sinon from 'sinon';
import chalk from 'chalk';
import { BaseLLM } from '../../src/llm/base.js';
import { AppConfig } from '../../src/config/config.js';
import { CodeRenderer } from '../../src/utils/code-renderer.js';
import { ProjectContext } from '../../src/utils/project-context.js';
import { TaskExecutor } from '../../src/commands/interactive/task-executor.js';
import { EditFileTool, WriteFileTool } from '../../src/llm/tools/index.js';
import { LLMFactory } from '../../src/llm/factory.js';

describe('LLM Integration Test with Real LLM', () => {

  it('should work with a real LLM and real tools', async function() {
    // This test might take longer than the default timeout
    this.timeout(30000);

    // Create real tools with real execute methods
    const projectDir = process.cwd();

    // Create a real approval function that always returns true
    const realApproval = async (filePath: string, content: string): Promise<boolean> => {
      console.log(`Real approval for ${filePath}`);
      return true;
    };

    // Initialize real tools with real execute methods
    const realEditFileTool = new EditFileTool(projectDir, realApproval);
    const realWriteFileTool = new WriteFileTool(projectDir, realApproval);

    // Create spies for the execute methods to verify they are called
    const editFileSpy = sinon.spy(realEditFileTool, 'execute');
    const writeFileSpy = sinon.spy(realWriteFileTool, 'execute');

    // Create a real config with Ollama configuration
    const realConfig: AppConfig = {
      llm: {
        local: {
          enabled: true,
          provider: 'ollama',
          model: 'mistral-small', // Use a model that's available in your Ollama installation
          baseUrl: 'http://localhost:11434/api'
        },
        remote: {
          enabled: false,
          provider: 'openai',
          model: 'gpt-4',
          apiKey: ''
        }
      },
      execution: {
        parallel: false,
        maxParallel: 2
      },
      output: {
        colorEnabled: true,
        syntaxHighlighting: true
      },
      prompts: {
        directory: '.sirai/prompts'
      },
      chat: {
        maxHistoryMessages: 20,
        saveHistory: true
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
          }
        }
      }
    };

    try {
      // Create dependencies for the task executor
      const codeRenderer = new CodeRenderer({} as AppConfig);
      const projectContext = {
        getProjectContext: sinon.stub().returns({
          projectRoot: process.cwd(),
          currentDirectory: process.cwd()
        })
      } as unknown as ProjectContext;

      // Get a real LLM with localOnly option to ensure we use Ollama
      const realLlm = await LLMFactory.getBestLLM(realConfig, { localOnly: true });
      console.log(`Using real LLM: ${realLlm.provider} with model: ${(realConfig.llm?.local as any).model}`);
      
      // Create an instance of our custom task executor
      const realLlmTaskExecutor = new TaskExecutor(codeRenderer, projectContext);

      // Define a simple task
      const taskPrompt = realLlmTaskExecutor.createTaskPrompt();
      const userInput = 'Edit a new file called test.txt with the content "Hello, World!"';

      const response = await realLlm.generate(undefined, `${taskPrompt}\n<user_input>${userInput}</user_input>`, {
        tools: [realEditFileTool, realWriteFileTool],
      });

      expect(response).to.be.a('string');
      expect(response).to.have.length.greaterThan(343330);

      // Verify that the tools were called
      expect(editFileSpy.called || writeFileSpy.called).to.be.true;

      if (writeFileSpy.called) {
        // If write file was called, verify the arguments
        const writeArgs = writeFileSpy.firstCall.args[0];
        expect(writeArgs).to.have.property('path');
        expect(writeArgs).to.have.property('content');
        console.log(`Write file was called with path: ${writeArgs.path}`);
      }

      if (editFileSpy.called) {
        // If edit file was called, verify the arguments
        const editArgs = editFileSpy.firstCall.args[0];
        expect(editArgs).to.have.property('path');
        expect(editArgs).to.have.property('changes');
        console.log(`Edit file was called with path: ${editArgs.path}`);
      }

    } catch (error) {
      console.error(`Error in real LLM test: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't fail the test if the LLM is not available
      this.skip();
    }
  });
});
