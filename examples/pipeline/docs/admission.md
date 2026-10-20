semantic-id: pipeline:admission
# Admission intent
Status: approved example policy (fictional product).
The admission stage is implemented by src/admission.ts.
The admission stage routes through the planning stage using an asynchronous queue.
The shared message contract is src/contracts/planning.ts.
