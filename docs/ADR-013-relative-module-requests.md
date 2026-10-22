# ADR 013: scope relative module request identities

Status: implemented as a correction to literal import evidence. Query ranking is unchanged.

The frozen dispatch evaluation found that two planners importing `./policy.js` shared the
same generic contract node, although they were in different directories and SCIP correctly
identified separate policy symbols. This false connection brought refund and audit files
into dispatch scans. Adjusting ranking cannot correct that underlying identity.

`repository-file-extractor@2.0.0` keeps a literal module request separate from a resolved
implementation. For ordinary `./` and `../` requests (including `.` and `..`), combine the
importer's directory with the specifier and normalize POSIX path segments. Git paths use
the same separators on Windows and Linux. The node ID is `contract:module:./` followed by
the URI-encoded requested location. Its canonical label and attributes describe a
`repository-relative-request` with `resolution: unresolved`. Imports from different places
that request the same location share a node; identical spellings naming different locations
do not. Labels and attributes stay identical when a node has multiple referring spellings.

Requests escaping the repository, containing backslashes, percent escapes, loader query/hash
suffixes or control characters remain opaque. Their identity hashes the importer and original
specifier under the reserved `contract:module:./?` prefix. No path decoding, filesystem lookup,
basename search, source-suffix substitution, directory-index expansion or module execution occurs.
The prefixes distinguish these identities from bare imports, whose existing identities remain
unchanged. Case is preserved. Facts cite the importing line and committed content digest;
their IDs bind the extractor version and module identity.

This is lexical request identity, not TypeScript/Node resolution. `./policy.js`, `./policy.ts`
and `./policy/index.js` remain distinct requests even if a consumer's compiler could map them
to one source. A remaining import after target deletion is still a cited unresolved request;
it does not assert that the target exists. Importer renames change the relative context,
and deleted importers contribute no new facts. SCIP remains the source of resolved local
typed-symbol relationships. Bare aliases, package exports and environment-dependent resolution
need their own evidence; the simple line-based import recognizer is not a complete parser.

Generic request nodes retain the `contract:module:` prefix and existing ranking treatment.
No provider preference, confidence/authority promotion, new traversal cutoff or evaluation
label change accompanies this fix. Typed symbols, explicit document links and queue-routing
evidence are separate. In particular, matching topic strings still does not establish an
operational route to the archival consumer in the dispatch evaluation.

Committed refreshes use `graph-v4-links-2.0.0-files-2.0.0` and report both assembly and file
extractor versions. Draft overlay publication IDs also bind the current file extractor, while
their capture-v2 digest continues identifying the same working bytes. Overlay manifests report
the new extraction version even when built on a version-1 base. The committed base and prior
overlay remain immutable and independently queryable; neither is rewritten or advanced by
building a draft. Semantic artifact keys are unchanged and unchanged prose remains reusable.

To obtain corrected relationships, explicitly hydrate the desired committed ref or rebuild
the draft overlay. Querying saved evidence continues to use that evidence's original facts,
without requiring an indexer, provider, Docker or refresh. A newer extractor does not silently
repair or reinterpret historical evidence.

Validation covers distinct domains, equivalent requested locations, opaque paths, URI-safe
identity, preserved bare imports, committed/dirty isolation, importer rename/delete behavior,
old/new snapshot coexistence, real TypeScript and RDF/SHACL, and installed runtime assets.
Compare newly extracted facts with the frozen dispatch and Weftlet inputs at the existing
ranking, case labels and page budgets. Keep missing operational links visible separately
from retrieval improvements.
