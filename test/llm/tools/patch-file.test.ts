import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import { Stats } from 'fs';
import { PatchFileTool } from '../../../src/llm/tools/patch-file.js'; // Assuming PatchFileTool exists here

describe('PatchFileTool', () => {
  const workingDir = process.cwd();
  let patchFileTool: PatchFileTool;
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

    // Create PatchFileTool with mocked promptForApproval and fs
    // Assuming PatchFileTool constructor is similar to EditFileTool
    patchFileTool = new PatchFileTool(workingDir, promptForApprovalStub, mockFs);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should patch a file with valid content', async () => {
    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [{
        old_content: 'line 2\nline 3\nline 4',
        new_content: 'new line 2\nnew line 3\nnew line 4'
      }]
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
    const result = await patchFileTool.execute({
      file_path: '../outside.txt',
      changes: [{
        old_content: 'line 2\nline 3\nline 4',
        new_content: 'new content'
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('outside the working directory');
  });

  it('should return an error if the file does not exist', async () => {
    fsStatStub.rejects(new Error('File not found'));

    const result = await patchFileTool.execute({
      file_path: 'nonexistent.txt',
      changes: [{
        old_content: 'line 2\nline 3\nline 4',
        new_content: 'new content'
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not exist');
  });

  it('should return an error if the content is not found in the file', async () => {
    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [{
        old_content: 'content that does not exist',
        new_content: 'new content'
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('Could not find the specified content');
  });

  it('should return canceled status if user does not approve the patch', async () => {
    promptForApprovalStub.resolves(false);

    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [{
        old_content: 'line 2\nline 3\nline 4',
        new_content: 'new content'
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('canceled');
    expect(parsedResult.message).to.include('not approved');
  });

  it('should handle multiple changes in a single call correctly', async () => {
    // Set up a more complex file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7');

    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change: modify lines 2-3
          old_content: 'line 2\nline 3',
          new_content: 'modified line 2\nmodified line 3'
        },
        {
          // Second change: modify lines 5-6
          old_content: 'line 5\nline 6',
          new_content: 'modified line 5\nmodified line 6'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');
    expect(fsWriteFileStub.calledOnce).to.be.true;

    // The expected content after both changes are applied
    const expectedContent = 'line 1\nmodified line 2\nmodified line 3\nline 4\nmodified line 5\nmodified line 6\nline 7';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);

    // Verify that changes were applied
    // Assuming the tool returns the number of changes applied
    expect(parsedResult.changesApplied).to.equal(2);
  });

  it('should apply changes in the order they are specified', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');

    // This test checks that changes are applied in the order they are specified
    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change in the array
          old_content: 'line 1\nline 2',
          new_content: 'new line 1\nnew line 2'
        },
        {
          // Second change in the array
          old_content: 'line 4\nline 5',
          new_content: 'new line 4\nnew line 5'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');

    // The expected content after both changes are applied in the specified order
    const expectedContent = 'new line 1\nnew line 2\nline 3\nnew line 4\nnew line 5';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);
  });

  it('should handle replacing a single line', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');

    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [{
        old_content: 'line 3',
        new_content: 'replaced line 3'
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');

    // The expected content after the change is applied
    const expectedContent = 'line 1\nline 2\nreplaced line 3\nline 4\nline 5';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);
  });

  it('should handle replacing few lines with many more lines', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');

    // Create a new content with 10 lines
    const newLines = Array.from({ length: 10 }, (_, i) => `new line ${i + 1}`).join('\n');

    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [{
        old_content: 'line 2\nline 3',
        new_content: newLines
      }]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');

    // The expected content after the change is applied
    const expectedContent = `line 1\n${newLines}\nline 4\nline 5`;
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);

    // Verify that the file now has 13 lines (1 + 10 + 2)
    const resultLines = fsWriteFileStub.firstCall.args[1].split('\n');
    expect(resultLines.length).to.equal(13);
  });

  it('should handle complex scenarios with multiple changes of varying sizes', async () => {
    // Set up a more complex file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10');

    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // Replace a single line with multiple lines
          old_content: 'line 2',
          new_content: 'new line 2-1\nnew line 2-2\nnew line 2-3'
        },
        {
          // Replace multiple lines with a single line
          old_content: 'line 5\nline 6\nline 7',
          new_content: 'new combined line 5-7'
        },
        {
          // Replace the last line
          old_content: 'line 10',
          new_content: 'new line 10'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');

    // The expected content after all changes are applied in the correct order
    // Changes should be applied from bottom to top to avoid line number shifts
    const expectedContent = 'line 1\nnew line 2-1\nnew line 2-2\nnew line 2-3\nline 3\nline 4\nnew combined line 5-7\nline 8\nline 9\nnew line 10';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);

    // Verify that changes were applied
    expect(parsedResult.changesApplied).to.equal(3);
  });

  it('should handle sequential changes that modify the same content', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10');

    // Create changes that modify different parts of the file
    const result = await patchFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change: Replace line 3 with 5 new lines
          old_content: 'line 3',
          new_content: 'expanded line 3-1\nexpanded line 3-2\nexpanded line 3-3\nexpanded line 3-4\nexpanded line 3-5'
        },
        {
          // Second change: Replace line 6 with 3 new lines
          old_content: 'line 6',
          new_content: 'expanded line 6-1\nexpanded line 6-2\nexpanded line 6-3'
        },
        {
          // Third change: Replace line 9 with 2 new lines
          old_content: 'line 9',
          new_content: 'expanded line 9-1\nexpanded line 9-2'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');

    // The expected content after all changes are applied in the correct order (from bottom to top)
    // First apply change to line 9, then line 6, then line 3
    const expectedContent = 'line 1\nline 2\nexpanded line 3-1\nexpanded line 3-2\nexpanded line 3-3\nexpanded line 3-4\nexpanded line 3-5\nline 4\nline 5\nexpanded line 6-1\nexpanded line 6-2\nexpanded line 6-3\nline 7\nline 8\nexpanded line 9-1\nexpanded line 9-2\nline 10';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);

    // Verify that changes were applied
    expect(parsedResult.changesApplied).to.equal(3);

    // Verify the resulting file has the correct number of lines
    // Original 10 lines + 4 extra from line 3 + 2 extra from line 6 + 1 extra from line 9 = 17 lines
    const resultLines = fsWriteFileStub.firstCall.args[1].split('\n');
    expect(resultLines.length).to.equal(17);
  });
});
