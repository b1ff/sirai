import { expect } from 'chai';
import * as sinon from 'sinon';
import * as childProcess from 'child_process';
import { RunProcessTool } from '../../../src/llm/tools/run-process.js';
import { TrustedCommandsConfig } from '../../../src/llm/tools/base.js';

describe('RunProcessTool', () => {
  let runProcessTool: RunProcessTool;
  let execStub: sinon.SinonStub;
  let promptForApprovalStub: sinon.SinonStub;
  const trustedCommandsConfig: TrustedCommandsConfig = {
    trustedCommands: ['ls', 'echo']
  };

  beforeEach(() => {
    execStub = sinon.stub(childProcess, 'exec');
    promptForApprovalStub = sinon.stub().resolves(true);
    runProcessTool = new RunProcessTool(trustedCommandsConfig, promptForApprovalStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should execute a trusted command without prompting for approval', async () => {
    execStub.callsFake((cmd, callback) => {
      callback(null, { stdout: 'command output', stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const result = await runProcessTool.execute({
      command: 'ls -la',
      timeout: 1000
    });

    expect(result).to.equal('command output');
    expect(execStub.calledOnce).to.be.true;
    expect(execStub.firstCall.args[0]).to.equal('ls -la');
    expect(promptForApprovalStub.called).to.be.false;
  });

  it('should prompt for approval for non-trusted commands', async () => {
    execStub.callsFake((cmd, callback) => {
      callback(null, { stdout: 'command output', stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    const result = await runProcessTool.execute({
      command: 'rm -rf /',
      timeout: 1000
    });

    expect(result).to.equal('command output');
    expect(execStub.calledOnce).to.be.true;
    expect(execStub.firstCall.args[0]).to.equal('rm -rf /');
    expect(promptForApprovalStub.calledOnce).to.be.true;
    expect(promptForApprovalStub.firstCall.args[0]).to.equal('rm -rf /');
  });

  it('should not execute a command if approval is denied', async () => {
    promptForApprovalStub.resolves(false);

    const result = await runProcessTool.execute({
      command: 'rm -rf /',
      timeout: 1000
    });

    expect(result).to.equal('Command execution was not approved by the user.');
    expect(execStub.called).to.be.false;
  });

  it('should include stderr in the output if present', async () => {
    execStub.callsFake((cmd, callback) => {
      callback(null, { stdout: 'command output', stderr: 'some warnings' });
      return {} as childProcess.ChildProcess;
    });

    const result = await runProcessTool.execute({
      command: 'ls -la',
      timeout: 1000
    });

    expect(result).to.include('command output');
    expect(result).to.include('some warnings');
  });

  it('should throw an error if the command fails', async () => {
    execStub.callsFake((cmd, callback) => {
      callback(new Error('Command failed'), { stdout: '', stderr: 'error output' });
      return {} as childProcess.ChildProcess;
    });

    try {
      await runProcessTool.execute({
        command: 'ls -la',
        timeout: 1000
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('Failed to execute command');
    }
  });

  it('should use the default timeout if not specified', async () => {
    execStub.callsFake((cmd, callback) => {
      callback(null, { stdout: 'command output', stderr: '' });
      return {} as childProcess.ChildProcess;
    });

    await runProcessTool.execute({
      command: 'ls -la'
    });

    expect(execStub.calledOnce).to.be.true;
  });

  it('should timeout if the command takes too long', async () => {
    // This test is a bit tricky because we need to simulate a timeout
    // We'll use a timer to reject the promise after a delay
    const clock = sinon.useFakeTimers();
    
    execStub.returns({} as childProcess.ChildProcess);
    
    const executePromise = runProcessTool.execute({
      command: 'sleep 10',
      timeout: 100
    });
    
    // Fast-forward time
    clock.tick(200);
    
    try {
      await executePromise;
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('timed out');
    } finally {
      clock.restore();
    }
  });
});
