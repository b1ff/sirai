import { z } from 'zod';

/**
 * Schema for trusted commands configuration
 */
export const TrustedCommandsConfigSchema = z.object({
    /**
     * List of trusted commands
     * These commands will be executed without user approval
     * Commands are matched by prefix, so 'git' will match 'git status', 'git log', etc.
     */
    trustedCommands: z.array(z.string())
        .default(['git', 'ls', 'dir', 'find', 'grep', 'cat', 'echo', 'pwd'])
        .describe('List of trusted commands that can be executed without user approval')
});

/**
 * Type for trusted commands configuration
 */
export type TrustedCommandsConfig = z.infer<typeof TrustedCommandsConfigSchema>;

/**
 * Default trusted commands configuration
 */
export const defaultTrustedCommandsConfig: TrustedCommandsConfig = {
    trustedCommands: [
        'git',
        'ls',
        'dir',
        'find',
        'grep',
        'cat',
        'echo',
        'pwd'
    ]
};

/**
 * Schema for tools configuration
 */
export const ToolsConfigSchema = z.object({
    /**
     * Working directory for file operations
     * All file operations will be restricted to this directory
     * @default process.cwd()
     */
    workingDir: z.string()
        .default(process.cwd())
        .describe('Working directory for file operations'),

    /**
     * Trusted commands configuration
     */
    trustedCommands: TrustedCommandsConfigSchema
        .default(defaultTrustedCommandsConfig)
        .describe('Configuration for trusted commands'),

    /**
     * Ask model tool configuration
     */
    askModel: z.object({
            /**
             * Whether the ask_model tool is enabled
             * @default false
             */
            enabled: z.boolean()
                .default(false)
                .describe('Whether the ask_model tool is enabled'),

            /**
             * The provider to use for the ask_model tool
             * @default 'ollama'
             */
            provider: z.string()
                .default('ollama')
                .describe('The provider to use for the ask_model tool'),

            /**
             * The model to use for the ask_model tool
             * If not specified, the default model for the provider will be used
             */
            model: z.string()
                .optional()
                .describe('The model to use for the ask_model tool')
        })
        .default({
            enabled: false,
            provider: 'llmstudio'
        })
        .describe('Configuration for the ask_model tool')
});

/**
 * Type for tools configuration
 */
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Default tools configuration
 */
export const defaultToolsConfig: ToolsConfig = {
    workingDir: process.cwd(),
    trustedCommands: defaultTrustedCommandsConfig,
    askModel: {
        enabled: false,
        provider: 'ollama'
    }
};
