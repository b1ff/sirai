there is implementation details in `task-executor.ts` 
but it does not work. 

Required to fix:
1. remove parsing. Just expect output of the model in the last message to contain implementation details
2. Implementation details of the task must have only `taskid` and `content` in text details.
3. they must be included into prompt to the next executions
