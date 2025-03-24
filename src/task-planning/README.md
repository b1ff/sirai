# Task Planning Component

The Task Planning component is responsible for assessing task complexity, decomposing tasks into subtasks, and selecting appropriate LLM strategies for each subtask.

## Overview

The Task Planning component follows this logical flow:

```
User Request → Parse Intent → Initial Complexity Assessment → Task Decomposition → LLM Strategy Selection → Finalize Plan
```

## Components

### 1. ComplexityAssessor

Evaluates task complexity based on:
- Task type (generation, refactoring, explanation)
- Scope of code affected
- Dependencies involved
- Technology stack complexity
- Prior success rates with similar tasks

```typescript
import { ComplexityAssessor, TaskType } from '../task-planning/index.js';

const assessor = new ComplexityAssessor();
const result = assessor.assess({
  taskType: TaskType.GENERATION,
  scopeSize: 5,
  dependenciesCount: 3,
  technologyComplexity: 7,
  priorSuccessRate: 0.8
});

console.log(result.level); // ComplexityLevel.MEDIUM
console.log(result.score); // 58.2
console.log(result.explanation); // Detailed explanation of the assessment
```

### 2. DecompositionStrategies

Creates task decomposition strategies for different complexity levels:
- High complexity: Break down into many small, focused subtasks
- Medium complexity: Standard breakdown into logical components
- Low complexity: Minimal or no decomposition

```typescript
import { 
  DecompositionStrategyFactory, 
  ComplexityLevel, 
  TaskType 
} from '../task-planning/index.js';

const strategy = DecompositionStrategyFactory.getStrategy(ComplexityLevel.HIGH);
const taskPlan = strategy.decompose(
  "Implement a user authentication system",
  TaskType.GENERATION,
  ComplexityLevel.HIGH
);

console.log(taskPlan.subtasks.length); // 11 subtasks for high complexity
```

### 3. LLMStrategySelector

Implements LLM strategy selection that:
- Assigns high-complexity tasks to remote LLMs (OpenAI, Claude)
- Assigns medium-complexity tasks to a hybrid approach
- Assigns simple tasks to local LLMs (Ollama)

```typescript
import { 
  LLMStrategySelector, 
  ComplexityLevel, 
  LLMType 
} from '../task-planning/index.js';

const selector = new LLMStrategySelector();
const llmType = selector.selectLLMType(
  ComplexityLevel.HIGH,
  75,
  ['critical']
);

console.log(llmType); // LLMType.REMOTE
```

### 4. FileSystemUtils

Provides file system operations to:
- Read code files for context analysis
- Scan project structure
- Access project configuration files
- Parse dependencies from relevant files

```typescript
import { FileSystemUtils } from '../task-planning/index.js';

const contextProfile = await FileSystemUtils.createContextProfile(
  '/path/to/project',
  '/path/to/current/directory'
);

console.log(contextProfile.files.length); // Number of files in the project
console.log(contextProfile.dependencies); // Project dependencies
console.log(contextProfile.technologyStack); // Detected technology stack
```

### 5. TaskPlanner

Main entry point that integrates all components:

```typescript
import { TaskPlanner, TaskType } from '../task-planning/index.js';
import { AppConfig } from '../config/config.js';

// Application configuration
const config: AppConfig = {
  // LLM configuration
  llm: {
    local: {
      enabled: true,
      provider: 'ollama',
      model: 'llama2'
    },
    remote: {
      enabled: true,
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'your-api-key'
    }
  }
};

const taskPlanner = new TaskPlanner(config);

// Create context profile
const contextProfile = await taskPlanner.createContextProfile(
  '/path/to/project',
  '/path/to/current/directory'
);

// Create task plan
const taskPlan = await taskPlanner.createTaskPlan(
  "Implement a user authentication system",
  TaskType.GENERATION,
  contextProfile,
  0.8 // Prior success rate (optional)
);

console.log(taskPlan.overallComplexity); // ComplexityLevel.HIGH
console.log(taskPlan.subtasks.length); // Number of subtasks
console.log(taskPlan.executionOrder); // Order of execution
```

## Configuration

The Task Planning component can be configured through the application configuration:

```yaml
taskPlanning:
  enabled: true

  # Complexity assessment configuration
  complexity:
    thresholds:
      medium: 40
      high: 70
    weights:
      taskType: 0.2
      scopeSize: 0.3
      dependenciesCount: 0.2
      technologyComplexity: 0.2
      priorSuccessRate: 0.1

  # LLM strategy selection configuration
  llmStrategy:
    thresholds:
      remote: 70
      hybrid: 40
      local: 0
    overrides:
      critical: remote
      simple: local
```

## Integration with Other Components

The Task Planning component integrates with:

1. **Context Manager**: Uses the context profile to inform complexity assessment
2. **LLM Dispatcher**: Prepares appropriate prompts for each LLM execution

Example integration in the interactive command:

```typescript
// Initialize task planner
const taskPlanner = new TaskPlanner(config, config.taskPlanning);

// Get project context
const projectRoot = projectContext.findProjectRoot() || process.cwd();
const contextProfile = await taskPlanner.createContextProfile(
  projectRoot,
  process.cwd()
);

// Create task plan
const taskPlan = await taskPlanner.createTaskPlan(
  userInput,
  TaskType.GENERATION,
  contextProfile
);

// Select LLM based on task complexity
let selectedLLM;
if (taskPlan.overallComplexity === ComplexityLevel.HIGH) {
  selectedLLM = await LLMFactory.createRemoteLLM(config);
} else if (taskPlan.overallComplexity === ComplexityLevel.LOW) {
  selectedLLM = await LLMFactory.createLocalLLM(config);
} else {
  selectedLLM = await LLMFactory.getBestLLM(config);
}

// Generate response using selected LLM
await selectedLLM.generateStream(prompt, (chunk) => {
  // Process response chunk
});
```
