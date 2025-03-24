import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReadFileTool } from '../../../src/llm/tools/read-file.js';

describe('ReadFileTool', () => {
  const workingDir = process.cwd();
  let readFileTool: ReadFileTool;
  let fsAccessStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;

  beforeEach(() => {
    readFileTool = new ReadFileTool(workingDir);
    fsAccessStub = sinon.stub(fs, 'access').resolves();
    fsReadFileStub = sinon.stub(fs, 'readFile').resolves('file content');
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

  it('should throw an error if the file is outside the working directory', async () => {
    try {
      await readFileTool.execute({
        path: '../outside.txt',
        encoding: 'utf-8'
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('outside the working directory');
    }
  });

  it('should throw an error if the file does not exist', async () => {
    fsAccessStub.rejects(new Error('File not found'));

    try {
      await readFileTool.execute({
        path: 'nonexistent.txt',
        encoding: 'utf-8'
      });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect((error as Error).message).to.include('does not exist');
    }
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
