Add a tool to ask LLM model.
Idea is to expose tool to ask llm model about files and delegate tasks from the big model to the smaller local models to reduce cost of the task execution, i.e. analysis.

Tool should be included into planning.

So it is possible to run clau   de3.7 for planning that will delegate tasks to local or cheaper models, that are going to give condensed summary in the response.

Model for this tool should also have ability to read file if needed.


so the input of the ask_model tool should be array of file paths and query with questions or tasks. Response will be just string.

There should be a config section that enables or disables this behavior and also config that configure a model for it.
