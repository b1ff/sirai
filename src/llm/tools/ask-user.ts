import { z } from 'zod';
import { BaseTool } from './base.js';
import readline from 'node:readline';

/**
 * Tool for asking the user questions and getting responses
 */
export class AskUserTool extends BaseTool {
  /**
   * The name of the tool
   */
  name = 'ask_user';

  /**
   * The description of the tool
   */
  description = 'Ask the user one or more questions and get their responses. Use this when you need clarification or additional information from the user. Provide an array of questions, and the tool will ask them one by one and return the answers.';

  /**
   * The parameters of the tool
   */
  parameters = z.object({
    questions: z.array(z.string()).min(1).max(8).describe('An array of questions to ask the user. Limited to a maximum of 8 questions.'),
    context: z.string().optional().describe('Optional context to provide before asking the questions')
  });

  /**
   * Creates a readline interface for user input
   * @returns A readline interface
   */
  private createReadlineInterface(): readline.Interface {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Asks a single question and returns the answer
   * @param rl - The readline interface
   * @param question - The question to ask
   * @returns A promise that resolves to the user's answer
   */
  private askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(`${question}\n> `, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Execute the tool with the given arguments
   * @param args - The arguments to pass to the tool
   * @returns The result of executing the tool
   */
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Validate arguments
      const { questions, context } = this.parameters.parse(args);
      
      // Create readline interface
      const rl = this.createReadlineInterface();
      
      // Display context if provided
      if (context) {
        console.log(`\n${context}\n`);
      }
      
      // Ask each question and collect answers
      const answers: string[] = [];
      
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const answer = await this.askQuestion(rl, `Question ${i + 1}/${questions.length}: ${question}`);
        answers.push(answer);
      }
      
      // Close readline interface
      rl.close();
      
      // Format the response as JSON
      const response = {
        answers: answers.map((answer, index) => ({
          question: questions[index],
          answer
        }))
      };
      
      return JSON.stringify(response, null, 2);
    } catch (error) {
      return this.handleToolError(error);
    }
  }
}
