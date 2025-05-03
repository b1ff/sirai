import * as fs from 'fs';
import * as path from 'path';

export interface TraceEntry {
  timestamp: string;
  type: 'prompt' | 'user-message' | 'response' | 'tool-call' | 'tool-result' | 'error';
  content: string;
  metadata?: Record<string, any>;
}

export class AITracer {
  private static instance: AITracer;
  private traceFile: string;
  private enabled: boolean = true;

  private constructor() {
    const now = new Date();
    const dateStr = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `ai-trace-${dateStr}.md`;
    
    // Create the directory path if it doesn't exist
    const tracesDir = path.join(process.cwd(), '.sirai/traces/');
    if (!fs.existsSync(tracesDir)) {
      fs.mkdirSync(tracesDir, { recursive: true });
    }
    
    this.traceFile = path.join(tracesDir, filename);
    
    // Initialize the trace file with a header
    fs.writeFileSync(
      this.traceFile,
      `# AI Interaction Trace\n\nStarted: ${now.toLocaleString()}\n\n`
    );
  }

  public static getInstance(): AITracer {
    if (!AITracer.instance) {
      AITracer.instance = new AITracer();
    }
    return AITracer.instance;
  }

  public tracePrompt(systemInstructions: string | undefined, userInput: string): void {
    if (!this.enabled) return;
    
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'prompt',
      content: userInput,
      metadata: {
        systemInstructions: systemInstructions || ''
      }
    };
    
    this.appendToFile(this.formatPrompt(entry));
  }

  public traceUserMessage(message: string): void {
    if (!this.enabled) return;

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'user-message',
      content: message
    };

    this.appendToFile(this.formatUserMessage(entry));
  }

  private formatUserMessage(entry: TraceEntry): string {
    return `## User Message (${new Date(entry.timestamp).toLocaleTimeString()})\n\n` +
      `\`\`\`\n${this.escapeMarkdown(entry.content)}\n\`\`\`\n\n`;
  }

  public traceResponse(response: string): void {
    if (!this.enabled) return;
    
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'response',
      content: response
    };
    
    this.appendToFile(this.formatResponse(entry));
  }

  public traceToolCall(toolName: string, args: Record<string, unknown>): void {
    if (!this.enabled) return;
    
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'tool-call',
      content: JSON.stringify(args, null, 2),
      metadata: {
        toolName
      }
    };
    
    this.appendToFile(this.formatToolCall(entry));
  }

  public traceToolResult(toolName: string, result: any): void {
    if (!this.enabled) return;
    
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'tool-result',
      content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      metadata: {
        toolName
      }
    };
    
    this.appendToFile(this.formatToolResult(entry));
  }

  private formatPrompt(entry: TraceEntry): string {
    return `## Prompt (${new Date(entry.timestamp).toLocaleTimeString()})\n\n` +
      (entry.metadata?.systemInstructions ? 
        `### System Instructions\n\n\`\`\`\n${this.escapeMarkdown(entry.metadata.systemInstructions)}\n\`\`\`\n\n` : '') +
      `### User Input\n\n\`\`\`\n${this.escapeMarkdown(entry.content)}\n\`\`\`\n\n`;
  }

  private formatResponse(entry: TraceEntry): string {
    return `## Response (${new Date(entry.timestamp).toLocaleTimeString()})\n\n` +
      `\`\`\`\n${this.escapeMarkdown(entry.content)}\n\`\`\`\n\n`;
  }

  private formatToolCall(entry: TraceEntry): string {
    return `## Tool Call: ${entry.metadata?.toolName} (${new Date(entry.timestamp).toLocaleTimeString()})\n\n` +
      `### Arguments\n\n\`\`\`json\n${this.escapeMarkdown(entry.content)}\n\`\`\`\n\n`;
  }

  private formatToolResult(entry: TraceEntry): string {
    return `### Result\n\n\`\`\`\n${this.escapeMarkdown(entry.content)}\n\`\`\`\n\n`;
  }

  private escapeMarkdown(content: string): string {
    // Replace backticks with escaped backticks
    return content.replace(/`/g, '\\`');
  }

  private appendToFile(content: string): void {
    try {
      // Make sure the directory exists before appending
      const dir = path.dirname(this.traceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.appendFileSync(this.traceFile, content);
    } catch (error) {
      console.error('Failed to write to trace file:', error);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getTraceFilePath(): string {
    return this.traceFile;
  }

  public traceError(e: unknown) {
    if (!this.enabled) return;

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      content: e instanceof Error ? JSON.stringify(e, null, 2) : String(e)
    };

    this.appendToFile(`## Error (${new Date(entry.timestamp).toLocaleTimeString()})\n\n` +
      `\`\`\`\n${entry.content}\n\`\`\`\n\n`);
  }
}
