import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSourceLlmPreparation } from '../../../src/llm/tools/file-source-llm-preparation.js';
import { FileToRead } from '../../../src/task-planning/schemas.js';

describe('FileSourceLlmPreparation', () => {
  const workingDir = process.cwd();
  let fileSourceLlmPreparation: FileSourceLlmPreparation;
  let fsReadFileStub: sinon.SinonStub;
  
  const testFiles: FileToRead[] = [
    { path: 'test1.txt', syntax: 'text' },
    { path: 'test2.js', syntax: 'javascript' }
  ];

  beforeEach(() => {
    fileSourceLlmPreparation = new FileSourceLlmPreparation(testFiles, workingDir);
    fsReadFileStub = sinon.stub(fs, 'readFile');
    
    // Set up stub responses for each file
    fsReadFileStub.withArgs(path.resolve(workingDir, 'test1.txt'), 'utf-8')
      .resolves('This is test file 1');
    fsReadFileStub.withArgs(path.resolve(workingDir, 'test2.js'), 'utf-8')
      .resolves('console.log("This is test file 2");');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should initialize with files and project directory', () => {
    expect(fileSourceLlmPreparation).to.be.an.instanceOf(FileSourceLlmPreparation);
  });

  it('should render files without line numbers', async () => {
    const result = await fileSourceLlmPreparation.renderForLlm(false);
    
    expect(result).to.include('<file path="test1.txt" syntax="text">');
    expect(result).to.include('This is test file 1');
    expect(result).to.include('<file path="test2.js" syntax="javascript">');
    expect(result).to.include('console.log("This is test file 2");');
    expect(result).not.to.include('1:This is test file 1');
    expect(result).not.to.include('1:console.log("This is test file 2");');
    
    expect(fsReadFileStub.calledTwice).to.be.true;
  });

  it('should render files with line numbers', async () => {
    const result = await fileSourceLlmPreparation.renderForLlm(true);
    
    expect(result).to.include('<file path="test1.txt" syntax="text">');
    expect(result).to.include('1:This is test file 1');
    expect(result).to.include('<file path="test2.js" syntax="javascript">');
    expect(result).to.include('1:console.log("This is test file 2");');
    
    expect(fsReadFileStub.calledTwice).to.be.true;
  });

  it('should handle errors when reading files', async () => {
    // Reset the stub to reject for one file
    fsReadFileStub.withArgs(path.resolve(workingDir, 'test1.txt'), 'utf-8')
      .rejects(new Error('File not found'));
    
    const result = await fileSourceLlmPreparation.renderForLlm(false);
    
    // Should still include the second file
    expect(result).to.include('<file path="test2.js" syntax="javascript">');
    expect(result).to.include('console.log("This is test file 2");');
    
    // Should include error message for the first file
    expect(result).to.include('Error reading file: test1.txt');
  });

  it('should handle empty files array', async () => {
    fileSourceLlmPreparation = new FileSourceLlmPreparation([], workingDir);
    const result = await fileSourceLlmPreparation.renderForLlm();
    
    expect(result).to.equal('');
    expect(fsReadFileStub.called).to.be.false;
  });

  it('should handle null or undefined files array', async () => {
    // @ts-ignore - Testing with null for robustness
    fileSourceLlmPreparation = new FileSourceLlmPreparation(null, workingDir);
    let result = await fileSourceLlmPreparation.renderForLlm();
    
    expect(result).to.equal('');
    expect(fsReadFileStub.called).to.be.false;
    
    // @ts-ignore - Testing with undefined for robustness
    fileSourceLlmPreparation = new FileSourceLlmPreparation(undefined, workingDir);
    result = await fileSourceLlmPreparation.renderForLlm();
    
    expect(result).to.equal('');
    expect(fsReadFileStub.called).to.be.false;
  });
});
