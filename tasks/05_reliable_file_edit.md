need to make edit file more reliable, it fails continuously at the moment.
maybe print line numbers in the putting file content to the context of task execution

so far issues with editing file:

1. parallel tool call - mismatch of the line edits if another run modified files, or it tries to add line number based on parallel tool call
2. multiple edits of the same file. Either subsequent of at the same parameters - line numbers are shifted and it might cause bugs
