# Dispatch request contract

Status: draft fictional product intent; not approved owner policy.

The [request contract](../src/contracts/dispatch-request.ts) carries a stable request
identifier, a destination and a requested priority. The [submission API](../src/api/dispatch.ts)
rejects blank destinations before publishing. The [planner](../src/dispatch/planner.ts)
and [retry path](../src/dispatch/retry.ts) both consume requests, and a
[plan](../src/contracts/dispatch-plan.ts) retains the original request for execution.

The [dispatch checks](../test/dispatch.test.ts) exercise an urgent request and a rejected
blank destination through the in-memory asynchronous transport. Those checks do not
establish delivery guarantees for an external message broker.
