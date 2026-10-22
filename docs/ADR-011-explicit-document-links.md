# ADR 011: explicit document links with committed targets

Status: implemented; source approval and live semantic review remain separate.

Intent documents can name implementation and test locations using ordinary Markdown links.
Weftlet parses CommonMark with `mdast-util-from-markdown`, rather than treating every slash
in prose, code examples and URLs as a repository relationship. Inline and reference-style
links resolve relative to the source document; a leading `/` denotes the repository root.
Fragments select the file identity only, not a validated target heading or line. Percent-encoded
paths are decoded. External URLs, local anchors, images, HTML, fenced code and unused link
reference definitions do not create mappings. MDX extensions are not interpreted.

For compatibility, literal slash-separated paths in prose and single paths in inline code
resolve from the repository root. `./` and `../` make a literal path document-relative.
Use Markdown links for spaces or punctuation in paths. There is no basename search, implicit
root fallback, extension guessing, directory expansion, remote fetch or active-checkout lookup.
A stale Markdown link, linked directory or path escaping the repository produces a cited
`implementationGaps` diagnostic, not a relationship to a guessed target. Unresolved literal
mentions are ignored: slash-separated prose, package names and examples are not missing-file
declarations. Use Markdown links when targets need validation. Diagnostics describe extraction gaps;
this increment does not turn them into hard policy gates. Links to a document verify only
that its file exists, not that it was selected for semantic extraction.

`document-linker@2.0.0` emits `references` facts using exact committed file identities and the
source link's line span. Reference-style links cite the definition containing the destination.
Test filenames use the same Evidence kind as SCIP and repository-file extraction. Distinct
passages remain distinct facts; repeated identical links within one passage deduplicate.
Containment of model assertions now cites the assertion's passage, rather than the entire doc.
Missing targets are rechecked on every committed refresh even when semantic artifacts are reused.

A reference means that the document points to a file. It does not prove that the file fulfills
intent, that a test passed, or that its prose is correct. Facts stay `authority: inferred`;
explicit links are `extractionReview: deterministic`. Model containment stays `unreviewed`.
Only explicit `approvedIntentSources` configuration sets `sourceAuthority: declared`, including
for links; source approval never approves a model assertion. The Weftlet evaluation continues
to configure zero approved sources and zero model assertions.

Snapshot assembly advances from `graph-v2` to `graph-v3-links-2.0.0` and binds the linker version
in both identity and manifest. Refreshes create a different immutable identity; saved v2 snapshots remain readable
without a provider and are not rewritten. Semantic cache keys are unchanged because model
extraction is unchanged. Existing overlays conservatively invalidate document references to
changed/deleted targets and changed prose; they do not invent new approved mappings.

The six evaluation documents now have contributor-facing links attached to descriptions of
actual responsibilities. These are reviewable navigation evidence, not newly approved policy.
The original frozen baseline remains intact. A measurement using the new documents changes
its evidence input and must not be presented as a model-quality or ranking improvement.
Query ranking, automatic scope expansion and live provider extraction are separate work.
