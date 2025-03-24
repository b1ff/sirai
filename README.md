# SirAi - Development Helper CLI

A command-line (CLI) tool to assist developers with end-to-end coding tasks, including interactive code generation, verification, and integrating both local and remote language models (LLMs).

⚠️ CAUTION: This project is almost fully vibe-coded and is not yet ready for production use. ⚠️

## Features

- **Interactive CLI Interface**: Chat-like interface for interacting with LLMs
- **Local and Remote LLM Support**: 
  - Local: Ollama integration
  - Remote: OpenAI, Claude integration
- **Prompt Management**: Store and reuse prompts
- **Chat History**: Persistent chat history between sessions for context-aware responses
- **Project Context Integration**: Automatically includes .cursorrules file in LLM context
- **Code Rendering**: Syntax-highlighted output for generated code
- **Task Automation**: Execute code generation tasks

## Installation

### Prerequisites

- Node.js (v16 or later)
- npm (v7 or later)
- For local LLM support: [Ollama](https://ollama.ai/) installed and running

### Install from npm

```bash
npm install -g sirai
```

### Install from source

```bash
git clone https://github.com/yourusername/sirai.git
cd sirai
npm install
npm link
```

## Usage

### Interactive Mode

Start an interactive chat session with the LLM:

```bash
sirai
```

or

```bash
sirai chat
```

#### Options

- `-l, --local`: Use local LLM only
- `-r, --remote`: Use remote LLM only
- `-p, --prompt <name>`: Use a stored prompt

#### Commands in Interactive Mode

- `/exit`, `/quit`: Exit the chat
- `/save <name>`: Save the last response as a prompt
- `/prompts`: List available prompts
- `/clear`: Clear the chat history
- `@<promptname>`: Use a stored prompt

### Execute Prompt from File

Execute a prompt from a file:

```bash
sirai exec <promptFile>
```

#### Options

- `-l, --local`: Use local LLM only
- `-r, --remote`: Use remote LLM only

### Configuration

Configure settings:

```bash
sirai config
```

#### Options

- `-l, --list`: List current configuration
- `-s, --set <key=value>`: Set a configuration value

## Configuration

The configuration is stored in `~/.sirai/config.yaml`. You can edit this file directly or use the `sirai config` command.

A sample configuration file is provided at `config.sample.yaml` in the repository. You can use this as a reference for configuring Sirai.

### Configuration Sections

- **Local LLM**: Configure local LLM settings (Ollama)
- **Remote LLM**: Configure remote LLM settings (OpenAI, Claude)
- **Execution**: Configure execution settings
- **Output**: Configure output settings
- **Prompts**: Configure prompts directory
- **Chat**: Configure chat history settings (persistence, message limit)

## Examples

### Interactive Chat

```bash
# Start an interactive chat with the default LLM
sirai

# Start an interactive chat with the local LLM only
sirai chat --local

# Start an interactive chat with the remote LLM only
sirai chat --remote

# Start an interactive chat with a stored prompt
sirai chat --prompt my-prompt
```

### Execute Prompt from File

```bash
# Execute a prompt from a file
sirai exec my-prompt.txt

# Execute a prompt from a file with the local LLM only
sirai exec my-prompt.txt --local

# Execute a prompt from a file with the remote LLM only
sirai exec my-prompt.txt --remote
```

### Configuration

```bash
# List current configuration
sirai config --list

# Set a configuration value
sirai config --set llm.local.model=llama2

# Interactive configuration
sirai config
```

## License

ISC
