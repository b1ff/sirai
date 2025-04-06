in config.ts there are configuration like `local` and `remote` llms. 
They have to be removed from project, and all usages should be updated, including tests to the new config schema that does not contain `local` and `remote` llms. Schema should contain only providers with keys and usage of those providers for specific tasks like planning, etc.
