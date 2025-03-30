import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSourceLlmPreparation } from '../../../src/llm/tools/file-source-llm-preparation.js';
import { FileToRead } from '../../../src/task-planning/schemas.js';

describe('FileSourceLlmPreparation', () => {
  // Create a temporary test directory
  const testDir = path.join(process.cwd(), 'test', 'temp');
  let fileSourceLlmPreparation: FileSourceLlmPreparation;

  const testFiles: FileToRead[] = [
    { path: path.join('test', 'temp', 'test1.txt'), syntax: 'text' },
    { path: path.join('test', 'temp', 'test2.js'), syntax: 'javascript' }
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
    fileSourceLlmPreparation = new FileSourceLlmPreparation(testFiles, process.cwd());
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
});
