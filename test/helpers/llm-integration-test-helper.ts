import * as sinon from 'sinon';
import { BaseLLM } from '../../src/llm/base.js';
import { AppConfig, DEFAULT_PRICING_CONFIG } from '../../src/config/config.js';
import { CodeRenderer } from '../../src/utils/code-renderer.js';
import { ProjectContext } from '../../src/utils/project-context.js';
import { EditFileTool, PatchFileTool, WriteFileTool } from '../../src/llm/tools/index.js';
import { LLMFactory } from '../../src/llm/factory.js';

/**
 * Creates a mocked EditFileTool that doesn't perform actual file operations
 */
export function createMockedEditFileTool(projectDir: string): { 
  tool: PatchFileTool;
  spy: sinon.SinonSpy;
  mockFs: {
    stat: sinon.SinonStub;
    readFile: sinon.SinonStub;
    writeFile: sinon.SinonStub;
  };
} {
  // Create mock fs functions
  const mockFs = {
    stat: sinon.stub().resolves({ isFile: () => true }),
    readFile: sinon.stub().resolves('Mock file content'),
    writeFile: sinon.stub().resolves()
  };

  // Create approval mock that always returns true
  const approvalMock = async (): Promise<boolean> => true;

  // Create the tool with mocked fs
  // const tool = new EditFileTool(projectDir, approvalMock, mockFs);
  const tool = new PatchFileTool(projectDir, approvalMock, mockFs);

  // Spy on the execute method
  const spy = sinon.spy(tool, 'execute');

  return { tool, spy, mockFs };
}

/**
 * Creates a mocked WriteFileTool that doesn't perform actual file operations
 */
export function createMockedWriteFileTool(projectDir: string): { 
  tool: WriteFileTool; 
  spy: sinon.SinonSpy;
} {
  // Create approval mock that always returns true
  const approvalMock = async (): Promise<boolean> => true;

  // Create the tool
  const tool = new WriteFileTool(projectDir, approvalMock);

  // Create a spy that will track calls
  const spy = sinon.spy();

  // Create a stub for the execute method that calls the spy
  sinon.stub(tool, 'execute').callsFake(async (args: Record<string, unknown>) => {
    // Call the spy to record the call
    spy(args);

    // Return a success message without actually writing the file
    return `Successfully wrote mock content to ${args.path}`;
  });

  return { tool, spy };
}

/**
 * Creates a real LLM for testing
 */
export async function createRealLLM(): Promise<BaseLLM> {
  const config: AppConfig = {
    validation: {
      enabled: true,
      commands: []
    },
    pricing: DEFAULT_PRICING_CONFIG,
    llm: {
      providers: {
        'openai': {
          enabled: false,
          provider: 'openai',
          model: 'gpt-4',
          apiKey: ''
        },
        'ollama': {
          enabled: false,
          provider: 'ollama',
          model: 'mistral-small-3.1-24b-instruct-2503',
        },
        'lmstudio': {
          enabled: true,
          provider: 'lmstudio',
          model: 'phi-4-mini-instruct',
        },
      }
    },
    execution: {
      parallel: false,
      maxParallel: 2
    },
    output: {
      colorEnabled: true,
      syntaxHighlighting: true,
      markdownRendering: true,
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
      preferredProvider: 'lmstudio',
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

  return await LLMFactory.getBestLLM(config, { providerName: 'lmstudio' });
}

/**
 * Creates a mocked ProjectContext
 */
export function createMockedProjectContext(): ProjectContext {
  return {
    getProjectContext: sinon.stub().returns({
      projectRoot: process.cwd(),
      currentDirectory: process.cwd()
    }),
    createContextString: sinon.stub().resolves(''),
  } as unknown as ProjectContext;
}

/**
 * Creates a CodeRenderer
 */
export function createCodeRenderer(): CodeRenderer {
  return new CodeRenderer({} as AppConfig);
}
