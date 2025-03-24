import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { ListFilesTool } from '../../../src/llm/tools/list-files.js';

describe('ListFilesTool', () => {
  const workingDir = process.cwd();
  let listFilesTool: ListFilesTool;
  let fsStatStub: sinon.SinonStub;
  let fsReadDirStub: sinon.SinonStub;
  let fsExtraPathExistsStub: sinon.SinonStub;
  let fsExtraReadFileStub: sinon.SinonStub;

  beforeEach(() => {
    listFilesTool = new ListFilesTool(workingDir);

    // Stub fs.stat to simulate directory existence
    fsStatStub = sinon.stub(fsPromises, 'stat').resolves({
      isDirectory: () => true
    } as fs.Stats);

    // Stub fs.readdir to return mock directory entries
    fsReadDirStub = sinon.stub(fsPromises, 'readdir');

    // Stub fsExtra.pathExists to simulate .gitignore existence
    fsExtraPathExistsStub = sinon.stub(fsExtra, 'pathExists');

    // Stub fsExtra.readFile to return mock .gitignore content
    fsExtraReadFileStub = sinon.stub(fsExtra, 'readFile');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('gitignore case sensitivity', () => {
    beforeEach(() => {
      // Setup for gitignore tests
      fsExtraPathExistsStub.resolves(true);

      // Mock directory structure
      fsReadDirStub.resolves([
        {
          name: 'file.txt',
          isDirectory: () => false,
          isFile: () => true
        },
        {
          name: 'FILE.txt',
          isDirectory: () => false,
          isFile: () => true
        },
        {
          name: 'node_modules',
          isDirectory: () => true,
          isFile: () => false
        },
        {
          name: 'NODE_MODULES',
          isDirectory: () => true,
          isFile: () => false
        },
        {
          name: 'test.log',
          isDirectory: () => false,
          isFile: () => true
        },
        {
          name: 'TEST.LOG',
          isDirectory: () => false,
          isFile: () => true
        }
      ]);
    });

    it('should respect case sensitivity in gitignore patterns', async () => {
      // Set up .gitignore content with specific patterns
      fsExtraReadFileStub.resolves('*.log\nnode_modules/');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude both lowercase and uppercase versions
      expect(result).to.include('file.txt');
      expect(result).to.include('FILE.txt');
      expect(result).not.to.include('node_modules');
      expect(result).not.to.include('NODE_MODULES');
      expect(result).not.to.include('test.log');
      expect(result).not.to.include('TEST.LOG');
    });

    it('should handle negated patterns in gitignore with case sensitivity', async () => {
      // Set up .gitignore content with negated patterns
      fsExtraReadFileStub.resolves('*.log\n!TEST.log');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude lowercase .log files but include the negated uppercase one
      expect(result).to.include('file.txt');
      expect(result).to.include('FILE.txt');
      expect(result).not.to.include('test.log');
      expect(result).to.include('TEST.LOG');
    });

    it('should handle wildcard patterns with case sensitivity', async () => {
      // Set up .gitignore content with wildcard patterns
      fsExtraReadFileStub.resolves('*modules/\n*LOG');

      const result = await listFilesTool.execute({
        directory: '.',
        depth: 0
      });

      // The tool should exclude both lowercase and uppercase versions matching wildcards
      expect(result).to.include('file.txt');
      expect(result).to.include('FILE.txt');
      expect(result).not.to.include('node_modules');
      expect(result).not.to.include('NODE_MODULES');
      expect(result).not.to.include('test.log');
      expect(result).not.to.include('TEST.LOG');
    });
  });
});
