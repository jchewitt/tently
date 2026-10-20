import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Parser } from 'n3';
import { expect, it } from 'vitest';
import { SemanticHydrator } from "../src/extraction/semantic.js";
import { SemanticArtifactStore } from "../src/storage/storage.js";
import { DirectRdfOntologyCompiler } from "../src/extraction/ontology.js";
import { CG, nodeIri } from "../src/graph/rdf.js";
import { sha256 } from "../src/infrastructure/util.js";
import type { ContextGraphConfig } from "../src/configuration/config.js";

it('preserves validated assertion semantics in RDF and deterministic optional OML without running a compiler', async () => {
  const root = await mkdtemp(join(tmpdir(),'rdf-oml-parity-'));
  const config: ContextGraphConfig = JSON.parse(await readFile(
    new URL("../examples/generic-typescript/context-graph.config.json",import.meta.url),'utf8'));
  const content='The worker implements search.\n';
  const {artifact} = await new SemanticHydrator(config.semantic,new SemanticArtifactStore(root),{
    identity:'fixture:1',
    async extract() { return {
      parsed:{assertions:[{subject:{id:'capability:search',kind:'Capability',label:'Search'},
        predicate:'implementedBy',object:{id:'component:worker',kind:'Component',label:'Worker'},
        citation:{startLine:1,endLine:1},confidence:1}],oml:'untrusted model OML',diagnostics:[]},
      rawModelOutput:'fixture',
    }; },
  }).hydrate({stableSemanticId:'search',path:'docs/search.md',content,digest:sha256(content)},{
    repositoryRoot:root,repositoryId:'example',ref:'HEAD',commitSha:'a'.repeat(40),
    snapshotId:'test',changedPaths:[],deletedPaths:[],renamedPaths:{},
  });
  expect(artifact.oml).toContain('cg:implementedBy');
  expect(artifact.oml).toContain('cg:hasIdentifier "capability:search"');
  expect(artifact.oml).not.toContain('untrusted model OML');
  const result=await new DirectRdfOntologyCompiler(root).compile('test',[artifact]);
  const quads=new Parser({format:'N-Triples'}).parse(await readFile(result.rdfFiles[0]!,'utf8'));
  expect(quads.map(q=>[q.subject.value,q.predicate.value,q.object.value])).toEqual([
    [nodeIri('capability:search'),CG+'implementedBy',nodeIri('component:worker')],
  ]);
});
