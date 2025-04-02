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
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 4,
        end_position_current_content: 'line 4',
        new_content: 'new line 2\nnew line 3\nnew line 4'
      }
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
      file_path: '../outside.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 4,
        end_position_current_content: 'line 4',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('outside the working directory');
  });

  it('should return an error if the file does not exist', async () => {
    fsStatStub.rejects(new Error('File not found'));

    const result = await editFileTool.execute({
      file_path: 'nonexistent.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 4,
        end_position_current_content: 'line 4',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not exist');
  });

  it('should return an error if the starting line number is out of bounds', async () => {
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 10,
        starting_position_current_content: 'line 10',
        end_position_line_number: 12,
        end_position_current_content: 'line 12',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('out of bounds');
  });

  it('should return an error if the ending line number is out of bounds', async () => {
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 10,
        end_position_current_content: 'line 10',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('out of bounds');
  });

  it('should return an error if the ending line is before the starting line', async () => {
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 4,
        starting_position_current_content: 'line 4',
        end_position_line_number: 2,
        end_position_current_content: 'line 2',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('before starting line');
  });

  it('should return an error if the content at the starting line does not match', async () => {
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'wrong content',
        end_position_line_number: 4,
        end_position_current_content: 'line 4',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not match expected content');
  });

  it('should return an error if the content at the ending line does not match', async () => {
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 4,
        end_position_current_content: 'wrong content',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('error');
    expect(parsedResult.message).to.include('does not match expected content');
  });

  it('should return canceled status if user does not approve the edit', async () => {
    promptForApprovalStub.resolves(false);

    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 4,
        end_position_current_content: 'line 4',
        new_content: 'new content'
      }
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('canceled');
    expect(parsedResult.message).to.include('not approved');
  });

  it('should handle multiple changes in a single call correctly', async () => {
    // Set up a more complex file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7');
    
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change: modify lines 2-3
          starting_position_line_number: 2,
          starting_position_current_content: 'line 2',
          end_position_line_number: 3,
          end_position_current_content: 'line 3',
          new_content: 'modified line 2\nmodified line 3'
        },
        {
          // Second change: modify lines 5-6
          starting_position_line_number: 5,
          starting_position_current_content: 'line 5',
          end_position_line_number: 6,
          end_position_current_content: 'line 6',
          new_content: 'modified line 5\nmodified line 6'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');
    expect(fsWriteFileStub.calledOnce).to.be.true;
    expect(fsWriteFileStub.calledOnce).to.be.true;

    // The expected content after both changes are applied
    const expectedContent = 'line 1\nmodified line 2\nmodified line 3\nline 4\nmodified line 5\nmodified line 6\nline 7';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);
    
    // Verify that changes were applied in the correct order
    expect(parsedResult.changesApplied).to.equal(2);
  });
  
  it('should apply changes in reverse order to avoid line number shifts', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');
    
    // This test specifically checks that changes are applied in reverse order
    // by line number to avoid line number shifts affecting subsequent edits
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change in the array (but should be applied second)
          starting_position_line_number: 1,
          starting_position_current_content: 'line 1',
          end_position_line_number: 2,
          end_position_current_content: 'line 2',
          new_content: 'new line 1\nnew line 2'
        },
        {
          // Second change in the array (but should be applied first)
          starting_position_line_number: 4,
          starting_position_current_content: 'line 4',
          end_position_line_number: 5,
          end_position_current_content: 'line 5',
          new_content: 'new line 4\nnew line 5'
        }
      ]
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).to.equal('success');
    
    // The expected content after both changes are applied in the correct order
    // First the lines 4-5 change, then the lines 1-2 change
    const expectedContent = 'new line 1\nnew line 2\nline 3\nnew line 4\nnew line 5';
    expect(fsWriteFileStub.firstCall.args[1]).to.equal(expectedContent);
  });

  it('should handle replacing a single line (start and end positions are the same)', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');
    
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 3,
        starting_position_current_content: 'line 3',
        end_position_line_number: 3,
        end_position_current_content: 'line 3',
        new_content: 'replaced line 3'
      }
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
    
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: {
        starting_position_line_number: 2,
        starting_position_current_content: 'line 2',
        end_position_line_number: 3,
        end_position_current_content: 'line 3',
        new_content: newLines
      }
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
    
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // Replace a single line with multiple lines
          starting_position_line_number: 2,
          starting_position_current_content: 'line 2',
          end_position_line_number: 2,
          end_position_current_content: 'line 2',
          new_content: 'new line 2-1\nnew line 2-2\nnew line 2-3'
        },
        {
          // Replace multiple lines with a single line
          starting_position_line_number: 5,
          starting_position_current_content: 'line 5',
          end_position_line_number: 7,
          end_position_current_content: 'line 7',
          new_content: 'new combined line 5-7'
        },
        {
          // Replace the last line
          starting_position_line_number: 10,
          starting_position_current_content: 'line 10',
          end_position_line_number: 10,
          end_position_current_content: 'line 10',
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
    
    // Verify that changes were applied in the correct order
    expect(parsedResult.changesApplied).to.equal(3);
  });

  it('should handle overlapping changes when new content increases file size', async () => {
    // Set up a file content for this test
    fsReadFileStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10');
    
    // Create changes that would overlap if applied in the wrong order
    const result = await editFileTool.execute({
      file_path: 'test.txt',
      changes: [
        {
          // First change: Replace line 3 with 5 new lines
          // This will shift all subsequent line numbers by +4
          starting_position_line_number: 3,
          starting_position_current_content: 'line 3',
          end_position_line_number: 3,
          end_position_current_content: 'line 3',
          new_content: 'expanded line 3-1\nexpanded line 3-2\nexpanded line 3-3\nexpanded line 3-4\nexpanded line 3-5'
        },
        {
          // Second change: Replace line 6 with 3 new lines
          // If first change is applied first, this line would now be at position 10
          starting_position_line_number: 6,
          starting_position_current_content: 'line 6',
          end_position_line_number: 6,
          end_position_current_content: 'line 6',
          new_content: 'expanded line 6-1\nexpanded line 6-2\nexpanded line 6-3'
        },
        {
          // Third change: Replace line 9 with 2 new lines
          // If previous changes are applied first, this line would be shifted
          starting_position_line_number: 9,
          starting_position_current_content: 'line 9',
          end_position_line_number: 9,
          end_position_current_content: 'line 9',
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
    
    // Verify that changes were applied in the correct order
    expect(parsedResult.changesApplied).to.equal(3);
    
    // Verify the resulting file has the correct number of lines
    // Original 10 lines + 4 extra from line 3 + 2 extra from line 6 + 1 extra from line 9 = 17 lines
    const resultLines = fsWriteFileStub.firstCall.args[1].split('\n');
    expect(resultLines.length).to.equal(17);
  });
});
