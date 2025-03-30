# Task JSON Examples

This directory contains example JSON files that can be used with the `task` command.

## Usage

To use these examples, run the following command:

```bash
sirai task path/to/example.json
```

For example:

```bash
sirai task tasks/examples/simple-task.json
```

## Available Examples

### 1. Simple Task (simple-task.json)

A basic example with just a task specification:

```json
{
  "taskSpecification": "Create a new file called hello.js that prints 'Hello, World!' to the console"
}
```

### 2. Complex Task (complex-task.json)

A more complex example with multiple subtasks and execution order:

```json
{
  "originalRequest": "Create a simple Node.js application that reads a file and counts the number of words",
  "overallComplexity": "medium",
  "subtasks": [
    {
      "id": "subtask-1",
      "taskSpecification": "Create a file reader module that reads a text file and returns its contents",
      "complexity": "low",
      "llmType": "local",
      "dependencies": [],
      "filesToRead": []
    },
    ...
  ],
  "executionOrder": ["subtask-1", "subtask-2", "subtask-3"]
}
```

### 3. Task with Files (task-with-files.json)

An example that includes files to read for context:

```json
{
  "taskSpecification": "Update the executeTaskDirectly function to add error handling for invalid JSON files",
  "filesToRead": [
    {
      "path": "src/commands/execute-task.ts",
      "syntax": "typescript"
    },
    {
      "path": "src/index.ts",
      "syntax": "typescript"
    }
  ]
}
```

## JSON Schema

The task JSON files can have the following structure:

1. Simple format:
   - `taskSpecification`: The task to execute

2. Complex format (TaskPlan):
   - `originalRequest`: The original user request
   - `overallComplexity`: The overall complexity level (low, medium, high)
   - `subtasks`: An array of subtasks
   - `executionOrder`: An array of subtask IDs defining execution order

3. Subtask format:
   - `id`: A unique identifier
   - `taskSpecification`: The actual task description
   - `complexity`: The complexity level (low, medium, high)
   - `llmType`: The LLM type to use (local, remote, hybrid)
   - `dependencies`: An array of subtask IDs this subtask depends on
   - `filesToRead`: Optional array of files to read for context

4. FileToRead format:
   - `path`: The file path
   - `syntax`: The syntax highlighting to use
