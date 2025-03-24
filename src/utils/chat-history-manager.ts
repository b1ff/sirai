import fs from 'fs-extra';
import path from 'path';
import { AppConfig } from '../config/config.js';

/**
 * Interface for chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

/**
 * Manages chat history
 */
export class ChatHistoryManager {
  private config: AppConfig;
  private historyDir: string;
  private historyFile: string;
  private maxMessages: number;

  /**
   * Constructor
   * @param config - The configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.historyDir = path.join(path.dirname(config.prompts.directory), 'history');
    this.historyFile = path.join(this.historyDir, 'chat-history.json');
    this.maxMessages = config.chat?.maxHistoryMessages || 20;
    
    // Ensure the history directory exists
    fs.ensureDirSync(this.historyDir);
  }

  /**
   * Loads the chat history
   * @returns The chat history
   */
  loadHistory(): ChatMessage[] {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }
      
      const historyData = fs.readFileSync(this.historyFile, 'utf8');
      return JSON.parse(historyData) as ChatMessage[];
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error loading chat history: ${error.message}`);
      } else {
        console.error('Error loading chat history: Unknown error');
      }
      return [];
    }
  }

  /**
   * Saves the chat history
   * @param history - The chat history to save
   * @returns True if the history was saved successfully
   */
  saveHistory(history: ChatMessage[]): boolean {
    try {
      // Limit the number of messages to save
      const limitedHistory = history.slice(-this.maxMessages);
      
      fs.writeFileSync(this.historyFile, JSON.stringify(limitedHistory, null, 2), 'utf8');
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error saving chat history: ${error.message}`);
      } else {
        console.error('Error saving chat history: Unknown error');
      }
      return false;
    }
  }

  /**
   * Clears the chat history
   * @returns True if the history was cleared successfully
   */
  clearHistory(): boolean {
    try {
      if (fs.existsSync(this.historyFile)) {
        fs.unlinkSync(this.historyFile);
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error clearing chat history: ${error.message}`);
      } else {
        console.error('Error clearing chat history: Unknown error');
      }
      return false;
    }
  }

  /**
   * Adds a message to the history and saves it
   * @param message - The message to add
   * @returns True if the message was added successfully
   */
  addMessage(message: ChatMessage): boolean {
    const history = this.loadHistory();
    
    // Add timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }
    
    history.push(message);
    return this.saveHistory(history);
  }
}