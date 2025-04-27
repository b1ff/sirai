import { BaseTool, FileSourceLlmPreparation } from './tools/index.js';

interface LLMMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class LlmRequest {
    protected systemPrompt?: string;
    protected prompt: string | null = null;
    private messages: LLMMessage[] = [];
    private tools: BaseTool[] = [];

    get systemPromptText() {
        return this.systemPrompt;
    }

    get promptText() {
        if (!this.prompt) {
            throw new Error('Prompt not set, but requested.');
        }

        return this.prompt;
    }

    get combinedMessages() {
        const result: LLMMessage[] = [];
        if (this.systemPrompt) {
            result.push({role: 'system', content: this.systemPrompt});
        }

        if (this.prompt) {
            result.push({role: 'user', content: this.prompt});
        }

        result.push(...this.messages);
        return result;
    }

    get toolsList() {
        return this.tools;
    }

    withSystemPrompt(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        return this;
    }

    withPrompt(prompt: string) {
        this.prompt = prompt;
        return this;
    }

    withTool(tool: BaseTool) {
        this.tools.push(tool);
        return this;
    }

    withTools(tools: BaseTool[]) {
        this.tools.push(...tools);
        return this;
    }

    withUserMessage(message: string) {
        this.messages.push({role: 'user', content: message});
        return this;
    }

    async addFile(path: string, projectDir: string){
        const fileSourcePrepare = new FileSourceLlmPreparation([
            { path }
        ], projectDir);
        const fileContent = await fileSourcePrepare.renderForLlm(false);
        return this.withUserMessage(fileContent)
    }
}
