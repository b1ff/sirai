import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RunProcessTool } from '../../../src/llm/tools/run-process.js';
import { TrustedCommandsConfig } from '../../../src/llm/tools/base.js';

describe('RunProcessTool', () => {
  // Create a temporary test directory
  const testDir = path.join(process.cwd(), 'test', 'temp-run-process');
  let runProcessTool: RunProcessTool;
  let promptForApprovalStub: (command: string) => Promise<boolean>;
  const trustedCommandsConfig: TrustedCommandsConfig = {
    trustedCommands: ['ls', 'echo', 'cat', 'mkdir', 'touch', 'rm']
  };

  // Create test directory and files before all tests
  before(async () => {
    // Create test directory if it doesn't exist
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating test directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create a test file
    await fs.writeFile(path.join(testDir, 'test-file.txt'), 'This is a test file');
  });

  // Clean up test files after all tests
  after(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Error removing test directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  beforeEach(() => {
    // Create a stub for promptForApproval that always returns true
    promptForApprovalStub = async () => true;
    runProcessTool = new RunProcessTool(trustedCommandsConfig, promptForApprovalStub);
  });

  afterEach(async () => {
    // Clean up any files created during tests
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        if (file !== 'test-file.txt') {
          await fs.rm(path.join(testDir, file), { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.error(`Error cleaning up test files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  it('should execute a trusted command without prompting for approval', async () => {
    // Create a spy for promptForApproval
    let promptCalled = false;
    promptForApprovalStub = async () => {
      promptCalled = true;
      return true;
    };
    runProcessTool = new RunProcessTool(trustedCommandsConfig, promptForApprovalStub);

    const result = await runProcessTool.execute({
      command: `ls ${testDir}`,
      timeout: 1000
    });

    // Verify the command executed successfully
    expect(result).to.include('test-file.txt');
    // Verify promptForApproval was not called
    expect(promptCalled).to.be.false;
  });

  it('should prompt for approval for non-trusted commands', async () => {
    // Create a spy for promptForApproval
    let promptCalled = false;
    let commandRequested = '';
    promptForApprovalStub = async (command: string) => {
      promptCalled = true;
      commandRequested = command;
      return true;
    };
    runProcessTool = new RunProcessTool(trustedCommandsConfig, promptForApprovalStub);

    // Use a non-trusted command that's safe to execute
    const nonTrustedCommand = 'pwd';
    const result = await runProcessTool.execute({
      command: nonTrustedCommand,
      timeout: 1000
    });

    // Verify the command executed successfully
    expect(result).to.not.be.empty;
    // Verify promptForApproval was called with the correct command
    expect(promptCalled).to.be.true;
    expect(commandRequested).to.equal(nonTrustedCommand);
  });

  it('should not execute a command if approval is denied', async () => {
    // Create a spy for promptForApproval that denies approval
    promptForApprovalStub = async () => false;
    runProcessTool = new RunProcessTool(trustedCommandsConfig, promptForApprovalStub);

    // Use a non-trusted command
    const result = await runProcessTool.execute({
      command: 'pwd',
      timeout: 1000
    });

    // Verify the command was not executed
    expect(result).to.equal('Command execution was not approved by the user.');
  });

  it('should include stderr in the output if present', async () => {
    // Use a command that produces stderr output
    // 'ls' with a non-existent file will produce stderr
    const result = await runProcessTool.execute({
      command: `ls ${testDir}/non-existent-file`,
      timeout: 1000
    });

    // Verify stderr is included in the output
    expect(result).to.include('No such file or directory');
  });

  it('should handle errors when the command fails', async () => {
    // Use a command that will fail
    // 'cat' with a non-existent file will fail
    const result = await runProcessTool.execute({
      command: `cat ${testDir}/non-existent-file`,
      timeout: 1000
    });

    // The tool should handle the error and return an error message
    expect(result).to.include('No such file or directory');
  });

  it('should use the default timeout if not specified', async () => {
    // Execute a command without specifying a timeout
    const result = await runProcessTool.execute({
      command: `ls ${testDir}`
    });

    // Verify the command executed successfully
    expect(result).to.include('test-file.txt');
  });

  it('should timeout if the command takes too long', async function() {
    // This test uses a real command that takes longer than the timeout
    // Increase the test timeout to ensure the test has enough time to complete
    this.timeout(5000);

    try {
      // Use a command that will take longer than the timeout
      // 'sleep' command will wait for the specified number of seconds
      await runProcessTool.execute({
        command: 'sleep 3',
        timeout: 100 // 100ms timeout
      });

      // If we get here, the command didn't timeout as expected
      expect.fail('Command should have timed out');
    } catch (error) {
      // Verify the error is a timeout error
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('timed out');
    }
  });
});
