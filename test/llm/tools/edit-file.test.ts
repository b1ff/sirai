import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import { Stats } from 'fs';
import { EditFileTool } from '../../../src/llm/tools/edit-file.js';

describe('EditFileTool', () => {
  const workingDir = process.cwd();
  let editFileTool: EditFileTool;
  let fsStatStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;
  let fsWriteFileStub: sinon.SinonStub;
  let promptForApprovalStub: sinon.SinonStub;

  beforeEach(() => {
    // Create mock fs functions
    const mockStats = {
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: 0,
      blksize: 0,
      blocks: 0,
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      birthtimeMs: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date()
    } as Stats;

    fsStatStub = sinon.stub().resolves(mockStats);
    fsReadFileStub = sinon.stub().resolves('line 1\nline 2\nline 3\nline 4\nline 5');
    fsWriteFileStub = sinon.stub().resolves();

    // Create mock promptForApproval function
    promptForApprovalStub = sinon.stub().resolves(true);

    // Create mock fs object
    const mockFs = {
      stat: fsStatStub,
      readFile: fsReadFileStub,
      writeFile: fsWriteFileStub
    };

    // Create EditFileTool with mocked promptForApproval and fs
    editFileTool = new EditFileTool(workingDir, promptForApprovalStub, mockFs);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should edit a file with valid line numbers and content', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      newContent: 'new line 2\nnew line 3\nnew line 4'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');
    expect(fsStatStub.calledOnce).to.be.true;
    expect(fsReadFileStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.firstCall.args[0]).to.equal(path.resolve(workingDir, 'test.txt'));
    expect(fsWriteFileStub.firstCall.args[1]).to.equal('line 1\nnew line 2\nnew line 3\nnew line 4\nline 5');
  });

  it('should return an error if the file is outside the working directory', async () => {
    const result = await editFileTool.execute({
      file: '../outside.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('outside the working directory');
  });

  it('should return an error if the file does not exist', async () => {
    fsStatStub.rejects(new Error('File not found'));

    const result = await editFileTool.execute({
      file: 'nonexistent.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not exist');
  });

  it('should return an error if the starting line number is out of bounds', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 10,
        currentContent: 'line 10'
      },
      endPosition: {
        lineNumber: 12,
        currentContent: 'line 12'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('out of bounds');
  });

  it('should return an error if the ending line number is out of bounds', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 10,
        currentContent: 'line 10'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('out of bounds');
  });

  it('should return an error if the ending line is before the starting line', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      endPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('before starting line');
  });

  it('should return an error if the content at the starting line does not match', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'wrong content'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not match expected content');
  });

  it('should return an error if the content at the ending line does not match', async () => {
    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'wrong content'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not match expected content');
  });

  it('should return canceled status if user does not approve the edit', async () => {
    promptForApprovalStub.resolves(false);

    const result = await editFileTool.execute({
      file: 'test.txt',
      startingPosition: {
        lineNumber: 2,
        currentContent: 'line 2'
      },
      endPosition: {
        lineNumber: 4,
        currentContent: 'line 4'
      },
      newContent: 'new content'
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('canceled');
    expect(parsedResult.message).to.include('not approved');
  });
});
