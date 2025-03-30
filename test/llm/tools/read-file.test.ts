import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import { ReadFileTool } from '../../../src/llm/tools/read-file.js';

describe('ReadFileTool', () => {
  const workingDir = process.cwd();
  let readFileTool: ReadFileTool;
  let fsAccessStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;
  let mockFs: { access: sinon.SinonStub; readFile: sinon.SinonStub };

  beforeEach(() => {
    // Create mock fs functions
    fsAccessStub = sinon.stub().resolves();
    fsReadFileStub = sinon.stub().resolves('file content');

    // Create mock fs object
    mockFs = {
      access: fsAccessStub,
      readFile: fsReadFileStub
    };

    // Create ReadFileTool with mock fs
    readFileTool = new ReadFileTool(workingDir, mockFs);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should read a file in the working directory', async () => {
    const result = await readFileTool.execute({
      path: 'test.txt',
      encoding: 'utf-8'
    });

    expect(result).to.equal('file content');
    expect(fsAccessStub.calledOnce).to.be.true;
    expect(fsReadFileStub.calledOnce).to.be.true;
    expect(fsReadFileStub.firstCall.args[0]).to.equal(path.resolve(workingDir, 'test.txt'));
    expect(fsReadFileStub.firstCall.args[1]).to.deep.equal({ encoding: 'utf-8' });
  });

  it('should return an error message if the file is outside the working directory', async () => {
    const result = await readFileTool.execute({
      path: '../outside.txt',
      encoding: 'utf-8'
    });

    expect(result).to.include('outside the working directory');
  });

  it('should return an error message if the file does not exist', async () => {
    fsAccessStub.rejects(new Error('File not found'));

    const result = await readFileTool.execute({
      path: 'nonexistent.txt',
      encoding: 'utf-8'
    });

    expect(result).to.include('does not exist');
  });

  it('should use utf-8 encoding by default', async () => {
    await readFileTool.execute({
      path: 'test.txt'
    });

    expect(fsReadFileStub.firstCall.args[1]).to.deep.equal({ encoding: 'utf-8' });
  });

  it('should support different encodings', async () => {
    await readFileTool.execute({
      path: 'test.txt',
      encoding: 'binary'
    });

    expect(fsReadFileStub.firstCall.args[1]).to.deep.equal({ encoding: 'binary' });
  });
});
