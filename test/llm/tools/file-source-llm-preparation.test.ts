import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSourceLlmPreparation } from '../../../src/llm/tools/file-source-llm-preparation.js';
import { FileToRead } from '../../../src/task-planning/schemas.js';
import * as sinon from 'sinon';

describe('FileSourceLlmPreparation', () => {
  // Create a temporary test directory
  const testDir = path.join(process.cwd(), 'test', 'temp');
  let fileSourceLlmPreparation: FileSourceLlmPreparation;
  let sandbox: sinon.SinonSandbox;

  const testFiles: FileToRead[] = [
    { path: path.join('test', 'temp', 'test1.txt'), syntax: 'text' },
    { path: path.join('test', 'temp', 'test2.js'), syntax: 'javascript' }
  ];

  const referencedFiles: FileToRead[] = [
    { path: path.join('test', 'temp', 'referenced1.txt'), syntax: 'text' },
    { path: path.join('test', 'temp', 'referenced2.js'), syntax: 'javascript' }
  ];

  // Create test directory and files before tests
  before(async () => {
    // Create test directory if it doesn't exist
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating test directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create test files with content
    await fs.writeFile(path.join(testDir, 'test1.txt'), 'This is test file 1');
    await fs.writeFile(path.join(testDir, 'test2.js'), 'console.log("This is test file 2");');
    await fs.writeFile(path.join(testDir, 'referenced1.txt'), 'This is referenced file 1');
    await fs.writeFile(path.join(testDir, 'referenced2.js'), 'console.log("This is referenced file 2");');
  });

  // Clean up test files after tests
  after(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Error removing test directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fileSourceLlmPreparation = new FileSourceLlmPreparation(testFiles, process.cwd());
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should initialize with files and project directory', () => {
    expect(fileSourceLlmPreparation).to.be.an.instanceOf(FileSourceLlmPreparation);
  });

  it('should render files without line numbers', async () => {
    const result = await fileSourceLlmPreparation.renderForLlm(false);

    expect(result).to.include(`<file path="${path.join('test', 'temp', 'test1.txt')}" syntax="text">`);
    expect(result).to.include('This is test file 1');
    expect(result).to.include(`<file path="${path.join('test', 'temp', 'test2.js')}" syntax="javascript">`);
    expect(result).to.include('console.log("This is test file 2");');
    expect(result).not.to.include('1:This is test file 1');
    expect(result).not.to.include('1:console.log("This is test file 2");');
  });

  it('should render files with line numbers', async () => {
    const result = await fileSourceLlmPreparation.renderForLlm(true);

    expect(result).to.include(`<file path="${path.join('test', 'temp', 'test1.txt')}" syntax="text">`);
    expect(result).to.include('1:This is test file 1');
    expect(result).to.include(`<file path="${path.join('test', 'temp', 'test2.js')}" syntax="javascript">`);
    expect(result).to.include('1:console.log("This is test file 2");');
  });

  it('should handle errors when reading files', async () => {
    // Create a non-existent file path for testing error handling
    const nonExistentFiles: FileToRead[] = [
      { path: path.join('test', 'temp', 'non-existent.txt'), syntax: 'text' },
      { path: path.join('test', 'temp', 'test2.js'), syntax: 'javascript' }
    ];

    fileSourceLlmPreparation = new FileSourceLlmPreparation(nonExistentFiles, process.cwd());
    const result = await fileSourceLlmPreparation.renderForLlm(false);

    // Should still include the second file
    expect(result).to.include(`<file path="${path.join('test', 'temp', 'test2.js')}" syntax="javascript">`);
    expect(result).to.include('console.log("This is test file 2");');

    // Should include error message for the first file
    expect(result).to.include(`Error reading file: ${path.join('test', 'temp', 'non-existent.txt')}`);
  });

  it('should handle empty files array', async () => {
    fileSourceLlmPreparation = new FileSourceLlmPreparation([], process.cwd());
    const result = await fileSourceLlmPreparation.renderForLlm();

    expect(result).to.equal('');
  });

  it('should handle null or undefined files array', async () => {
    // @ts-ignore - Testing with null for robustness
    fileSourceLlmPreparation = new FileSourceLlmPreparation(null, process.cwd());
    let result = await fileSourceLlmPreparation.renderForLlm();

    expect(result).to.equal('');

    // @ts-ignore - Testing with undefined for robustness
    fileSourceLlmPreparation = new FileSourceLlmPreparation(undefined, process.cwd());
    result = await fileSourceLlmPreparation.renderForLlm();

    expect(result).to.equal('');
  });

  // Tests for referenced files functionality
  describe('Referenced files functionality', () => {
    it('should add a single referenced file', () => {
      fileSourceLlmPreparation.addReferencedFile(referencedFiles[0]);
      const result = fileSourceLlmPreparation.getReferencedFiles();
      
      expect(result).to.deep.equal([referencedFiles[0]]);
    });

    it('should add multiple referenced files', () => {
      fileSourceLlmPreparation.addReferencedFiles(referencedFiles);
      const result = fileSourceLlmPreparation.getReferencedFiles();
      
      expect(result).to.deep.equal(referencedFiles);
    });

    it('should not add duplicate referenced files', () => {
      fileSourceLlmPreparation.addReferencedFile(referencedFiles[0]);
      fileSourceLlmPreparation.addReferencedFile(referencedFiles[0]);
      const result = fileSourceLlmPreparation.getReferencedFiles();
      
      expect(result).to.have.lengthOf(1);
      expect(result).to.deep.equal([referencedFiles[0]]);
    });

    it('should return all files (explicit and referenced)', () => {
      fileSourceLlmPreparation.addReferencedFiles(referencedFiles);
      const result = fileSourceLlmPreparation.getAllFiles();
      
      expect(result).to.have.lengthOf(testFiles.length + referencedFiles.length);
      expect(result).to.deep.include.members([...testFiles, ...referencedFiles]);
    });

    it('should include referenced files in renderForLlm output when includeReferencedFiles is true', async () => {
      fileSourceLlmPreparation.addReferencedFiles(referencedFiles);
      const result = await fileSourceLlmPreparation.renderForLlm(false, true);
      
      // Check for explicit files
      expect(result).to.include(`<file path="${path.join('test', 'temp', 'test1.txt')}" syntax="text">`);
      expect(result).to.include('This is test file 1');
      
      // Check for referenced files
      expect(result).to.include(`<file path="${path.join('test', 'temp', 'referenced1.txt')}" syntax="text">`);
      expect(result).to.include('This is referenced file 1');
    });

    it('should not include referenced files in renderForLlm output when includeReferencedFiles is false', async () => {
      fileSourceLlmPreparation.addReferencedFiles(referencedFiles);
      const result = await fileSourceLlmPreparation.renderForLlm(false, false);
      
      // Check for explicit files
      expect(result).to.include(`<file path="${path.join('test', 'temp', 'test1.txt')}" syntax="text">`);
      expect(result).to.include('This is test file 1');
      
      // Check that referenced files are not included
      expect(result).not.to.include(`<file path="${path.join('test', 'temp', 'referenced1.txt')}" syntax="text">`);
      expect(result).not.to.include('This is referenced file 1');
    });

    it('should handle errors when reading referenced files', async () => {
      const nonExistentReferencedFile: FileToRead = { 
        path: path.join('test', 'temp', 'non-existent-ref.txt'), 
        syntax: 'text' 
      };
      
      fileSourceLlmPreparation.addReferencedFile(nonExistentReferencedFile);
      fileSourceLlmPreparation.addReferencedFile(referencedFiles[0]);
      
      const result = await fileSourceLlmPreparation.renderForLlm(false, true);
      
      // Should include error message for the non-existent file
      expect(result).to.include(`Error reading file: ${path.join('test', 'temp', 'non-existent-ref.txt')}`);
      
      // Should still include the valid referenced file
      expect(result).to.include(`<file path="${path.join('test', 'temp', 'referenced1.txt')}" syntax="text">`);
      expect(result).to.include('This is referenced file 1');
    });
  });
});
