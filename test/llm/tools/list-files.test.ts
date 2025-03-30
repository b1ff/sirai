import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ListFilesTool } from '../../../src/llm/tools/list-files.js';

describe('ListFilesTool', () => {
  // Create a temporary test directory
  const testDir = path.join(process.cwd(), 'test', 'temp-list-files');
  let listFilesTool: ListFilesTool;

  // Create test directory and files before all tests
  before(async () => {
    // Create test directory if it doesn't exist
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating test directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create test files with content
    await fs.writeFile(path.join(testDir, 'file.txt'), 'This is a regular file');
    await fs.writeFile(path.join(testDir, 'FILE.txt'), 'This is an uppercase file');

    // Create test directories
    await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'NODE_MODULES'), { recursive: true });

    // Create log files
    await fs.writeFile(path.join(testDir, 'test.log'), 'This is a log file');
    await fs.writeFile(path.join(testDir, 'TEST.LOG'), 'This is an uppercase log file');
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
    listFilesTool = new ListFilesTool(testDir);
  });

  describe('gitignore case sensitivity', () => {
    beforeEach(async () => {
      // Create .gitignore file for each test
      // The content will be set in each test
    });

    it('should handle gitignore patterns case-insensitively', async () => {
      // Create .gitignore file with specific patterns
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.log\nnode_modules/');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude both lowercase and uppercase versions
      // due to case-insensitive matching
      expect(result).to.include('file.txt');
      // On case-insensitive filesystems, only one of the files might be listed
      // So we'll check if either file.txt or FILE.txt is included
      const hasEitherFile = result.includes('file.txt') || result.includes('FILE.txt');
      expect(hasEitherFile).to.be.true;
      expect(result).not.to.include('node_modules');
      expect(result).not.to.include('NODE_MODULES');
      expect(result).not.to.include('test.log');
      expect(result).not.to.include('TEST.LOG');
    });

    it('should handle negated patterns in gitignore case-insensitively', async () => {
      // Create .gitignore file with negated patterns
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.log\n!TEST.LOG');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude .log files but include the negated one
      // Due to case-insensitive matching, both test.log and TEST.LOG might be included
      expect(result).to.include('file.txt');
      // On case-insensitive filesystems, only one of the files might be listed
      const hasEitherFile = result.includes('file.txt') || result.includes('FILE.txt');
      expect(hasEitherFile).to.be.true;

      // Check if either test.log or TEST.LOG is included due to the negation
      const hasEitherLogFile = result.includes('test.log') || result.includes('TEST.LOG');
      expect(hasEitherLogFile).to.be.true;
    });

    it('should handle wildcard patterns in gitignore case-insensitively', async () => {
      // Create .gitignore file with wildcard patterns
      await fs.writeFile(path.join(testDir, '.gitignore'), '*modules/\n*LOG');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude both lowercase and uppercase versions matching wildcards
      // due to case-insensitive matching
      expect(result).to.include('file.txt');
      // On case-insensitive filesystems, only one of the files might be listed
      const hasEitherFile = result.includes('file.txt') || result.includes('FILE.txt');
      expect(hasEitherFile).to.be.true;
      expect(result).not.to.include('node_modules');
      expect(result).not.to.include('NODE_MODULES');
      expect(result).not.to.include('test.log');
      expect(result).not.to.include('TEST.LOG');
    });
  });
});
