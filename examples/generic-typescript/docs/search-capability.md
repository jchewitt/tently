semantic-id: capability:document-search

# Document Search

The stable identifiers in this capability are:

- `capability:document-search` for the search capability.
- `component:query-service` for the query service.
- `contract:document-repository` for the document repository contract.
- `contract:search` for the search contract.
- `evidence:test-search-test-ts` for `test/search.test.ts`.

The search capability is implemented by the query service. The service consumes the document
repository contract, and the search contract is verified by `test/search.test.ts`.
