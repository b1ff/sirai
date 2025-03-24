import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { WriteFileTool } from '../../../src/llm/tools/write-file.js';

describe('WriteFileTool', () => {
  const workingDir = process.cwd();
  let writeFileTool: WriteFileTool;
  let fsAccessStub: sinon.SinonStub;
  let fsWriteFileStub: sinon.SinonStub;
  let fsMkdirStub: sinon.SinonStub;
  let execStub: sinon.SinonStub;
  let promptForApprovalStub: sinon.SinonStub;

  beforeEach(() => {
    fsAccessStub = sinon.stub(fs, 'access');
    fsWriteFileStub = sinon.stub(fs, 'writeFile').resolves();
    fsMkdirStub = sinon.stub(fs, 'mkdir').resolves();
    execStub = sinon.stub(exec);
    promptForApprovalStub = sinon.stub().resolves(true);
    writeFileTool = new WriteFileTool(workingDir, promptForApprovalStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should write a file in the working directory', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Not a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(new Error('Not a git repository'), { stdout: '', stderr: '' });
      return {} as any;
    });

    const result = await writeFileTool.execute({
      path: 'test.txt',
      content: 'Hello, world!',
      encoding: 'utf-8'
    });

    expect(result).to.include('Successfully wrote');
    expect(promptForApprovalStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.firstCall.args[0]).to.equal(path.resolve(workingDir, 'test.txt'));
    expect(fsWriteFileStub.firstCall.args[1]).to.equal('Hello, world!');
    expect(fsWriteFileStub.firstCall.args[2]).to.deep.equal({ encoding: 'utf-8' });
  });

  it('should throw an error if the file is outside the working directory', async () => {
    try {
      await writeFileTool.execute({
        path: '../outside.txt',
        content: 'Hello, world!',
        encoding: 'utf-8'
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('outside the working directory');
    }
  });

  it('should not prompt for approval if git repository has no uncommitted changes', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Is a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(null, { stdout: 'true', stderr: '' });
      return {} as any;
    });
    
    // No uncommitted changes
    execStub.withArgs('git status --porcelain').callsFake((cmd, callback) => {
      callback(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    const result = await writeFileTool.execute({
      path: 'test.txt',
      content: 'Hello, world!',
      encoding: 'utf-8'
    });

    expect(result).to.include('Successfully wrote');
    expect(promptForApprovalStub.called).to.be.false;
    expect(fsWriteFileStub.calledOnce).to.be.true;
  });

  it('should prompt for approval if git repository has uncommitted changes', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Is a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(null, { stdout: 'true', stderr: '' });
      return {} as any;
    });
    
    // Has uncommitted changes
    execStub.withArgs('git status --porcelain').callsFake((cmd, callback) => {
      callback(null, { stdout: ' M file.txt', stderr: '' });
      return {} as any;
    });

    const result = await writeFileTool.execute({
      path: 'test.txt',
      content: 'Hello, world!',
      encoding: 'utf-8'
    });

    expect(result).to.include('Successfully wrote');
    expect(promptForApprovalStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.calledOnce).to.be.true;
  });

  it('should not write if approval is denied', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Not a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(new Error('Not a git repository'), { stdout: '', stderr: '' });
      return {} as any;
    });
    
    // Deny approval
    promptForApprovalStub.resolves(false);

    const result = await writeFileTool.execute({
      path: 'test.txt',
      content: 'Hello, world!',
      encoding: 'utf-8'
    });

    expect(result).to.include('not approved');
    expect(promptForApprovalStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.called).to.be.false;
  });

  it('should throw an error if overwrite is false and file exists', async () => {
    // File exists
    fsAccessStub.resolves();

    try {
      await writeFileTool.execute({
        path: 'test.txt',
        content: 'Hello, world!',
        overwrite: false,
        encoding: 'utf-8'
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('already exists');
    }
  });

  it('should create the directory if it doesn\'t exist', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Not a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(new Error('Not a git repository'), { stdout: '', stderr: '' });
      return {} as any;
    });

    await writeFileTool.execute({
      path: 'dir/test.txt',
      content: 'Hello, world!',
      encoding: 'utf-8'
    });

    expect(fsMkdirStub.calledOnce).to.be.true;
    expect(fsMkdirStub.firstCall.args[0]).to.equal(path.dirname(path.resolve(workingDir, 'dir/test.txt')));
    expect(fsMkdirStub.firstCall.args[1]).to.deep.equal({ recursive: true });
  });

  it('should use utf-8 encoding by default', async () => {
    // File doesn't exist
    fsAccessStub.rejects(new Error('File not found'));
    
    // Not a git repository
    execStub.withArgs('git rev-parse --is-inside-work-tree').callsFake((cmd, callback) => {
      callback(new Error('Not a git repository'), { stdout: '', stderr: '' });
      return {} as any;
    });

    await writeFileTool.execute({
      path: 'test.txt',
      content: 'Hello, world!'
    });

    expect(fsWriteFileStub.firstCall.args[2]).to.deep.equal({ encoding: 'utf-8' });
  });
});
