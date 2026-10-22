# ADR 006: explicit providers with lazy loading and bounded execution

The original Codex orchestration and structured output remain the first concrete adapter.
The neutral extractor contract is now exported and enforced at runtime for all providers.
Module adapters are trusted code and require an explicit identity; loading them only on
extraction preserves read access when providers are absent.

CLI subprocesses have cancellation, timeouts, bounded output acceptance and narrow retries.
Errors report safe status metadata instead of private stderr. Hydration limits source scope
before invoking a provider, stops new work after failures, and reuses immutable artifacts.
Reasoning settings now participate in Codex cache identity.
[Semantic hydration](../src/extraction/semantic.ts) owns artifact reuse and validation;
[Codex command discovery](../src/extraction/codex-command.ts) resolves native/npm launchers,
and [authentication configuration](../src/extraction/codex-auth.ts) keeps login and API-key modes explicit.
[Launcher tests](../src/extraction/codex-command.test.ts) exercise synthetic executables without
claiming live model quality or account authentication.

These changes provide an extension seam, not a claim of interoperability with arbitrary models.
Additional real adapters require their own live and deterministic tests. The current cloud's
read-only filesystem blocks a live Codex invocation; this limitation does not block graph queries.
