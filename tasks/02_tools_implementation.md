# LLM Tools Implementation Task

## Overview
Develop a set of reusable tools for LLM integration using LangChain.js, focusing on file system and process operations with appropriate safety controls.

## Required Tools

### 1. ReadFileTool
- Restrict file access to working directory only
- Implement path sanitization and validation
- Handle common file encoding formats

### 2. RunProcessTool
- Implement permission system for command execution
- Support pre-approved trusted commands via configuration
- Prompt for user approval for non-trusted commands
- Include timeout and output handling

### 3. FindFilesTool
- Create grep-like functionality limited to working directory
- Support pattern matching (regex and glob)
- Include options for recursive search
- Allow filtering by file type/extension

### 4. WriteFileTool
- Restrict write operations to working directory only
- Implement git repository detection
- Skip permission prompt if:
    - Repository has no uncommitted changes
- Request user permission before writing if:
    - Repository has uncommitted changes
    - Not a git repository
- Support overwriting existing files

## Technical Requirements
- Tools must be compatible with OpenAI, Claude, and Ollama models
- Implement proper error handling and feedback mechanisms
- Ensure tools are self-contained and reusable across different LLM providers
- Include TypeScript type definitions
- Provide comprehensive documentation

## Security Considerations
- Never allow path traversal or operations outside working directory
- Sanitize all inputs before execution
- Implement detailed logging for all operations
- Include timeout mechanisms for long-running processes

## Deliverables
1. Tool implementations in TypeScript using LangChain.js
2. Configuration schema for trusted commands
3. Unit tests for each tool
4. Usage examples showing integration with different LLM providers
