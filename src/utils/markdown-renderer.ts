import { marked } from 'marked';
import { CodeRenderer, CodeBlock } from './code-renderer.js';
import { AppConfig } from '../config/config.js';

// Import marked-terminal with any type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { markedTerminal } from 'marked-terminal';

/**
 * Class for rendering markdown text in the terminal
 */
export class MarkdownRenderer {
  private config: AppConfig;
  private codeRenderer: CodeRenderer;
  private markdownEnabled: boolean;

  /**
   * Constructor
   * @param config - The application configuration
   * @param codeRenderer - The code renderer for handling code blocks
   */
  constructor(config: AppConfig, codeRenderer: CodeRenderer) {
    this.config = config;
    this.codeRenderer = codeRenderer;
    this.markdownEnabled = config.output?.markdownRendering !== false;

    // Configure marked with the terminal renderer
    marked.use(markedTerminal({
      // Custom code block handling to integrate with CodeRenderer
      code: (code: string, language?: string) => {
        return this.codeRenderer.render(code, language);
      },
      // Additional options can be configured here
      tableOptions: {
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      }
    }) as any)
  }

  /**
   * Renders markdown text
   * @param text - The markdown text to render
   * @returns The rendered text
   */
  render(text: string): string {
    if (!this.markdownEnabled) {
      // If markdown rendering is disabled, just use code block rendering
      return this.codeRenderer.renderCodeBlocks(text);
    }

    try {
      // Extract code blocks first so we can handle them separately
      const codeBlocks: CodeBlock[] = this.codeRenderer.extractCodeBlocks(text);
      
      // Replace code blocks with placeholders
      let processedText = text;
      const placeholders: { [key: string]: string } = {};
      
      codeBlocks.forEach((block, index) => {
        const placeholder = `__CODE_BLOCK_${index}__`;
        const codeBlockPattern = new RegExp('```' + block.language + '\\n' + this.escapeRegExp(block.code) + '```', 'g');
        processedText = processedText.replace(codeBlockPattern, placeholder);
        placeholders[placeholder] = '```' + block.language + '\n' + block.code + '```';
      });
      
      // Render the markdown
      const renderedText = marked.parse(processedText) as string;
      
      // Replace the placeholders with rendered code blocks
      let finalText = renderedText;
      Object.keys(placeholders).forEach(placeholder => {
        const codeBlock = placeholders[placeholder];
        const renderedCodeBlock = this.codeRenderer.renderCodeBlocks(codeBlock);
        finalText = finalText.replace(placeholder, renderedCodeBlock);
      });
      
      return finalText;
    } catch (error) {
      // Fall back to just code block rendering if markdown rendering fails
      console.error('Error rendering markdown:', error);
      return this.codeRenderer.renderCodeBlocks(text);
    }
  }

  /**
   * Escapes special characters in a string for use in a regular expression
   * @param string - The string to escape
   * @returns The escaped string
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
