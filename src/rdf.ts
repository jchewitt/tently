import { QueryEngine } from '@comunica/query-sparql';
import { DataFactory, Parser, Store, Writer } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import type { GraphFact, GraphSnapshot } from './core.js';
import { contextPackEvidenceAuthority } from './authority.js';
import { stableJson } from './util.js';
import { createRequire } from 'node:module';

const { namedNode: iri, literal, quad } = DataFactory;
export const CG = 'https://context-graph.dev/record#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const nodeIri = (id: string) => `urn:context-graph:node:${encodeURIComponent(id)}`;
export const factIri = (id: string) => `urn:context-graph:fact:${encodeURIComponent(id)}`;
const engine = new QueryEngine();
const SparqlParser = (createRequire(import.meta.url)('sparqljs') as {
  Parser: new () => { parse(query: string): { type: string; queryType?: string; from?: unknown } };
}).Parser;

const shapes = new Parser().parse(`
@prefix cg: <${CG}>.
@prefix rdf: <${RDF}>.
@prefix sh: <http://www.w3.org/ns/shacl#>.
@prefix xsd: <${XSD}>.
cg:FactShape a sh:NodeShape; sh:targetClass rdf:Statement;
 sh:property [ sh:path cg:record; sh:minCount 1; sh:maxCount 1; sh:datatype xsd:string ];
 sh:property [ sh:path rdf:subject; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path rdf:predicate; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path rdf:object; sh:minCount 1; sh:maxCount 1; sh:nodeKind sh:IRI ];
 sh:property [ sh:path cg:authority; sh:minCount 1; sh:maxCount 1;
   sh:in ("declared" "implemented" "validated" "observed" "inferred" "draft") ];
 sh:property [ sh:path cg:path; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:commit; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:sourceDigest; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ];
 sh:property [ sh:path cg:startLine; sh:minCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:endLine; sh:minCount 1; sh:datatype xsd:integer; sh:minInclusive 1 ];
 sh:property [ sh:path cg:confidence; sh:minCount 1; sh:datatype xsd:decimal; sh:minInclusive 0; sh:maxInclusive 1 ];
 sh:property [ sh:path cg:extractor; sh:minCount 1; sh:datatype xsd:string; sh:minLength 1 ].
cg:NodeShape a sh:NodeShape; sh:targetClass cg:Node;
 sh:property [ sh:path cg:kind; sh:minCount 1; sh:maxCount 1 ].
`);

/** Lossless RDF dataset: one named graph per cited assertion, with provenance in the default graph. */
export class RdfEvidenceGraph {
  private readonly dataset: Store = new Store();

  constructor(readonly snapshot: GraphSnapshot) {
    for (const [ordinal, fact] of snapshot.facts.entries()) {
      const record = iri(factIri(fact.id));
      const subject = iri(nodeIri(fact.subject.id));
      const object = iri(nodeIri(fact.object.id));
      const predicate = iri(CG + fact.predicate);
      this.dataset.addQuad(subject, predicate, object, record);
      this.dataset.addQuad(record, iri(RDF + 'type'), iri(RDF + 'Statement'));
      this.dataset.addQuad(record, iri(CG + 'ordinal'), literal(String(ordinal), iri(XSD + 'integer')));
      for (const [p, value] of [['subject', subject], ['predicate', predicate], ['object', object]] as const) {
        this.dataset.addQuad(record, iri(RDF + p), value);
      }
      for (const [p, value] of Object.entries({
        authority: contextPackEvidenceAuthority(fact), path: fact.provenance.path,
        commit: fact.provenance.commitSha, sourceDigest: fact.provenance.digest,
        extractor: `${fact.extractor.id}@${fact.extractor.version}`,
        snapshotId: fact.snapshotId, record: stableJson(fact),
      })) this.dataset.addQuad(record, iri(CG + p), literal(value));
      for (const [p, value] of [['startLine', fact.provenance.startLine], ['endLine', fact.provenance.endLine]] as const) {
        this.dataset.addQuad(record, iri(CG + p), literal(String(value), iri(XSD + 'integer')));
      }
      this.dataset.addQuad(record, iri(CG + 'confidence'), literal(String(fact.confidence), iri(XSD + 'decimal')));
      for (const node of [fact.subject, fact.object]) {
        const term = iri(nodeIri(node.id));
        this.dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'Node'));
        this.dataset.addQuad(term, iri(CG + 'identifier'), literal(node.id));
        this.dataset.addQuad(term, iri(CG + 'kind'), literal(node.kind));
        this.dataset.addQuad(term, iri(CG + 'label'), literal(node.label));
        for (const [key, value] of Object.entries(node.attributes ?? {})) {
          const datatype = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'decimal' : 'string';
          this.dataset.addQuad(term, iri(`${CG}attribute/${encodeURIComponent(key)}`),
            literal(String(value), iri(XSD + datatype)), record);
        }
      }
    }
    this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'manifest'),
      literal(stableJson(snapshot.manifest)));
    for (const scope of snapshot.manifest.scope ?? []) {
      this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'scope'), literal(scope));
    }
    if (snapshot.manifest.configurationDigest) {
      this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'configurationDigest'),
        literal(snapshot.manifest.configurationDigest));
    }
  }

  async validate() {
    const report = await new SHACLValidator(new Store(shapes)).validate(this.dataset);
    const issues = report.results.map((result) => ({
      category: 'extraction-gap' as const,
      focus: result.focusNode?.value,
      path: result.path?.value,
      message: result.message.map((message) => message.value).join('; '),
    }));
    for (const fact of this.snapshot.facts) {
      if (fact.provenance.endLine < fact.provenance.startLine) {
        issues.push({ category: 'extraction-gap', focus: factIri(fact.id), path: CG + 'endLine',
          message: 'Citation ends before it starts' });
      }
    }
    return { conforms: report.conforms && issues.length === 0, issues };
  }

  async select(sparql: string, maxRows = 1000) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100_000) throw new Error('Invalid SPARQL row bound');
    const ast = new SparqlParser().parse(sparql);
    const hasService = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      if ((value as { type?: string }).type === 'service') return true;
      return Object.values(value).some(hasService);
    };
    if (ast.type !== 'query' || ast.queryType !== 'SELECT' || ast.from || hasService(ast)) {
      throw new Error('Only local read queries are supported; remote datasets and updates are disabled');
    }
    const stream = await engine.queryBindings(sparql, { sources: [this.dataset] });
    const rows: Record<string, string>[] = [];
    let truncated = false;
    for await (const binding of stream) {
      if (rows.length === maxRows) { truncated = true; stream.destroy(); break; }
      rows.push(Object.fromEntries([...binding].map(([key, value]) => [key.value, value.value])));
    }
    return { rows, truncated };
  }

  /** The traversal projection is read through SPARQL, not a separate fact source. */
  async facts(): Promise<readonly GraphFact[]> {
    const result = await this.select(`SELECT ?record WHERE {
      ?fact <${CG}record> ?record; <${CG}ordinal> ?ordinal
    } ORDER BY ?ordinal`, 100_000);
    if (result.truncated) throw new Error('Graph exceeds the 100000-fact projection bound');
    return result.rows.map((row) => JSON.parse(row.record!) as GraphFact);
  }

  serialize(): Promise<string> {
    const writer = new Writer({ format: 'N-Quads' });
    writer.addQuads(this.dataset.getQuads(null, null, null, null));
    return new Promise((resolve, reject) => writer.end((error, text) => error ? reject(error) : resolve(text)));
  }
}
