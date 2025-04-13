import { expect } from 'chai';
import { FileReferenceProcessor } from '../../src/utils/file-reference-processor.js';

describe('FileReferenceProcessor', () => {
  let fileReferenceProcessor: FileReferenceProcessor;

  beforeEach(() => {
    fileReferenceProcessor = new FileReferenceProcessor('.');
  });

  describe('extractFileReferences', () => {
    it('should extract file references with @ syntax', () => {
      const text = 'Please check @file1.js and @file2.ts for more details.';
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.deep.equal(['file1.js', 'file2.ts']).and.to.have.lengthOf(2);
    });

    it('should extract file references with double quotes', () => {
      const text = 'Please check "@file with spaces.js" and "@another file.ts" for more details.';
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.deep.equal(['@file with spaces.js', '@another file.ts']).and.to.have.lengthOf(2);
    });

    it('should extract file references with single quotes', () => {
      const text = "Please check '@file with spaces.js' and '@another file.ts' for more details.";
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.deep.equal(["@file with spaces.js", "@another file.ts"]).and.to.have.lengthOf(2);
    });

    it('should extract file references with mixed quote styles', () => {
      const text = "Check @simple.js, '@single quoted.js', and \"@double quoted.ts\" files.";
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.deep.equal(["@simple.js", "@single quoted.js", "@double quoted.ts"]).and.to.have.lengthOf(3);
    });

    it('should handle file paths with directories', () => {
      const text = 'Check @src/utils/helper.js and @test/data/sample.json';
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.deep.equal(['src/utils/helper.js', 'test/data/sample.json']).and.to.have.lengthOf(2);
    });

    it('should return empty array when no references are found', () => {
      const text = 'This text has no file references at all.';
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      expect(references).to.be.an('array').that.is.empty;
    });

    it('should handle multiple references to the same file', () => {
      const text = 'Check @file.js and also @file.js again';
      const references = fileReferenceProcessor.extractFileReferences(text);
      
      // Should return unique references
      expect(references).to.deep.equal(['file.js']).and.to.have.lengthOf(1);
    });
  });
});
