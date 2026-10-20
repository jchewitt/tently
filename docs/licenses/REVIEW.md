# Scoped dependency license review

The RDF dependency tree introduced three expressions outside the original generator allowlist.
`reviewed-licenses.json` pins these reviews to exact package versions and notice hashes.
Unrecognized future versions/expressions still fail the check.

- `spark-md5@3.0.2`: upstream package metadata and README offer MIT as an alternative.
  The npm archive omits `LICENSE2`; the retained MIT notice was retrieved from the peeled
  `v3.0.2` source commit `9315385868fe11076674d4ddd763005319a462a7`, path `LICENSE2`.
- `lru-cache@11.5.3`: the installed `LICENSE.md` grants copyright/patent permissions and
  requires the license text or link. Its complete Blue Oak 1.0.0 text is retained.
- `negotiate@1.0.1`: metadata says FreeBSD; the installed `negotiate.js` header contains
  two-clause BSD permissions, copyright and disclaimer. That notice is retained.

These selections support local development and preserve redistribution notices. They do not
authorize package publication or waive final export review.
