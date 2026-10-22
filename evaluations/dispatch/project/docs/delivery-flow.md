# Asynchronous delivery flow

Status: draft fictional product intent; not approved owner policy.

The [submission API](../src/api/dispatch.ts) publishes requests without calling a planner
or executor directly. The [executor](../src/dispatch/executor.ts) produces a typed receipt,
which the [outcomes projection](../src/dispatch/outcomes.ts) records by request identifier.

Deployment also routes the `dispatch.completed.v1` event to an independently compiled
archival service. This source snapshot contains no deployment route manifest and no shared
TypeScript contract for that service. Matching topic text describes the intended boundary;
it does not itself establish a linked static dependency or successful event delivery.
