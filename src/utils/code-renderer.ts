import chalk from 'chalk';
import hljs from 'highlight.js';
import { AppConfig } from '../config/config.js';

/**
 * Interface for code block
 */
export interface CodeBlock {
  code: string;
  language: string;
}

/**
 * Renders code with syntax highlighting
 */
export class CodeRenderer {
  private config: AppConfig;
  private syntaxHighlighting: boolean;

  /**
   * Constructor
   * @param config - The configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.syntaxHighlighting = config.output?.syntaxHighlighting !== false;
  }

  /**
   * Detects the language of the code
   * @param code - The code to detect the language of
   * @returns The detected language
   */
  detectLanguage(code: string): string {
    try {
      const result = hljs.highlightAuto(code);
      return result.language || 'plaintext';
    } catch (error) {
      return 'plaintext';
    }
  }

  /**
   * Renders code with syntax highlighting
   * @param code - The code to render
   * @param language - The language of the code (optional, will be auto-detected if not provided)
   * @returns The rendered code
   */
  render(code: string, language?: string): string {
    if (!this.syntaxHighlighting) {
      return code;
    }

    try {
      // Detect language if not provided
      if (!language) {
        language = this.detectLanguage(code);
      }

      // Highlight the code
      const highlighted = language === 'plaintext'
        ? code
        : hljs.highlight(code, { language }).value;

      // Convert HTML to terminal colors
      return this.htmlToTerminal(highlighted);
    } catch (error) {
      // Fall back to plain text if highlighting fails
      return code;
    }
  }

  /**
   * Converts HTML to terminal colors
   * @param html - The HTML to convert
   * @returns The terminal-colored string
   */
  htmlToTerminal(html: string): string {
    // Replace HTML tags with terminal colors
    return html
      .replace(/<span class="hljs-keyword">(.*?)<\/span>/g, (_, p1) => chalk.blue(p1))
      .replace(/<span class="hljs-string">(.*?)<\/span>/g, (_, p1) => chalk.green(p1))
      .replace(/<span class="hljs-comment">(.*?)<\/span>/g, (_, p1) => chalk.gray(p1))
      .replace(/<span class="hljs-number">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-literal">(.*?)<\/span>/g, (_, p1) => chalk.cyan(p1))
      .replace(/<span class="hljs-built_in">(.*?)<\/span>/g, (_, p1) => chalk.cyan(p1))
      .replace(/<span class="hljs-function">(.*?)<\/span>/g, (_, p1) => chalk.magenta(p1))
      .replace(/<span class="hljs-title">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-params">(.*?)<\/span>/g, (_, p1) => chalk.white(p1))
      .replace(/<span class="hljs-operator">(.*?)<\/span>/g, (_, p1) => chalk.red(p1))
      .replace(/<span class="hljs-meta">(.*?)<\/span>/g, (_, p1) => chalk.gray(p1))
      .replace(/<span class="hljs-regexp">(.*?)<\/span>/g, (_, p1) => chalk.red(p1))
      .replace(/<span class="hljs-symbol">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-variable">(.*?)<\/span>/g, (_, p1) => chalk.white(p1))
      .replace(/<span class="hljs-template-variable">(.*?)<\/span>/g, (_, p1) => chalk.green(p1))
      .replace(/<span class="hljs-link">(.*?)<\/span>/g, (_, p1) => chalk.blue.underline(p1))
      .replace(/<span class="hljs-attr">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-tag">(.*?)<\/span>/g, (_, p1) => chalk.magenta(p1))
      .replace(/<span class="hljs-name">(.*?)<\/span>/g, (_, p1) => chalk.magenta(p1))
      .replace(/<span class="hljs-selector-tag">(.*?)<\/span>/g, (_, p1) => chalk.magenta(p1))
      .replace(/<span class="hljs-selector-id">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-selector-class">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-selector-attr">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-selector-pseudo">(.*?)<\/span>/g, (_, p1) => chalk.yellow(p1))
      .replace(/<span class="hljs-type">(.*?)<\/span>/g, (_, p1) => chalk.green(p1))
      .replace(/<span class="hljs-class">(.*?)<\/span>/g, (_, p1) => chalk.blue(p1))
      .replace(/<span class="hljs-rule">(.*?)<\/span>/g, (_, p1) => chalk.blue(p1))
      .replace(/<span class="hljs-property">(.*?)<\/span>/g, (_, p1) => chalk.cyan(p1))
      .replace(/<span class="hljs-value">(.*?)<\/span>/g, (_, p1) => chalk.green(p1))
      .replace(/<span class="hljs-emphasis">(.*?)<\/span>/g, (_, p1) => chalk.italic(p1))
      .replace(/<span class="hljs-strong">(.*?)<\/span>/g, (_, p1) => chalk.bold(p1))
      // Remove any remaining HTML tags
      .replace(/<[^>]*>/g, '');
  }

  /**
   * Extracts code blocks from a string
   * @param text - The text to extract code blocks from
   * @returns The extracted code blocks
   */
  extractCodeBlocks(text: string): CodeBlock[] {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const codeBlocks: CodeBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || this.detectLanguage(match[2]);
      codeBlocks.push({
        code: match[2],
        language
      });
    }

    return codeBlocks;
  }

  /**
   * Renders code blocks in a string
   * @param text - The text containing code blocks
   * @returns The text with rendered code blocks
   */
  renderCodeBlocks(text: string): string {
    if (!this.syntaxHighlighting) {
      return text;
    }

    return text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
      const lang = language || this.detectLanguage(code);
      const rendered = this.render(code, lang);
      return `\n${chalk.cyan('```')}${chalk.yellow(lang)}\n${rendered}\n${chalk.cyan('```')}\n`;
    });
  }
}