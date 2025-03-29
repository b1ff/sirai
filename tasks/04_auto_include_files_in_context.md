## Improved Planning Approach

The planning system should:

1. During task decomposition, automatically identify and associate relevant file paths with each subtask
2. Pre-load file contents when executing each subtask rather than relying on read/list operations. Use format to include files in prompt at the top as next
"""
file: ./relative/path/to/file.ts
```syntax
```
"""

3. Structure subtasks with a `filesToRead` property that lists all files needed for context

The `extract-plan` function must expect this structure as input, and all subsequent code should work with this format. Each subtask should include:
- Description of the task
- `filesToRead`: Array of object with file paths + their syntax to be automatically loaded into context before execution

This approach will:
- Reduce tool usage by eliminating redundant file operations
- Provide more precise context to local LLMs
- Minimize prompt size while maximizing relevant information
- Simplify the execution flow by handling file loading automatically
