import { AppConfig } from '../config/config.js';
import { CommandOptions } from './interactive/types.js';
import { InteractiveSession } from './interactive/session.js';

/**
 * Starts an interactive chat session with the LLM
 * @param options - Command options
 * @param config - The configuration
 */
export async function startInteractiveSession(options: CommandOptions, config: AppConfig): Promise<void> {
  // Create and start the interactive session
  const session = new InteractiveSession(options, config);
  await session.start();
}
