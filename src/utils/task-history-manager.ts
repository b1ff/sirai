import fs from 'fs-extra';
import path from 'path';
import { AppConfig } from '../config/config.js';
import { TaskPlan, Subtask } from '../task-planning/schemas.js';

/**
 * Manages task execution history
 */
export class TaskHistoryManager {
  private config: AppConfig;
  private historyDir: string;
  private historyFile: string;
  private maxTasks: number;

  /**
   * Constructor
   * @param config - The application configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.historyDir = path.join(path.dirname(config.prompts.directory), 'history');
    this.historyFile = path.join(this.historyDir, 'task-history.json');
    this.maxTasks = config.tasks?.maxHistoryTasks || 50;
    
    // Ensure the history directory exists
    fs.ensureDirSync(this.historyDir);
  }

  /**
   * Loads the task history
   * @returns The task history
   */
  private loadHistory(): TaskPlan[] {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }
      
      const historyData = fs.readFileSync(this.historyFile, 'utf8');
      return JSON.parse(historyData) as TaskPlan[];
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error loading task history: ${error.message}`);
      } else {
        console.error('Error loading task history: Unknown error');
      }
      return [];
    }
  }

  /**
   * Saves the task history
   * @param history - The task history to save
   * @returns True if the history was saved successfully
   */
  private saveHistory(history: TaskPlan[]): boolean {
    try {
      // Limit the number of tasks to save
      const limitedHistory = history.slice(-this.maxTasks);
      
      fs.writeFileSync(this.historyFile, JSON.stringify(limitedHistory, null, 2), 'utf8');
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error saving task history: ${error.message}`);
      } else {
        console.error('Error saving task history: Unknown error');
      }
      return false;
    }
  }

  /**
   * Adds a completed task to the history
   * @param task - The completed task to add
   * @returns True if the task was added successfully
   */
  addCompletedTask(task: TaskPlan): boolean {
    try {
      const history = this.loadHistory();
      
      // Add timestamp if not present
      const taskWithTimestamp = {
        ...task,
        completedAt: task.completedAt || Date.now()
      };
      
      history.push(taskWithTimestamp);
      return this.saveHistory(history);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error adding completed task: ${error.message}`);
      } else {
        console.error('Error adding completed task: Unknown error');
      }
      return false;
    }
  }

  /**
   * Gets all completed tasks
   * @returns Array of completed tasks
   */
  getCompletedTasks(): TaskPlan[] {
    return this.loadHistory();
  }

  /**
   * Gets a summary of completed tasks
   * @returns A string summary of completed tasks
   */
  getCompletedTasksSummary(): string {
    const tasks = this.loadHistory();
    
    if (tasks.length === 0) {
      return "No completed tasks found.";
    }
    
    const summary = tasks.map((task, index) => {
      const date = task.completedAt 
        ? new Date(task.completedAt).toLocaleString() 
        : 'Unknown date';
      
      return `${index + 1}. ${task.originalRequest.substring(0, 100)}${task.originalRequest.length > 100 ? '...' : ''} (${date})`;
    }).join('\n');
    
    return `Completed Tasks (${tasks.length}):\n${summary}`;
  }

  /**
   * Clears the task history
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
        console.error(`Error clearing task history: ${error.message}`);
      } else {
        console.error('Error clearing task history: Unknown error');
      }
      return false;
    }
  }
}