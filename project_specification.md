# Development Helper CLI Specification

## Overview
A command-line (CLI) tool to assist developers with end-to-end coding tasks, including interactive code generation, verification (compilation, running tests), and integrating both local and remote language models (LLMs) with Model Context Protocol (MCP) support.

## Functional Requirements

### 1. Interface
- **CLI-based**, interactive (chat-like).
- Real-time **streaming output** from LLM and task execution.

### 2. LLM Execution
- **Local LLM Utilization**:
    - Primarily leveraging local models (e.g., Ollama).
    - Support parallel execution ("minions") to enhance responsiveness.

- **Remote LLM Utilization**:
    - Used selectively for higher accuracy tasks, QA, or task decomposition.
    - Configurable endpoints (OpenAI, Claude, etc.).

### 3. MCP Support
- Integrated **MCP client** for communicating with external MCP-compatible services.
- Optionally expose itself via MCP for integration with external clients (e.g., Claude Desktop).

### 4. Prompt Management
- Simple flat-file-based prompt storage (`.txt`, `.md`).
- Easily refer to stored prompts in interactive mode (`@promptname`).

### 5. Project Context Integration
- If `.cursorrules` file exists in project directory, include contents automatically in LLM context.

### 6. Changes review in the CLI if needed
- Ability for human either accept of undo changes.

### 7. Task Automation & Verification
- Execute code generation tasks with automatic verification:
    - Run compilers, build tools, and unit tests.
    - Provide clear output and feedback about success or failure.

## Technical Considerations

- **Performance vs. Accuracy**:
    - Prioritize accuracy but aim to reduce cost through local LLMs.
    - Configurable threshold or switch between local and remote LLM use.

- **Output Format**:
    - Clearly structured CLI output.
    - Streaming responses to minimize wait time.

- **Configurability**:
    - Configuration via a simple config file (e.g., YAML or JSON) for:
        - LLM endpoints.
        - MCP servers.
        - Parallel execution settings.

## Future Considerations (Not required for MVP)
- Web-based user interface.
- MCP server implementation to integrate with Claude Desktop seamlessly.
- Hierarchical prompt management.

