import { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FileSystemUtils } from '../../src/task-planning/file-system-utils.js';

describe('FileSystemUtils', () => {
  const testDir = path.join(process.cwd(), 'test', 'temp-file-system-utils');

  before(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await fs.remove(testDir);
  });

  describe('Handling .gitignore patterns', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.log\nnode_modules/\n!important.log');
      await fs.writeFile(path.join(testDir, 'test.log'), 'Test log file');
      await fs.writeFile(path.join(testDir, 'important.log'), 'Important log file');
      await fs.mkdir(path.join(testDir, 'node_modules'));
      await fs.writeFile(path.join(testDir, 'node_modules', 'module.js'), 'console.log("module");');
    });

    afterEach(async () => {
      await fs.remove(path.join(testDir, '.gitignore'));
      await fs.remove(path.join(testDir, 'test.log'));
      await fs.remove(path.join(testDir, 'important.log'));
      await fs.remove(path.join(testDir, 'node_modules'));
    });

    it('should exclude .git directories', async () => {
      await fs.mkdir(path.join(testDir, '.git'));
      const result = await FileSystemUtils.scanDirectory(testDir);
      expect(result).not.to.include(path.join(testDir, '.git'));
    });

    it('should exclude files and directories listed in .gitignore', async () => {
      const result = await FileSystemUtils.scanDirectory(testDir);
      expect(result).not.to.include(path.join(testDir, 'test.log'));
      expect(result).not.to.include(path.join(testDir, 'node_modules', 'module.js'));
    });

    it('should include files negated in .gitignore', async () => {
      const result = await FileSystemUtils.scanDirectory(testDir);
      expect(result).to.include(path.join(testDir, 'important.log'));
    });

    it('should handle case-insensitive matching of .gitignore patterns', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.LOG\nNODE_MODULES/');
      const result = await FileSystemUtils.scanDirectory(testDir);
      expect(result).not.to.include(path.join(testDir, 'test.log'));
      expect(result).not.to.include(path.join(testDir, 'node_modules', 'module.js'));
    });

    it('should handle wildcard patterns in .gitignore', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), '*modules/\n*.LOG');
      const result = await FileSystemUtils.scanDirectory(testDir);
      expect(result).not.to.include(path.join(testDir, 'node_modules', 'module.js'));
      expect(result).not.to.include(path.join(testDir, 'test.log'));
    });

    it('should test createDirectoryStructure with .gitignore patterns', async () => {
      const structure = await FileSystemUtils.createDirectoryStructure(testDir);
      const nodeModules = structure.children?.find(child => child.name === 'node_modules');
      expect(nodeModules).to.be.undefined;
    });

    it('should test createContextProfile with .gitignore patterns', async () => {
      const profile = await FileSystemUtils.createContextProfile(testDir, testDir);
      expect(profile.files.map(file => file.path)).not.to.include(path.join(testDir, 'test.log'));
      expect(profile.files.map(file => file.path)).to.include(path.join(testDir, 'important.log'));
    });
  });
});
