# Dispatch priority policy

Status: draft fictional product intent; not approved owner policy.

The [dispatch policy implementation](../src/dispatch/policy.ts) assigns urgent requests
to the express lane and ordinary requests to economy. The [planner](../src/dispatch/planner.ts)
and [retry path](../src/dispatch/retry.ts) apply that decision before publishing work.
[Policy checks](../test/policy.test.ts) cover the ordinary lane and rejected retries.

An old handoff note refers only to [policy](policy.md). This destination is deliberately
unresolved: the note does not identify the dispatch or refund domain. A consumer must not
guess a file from its basename or promote this note into an approved rule.
