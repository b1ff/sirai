import { expect } from 'chai';
import { TaskExecutor } from '../../src/commands/interactive/task-executor.js';
import { 
  createMockedEditFileTool, 
  createMockedWriteFileTool, 
  createRealLLM, 
  createMockedProjectContext, 
  createCodeRenderer 
} from '../helpers/llm-integration-test-helper.js';
import { FileSourceLlmPreparation } from '../../src/llm/tools/file-source-llm-preparation.js';
import { MarkdownRenderer } from '../../src/utils/markdown-renderer.js';
import { AppConfig } from '../../src/config/config.js';

describe('LLM Integration Test with Real LLM', () => {
  let fileSource: FileSourceLlmPreparation;

  before(async () => {
    fileSource = new FileSourceLlmPreparation([
        {
            path: 'test/fixtures/sample-file-to-edit.txt',
            syntax: 'typescript',
        },
    ], process.cwd());
  });

  it('should work with a real LLM and mocked tools', async function() {
    this.timeout(30000);

    const projectDir = process.cwd();

    // Create mocked tools
    const { tool: mockedEditFileTool, spy: editFileSpy } = createMockedEditFileTool(projectDir);
    const { tool: mockedWriteFileTool, spy: writeFileSpy } = createMockedWriteFileTool(projectDir);

    // Create real LLM
    const realLlm = await createRealLLM();

    // Create code renderer and project context
    const codeRenderer = createCodeRenderer();
    const projectContext = createMockedProjectContext();

    // Create an instance of our custom task executor
    const taskExecutor = new TaskExecutor(new MarkdownRenderer({} as AppConfig, codeRenderer), projectContext);

    // Define a simple task using the fixture
    const taskPrompt = taskExecutor.createTaskPrompt();
    const userInput = `Add endpoint to read dns zone in provided file.`;

    // Add context for the LLM
    let fileContent = await fileSource.renderForLlm(true);
    const promptWithContext = `${taskPrompt}\n\n<user_input>${userInput}</user_input>\n${fileContent}`;

    // Execute the task
    const response = await realLlm.generate(undefined, promptWithContext, {
      tools: [mockedEditFileTool, mockedWriteFileTool],
    });

    expect(response).to.be.a('string');
    expect(response).not.to.contain('TOOL_CALLS');
    expect(response.length).to.be.greaterThan(0);

    // Verify that at least one of the tools was called
    expect(editFileSpy.called,'Expected either editFileSpy to be called, but neither was called.').to.be.true;

    // If write file was called, verify the arguments
    if (writeFileSpy.called) {
      const writeArgs = writeFileSpy.firstCall.args[0];
      expect(writeArgs).to.have.property('path');
      expect(writeArgs).to.have.property('content');
      console.log(`Write file was called with path: ${writeArgs.path}`);
    }

    // If edit file was called, verify the arguments
    if (editFileSpy.called) {
      const editArgs = editFileSpy.firstCall.args[0];
      expect(editArgs).to.have.property('file_path');
      expect(editArgs).to.have.property('new_content');
      console.log(`Edit file was called with path: ${editArgs.file_path}`);
    }
  });
});
