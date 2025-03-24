import { expect } from 'chai';
import { ListFilesTool } from '../src/llm/tools/list-files.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('GitIgnore Case Sensitivity Manual Test', function() {
  this.timeout(10000); // Increase timeout for file operations

  let tempDir: string;

  before(async function() {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), 'temp-test-gitignore');

    // Create the directory if it doesn't exist
    try {
      await fs.mkdir(tempDir);
    } catch (error) {
      // Directory might already exist, ignore the error
    }

    // Create test files with different cases
    await fs.writeFile(path.join(tempDir, 'test.log'), 'Test log file');
    await fs.writeFile(path.join(tempDir, 'TEST.LOG'), 'Test log file uppercase');
    await fs.writeFile(path.join(tempDir, 'example.txt'), 'Example text file');

    // Create a subdirectory
    const nodeModulesDir = path.join(tempDir, 'node_modules');
    try {
      await fs.mkdir(nodeModulesDir);
    } catch (error) {
      // Directory might already exist, ignore the error
    }

    // Create a file in the subdirectory
    await fs.writeFile(path.join(nodeModulesDir, 'package.json'), '{}');

    // Create another subdirectory with uppercase
    const nodeModulesDirUpper = path.join(tempDir, 'NODE_MODULES');
    try {
      await fs.mkdir(nodeModulesDirUpper);
    } catch (error) {
      // Directory might already exist, ignore the error
    }

    // Create a file in the uppercase subdirectory
    await fs.writeFile(path.join(nodeModulesDirUpper, 'package.json'), '{}');

    // Create a .gitignore file
    await fs.writeFile(path.join(tempDir, '.gitignore'), '*.log\nnode_modules/');
  });

  after(async function() {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should respect case insensitivity in gitignore patterns', async function() {
    // Initialize the ListFilesTool with the temp directory
    const listFilesTool = new ListFilesTool(tempDir);

    // Execute the tool
    const result = await listFilesTool.execute({
      directory: '.',
      depth: 2,
      includeDirs: true
    });

    console.log('Result:');
    console.log(result);

    // Verify that both lowercase and uppercase versions are excluded
    expect(result).to.include('example.txt');
    expect(result).not.to.include('test.log');
    expect(result).not.to.include('TEST.LOG');
    expect(result).not.to.include('node_modules');
    expect(result).not.to.include('NODE_MODULES');
  });
});
