Add guidelines support to the app.

Guidelines are the text files in the project that adds directions for LLM to follow specific to the project.


Priority are next:
1. look for `./sirai/guidelines/index.md` file. First if it is exists, stop here.
2. look for `./cursor/rules/*.mdc` files. If they exist - pickup them and concatenate
3. look for `.junie/guidelines.md` file. If it exists, stop here.


Include gathered guidelines in the all prompts: planning, execution and validation as additional project context.
