# ADR 006: explicit providers with lazy loading and bounded execution

The original Codex orchestration and structured output remain the first concrete adapter.
The neutral extractor contract is now exported and enforced at runtime for all providers.
Module adapters are trusted code and require an explicit identity; loading them only on
extraction preserves read access when providers are absent.

CLI subprocesses have cancellation, timeouts, bounded output acceptance and narrow retries.
Errors report safe status metadata instead of private stderr. Hydration limits source scope
before invoking a provider, stops new work after failures, and reuses immutable artifacts.
Reasoning settings now participate in Codex cache identity.

These changes provide an extension seam, not a claim of interoperability with arbitrary models.
Additional real adapters require their own live and deterministic tests. The current cloud's
read-only filesystem blocks a live Codex invocation; this limitation does not block graph queries.
