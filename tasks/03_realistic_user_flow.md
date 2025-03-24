# Developer CLI Implementation Specification

1. **State Management**: The CLI must be built on top of the state machine that transitions between user input processing, context gathering, planning, execution, and follow-up stages, etc... It must be extensible and modifiable.

2. **Context Gathering**: When receiving a user request, gather comprehensive context including relevant project files, directory structure, dependencies, and any `.cursorrules` file content.

3. **Plan Generation**: Use remote LLMs (higher accuracy) for generating execution plans based on user requests and gathered context.

4. **Plan Review Process**:
    - Support both automatic and manual plan approval
    - Implement feedback loop for plan refinement when rejected
    - Use previous plan and user comments as context for refinement

5. **Task Decomposition**:
    - Break approved plans into executable subtasks (info gathering, action, verification)
    - Ensure subtasks have well-defined inputs and outputs for local LLM execution

6. **Task Execution**:
    - Prioritize local LLMs for subtask execution to optimize performance
    - Implement context passing between sequential tasks
    - Support information gathering tasks that feed into subsequent tasks

7. **Verification & Recovery**:
    - Implement verification tasks (compilation, tests) with clear success/failure states
    - Support automatic fix attempts when verification fails
    - Enforce retry limits (5-10 attempts) to prevent infinite loops

8. **Summary Generation**:
    - Create comprehensive summaries of executed tasks and changes
    - Track modified files for inclusion in follow-up context

9. **Follow-up Support**:
    - Allow seamless follow-up requests that build on previous context
    - Include execution history and changed files in follow-up context


```mermaid
stateDiagram-v2
    [*] --> Idle
    
    Idle --> RequestReceived: User inputs change request
    
    RequestReceived --> PlanGeneration: Gather context (project files, .cursorrules, etc.)
    
    PlanGeneration --> PlanReview: Generate plan (Remote LLM)
    PlanGeneration --> PlanGeneration: Plan generation failed
    
    state PlanReview {
        [*] --> UserReview
        UserReview --> AutoAccepted: Auto-accept enabled
        UserReview --> ManualReview: Auto-accept disabled
        ManualReview --> Accepted: User accepts
        ManualReview --> Rejected: User rejects
        Rejected --> Refinement: Refine with feedback
        Refinement --> UserReview: Present refined plan
        Accepted --> [*]
        AutoAccepted --> [*]
    }
    
    PlanReview --> TaskDecomposition: Plan accepted
    
    TaskDecomposition --> TaskExecution: Break into subtasks
    
    state TaskExecution {
        [*] --> TaskQueue
        
        TaskQueue --> InfoGatheringTask: Info needed
        TaskQueue --> ActionTask: Code change needed
        TaskQueue --> VerificationTask: Verification needed
        
        InfoGatheringTask --> ResultCollection: Execute (Local LLM)
        ActionTask --> ResultCollection: Execute (Local LLM)
        VerificationTask --> ResultCollection: Execute tests/compile
        
        ResultCollection --> TaskQueue: Queue next task
        ResultCollection --> FixingTask: Verification failed
        
        FixingTask --> RetryCounter: Attempt fix (Local LLM)
        RetryCounter --> ResultCollection: Retry < limit
        RetryCounter --> FailureState: Retry ≥ limit
        
        FailureState --> [*]: Report failure
        TaskQueue --> [*]: All tasks complete
    }
    
    TaskExecution --> SummaryGeneration: All tasks complete
    TaskExecution --> SummaryGeneration: Task limit exceeded
    
    SummaryGeneration --> Idle: Present results to user
    
    state FollowUp {
        [*] --> FollowUpRequest: User requests followup
        FollowUpRequest --> ContextCompilation: Compile history
        ContextCompilation --> PlanGeneration: Pass to new plan cycle
    }
    
    SummaryGeneration --> FollowUp: User initiates followup
```


```mermaid
classDiagram
    class StateContext {
        -State currentState
        -ContextData contextData
        +transition()
        +getContextData() ContextData
        +updateContextData(ContextData)
        -createState(StateType) State
    }
    
    class ContextData {
        -Map projectContext
        -List~File~ changedFiles
        -Plan currentPlan
        -List~Task~ tasks
        -int retryCount
        -String userInput
        +addProjectContext(String, Object)
        +setCurrentPlan(Plan)
        +getChangedFiles()
        +addTask(Task)
        +incrementRetryCount()
        +setUserInput(String)
        +getUserInput() String
    }
    
    class StateType {
        <<enumeration>>
        WAITING_FOR_INPUT
        GATHERING_CONTEXT
        GENERATING_PLAN
        REVIEWING_PLAN
        EXECUTING_TASKS
        GENERATING_SUMMARY
    }
    
    class State {
        <<interface>>
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class WaitingForInputState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class GatheringContextState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class GeneratingPlanState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class ReviewingPlanState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class ExecutingTasksState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class GeneratingSummaryState {
        +process(StateContext) StateType
        +enter(StateContext)
        +exit(StateContext)
    }
    
    class Plan {
        -String description
        -List~Task~ tasks
        -int version
        -String userFeedback
        +getTasks() List~Task~
        +addUserFeedback(String)
        +incrementVersion()
    }
    
    class Task {
        -TaskType type
        -String description
        -Map inputs
        -Map outputs
        -TaskStatus status
        +execute()
        +updateStatus(TaskStatus)
        +getOutputs()
    }
    
    class TaskType {
        <<enumeration>>
        INFO_GATHERING
        ACTION
        VERIFICATION
        FIXING
    }
    
    class TaskStatus {
        <<enumeration>>
        PENDING
        IN_PROGRESS
        COMPLETED
        FAILED
    }
    
    StateContext *-- State
    StateContext *-- ContextData
    StateContext *-- StateType
    State <|.. WaitingForInputState
    State <|.. GatheringContextState
    State <|.. GeneratingPlanState
    State <|.. ReviewingPlanState
    State <|.. ExecutingTasksState
    State <|.. GeneratingSummaryState
    ContextData *-- Plan
    ContextData *-- Task
    Plan *-- Task
    Task *-- TaskType
    Task *-- TaskStatus
```
