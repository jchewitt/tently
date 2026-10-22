# ADR 003: conservative draft implementation overlays

Status: implemented as a bounded submilestone.

`context-graph overlay --base-snapshot <id> --agent <name>` captures configured changed source
bytes against checkout HEAD. Identity binds base SHA, base snapshot digest and captured content
digest, including deletions. Code is reindexed in an independent temporary Git repository;
the active checkout and its index/branch remain unchanged.
[Working-content capture](../src/repository/working-content.ts) reads the selected bytes;
[overlay assembly](../src/application/overlay.ts) performs replacement and publication.

All implementation relationships are rebuilt, so consumer links cannot retain deleted/renamed
definitions. Affected document assertions and links are invalidated. No model is called and no
new approved intent is invented. Remaining invariant results become unknown and runtime observations
are omitted. Code facts are explicitly draft, including in the viewer.

Overlay heads are separate from committed heads and isolated by checkout and agent name.
Select the returned snapshot ID explicitly for querying. Overlay snapshots never satisfy final
committed-evidence checks.
[Saved-evidence querying](../src/application/saved-evidence.ts) reports overlay freshness,
and [snapshot checks](../src/application/snapshot-checks.ts) reject draft evidence for final
validation. [Overlay tests](../src/application/overlay.test.ts) exercise edits, deletion,
renames and checkout isolation; this link does not assert a current passing test result.

Bounds: 500 changed paths, 1 MiB per source file, source/configuration scope must match the base.
Changes outside configured source roots are reported as excluded. This first overlay implementation
reindexes implementation in full; semantic re-extraction and incremental SCIP are not claimed.
Git rename detection is not an identity authority: the old path is invalidated and captured bytes
are indexed at the new path. Arbitrary adapter implementation facts are conservatively dropped.
