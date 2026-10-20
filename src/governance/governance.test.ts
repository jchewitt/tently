import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { analyzeArchitecture, type ArchitecturePolicy } from "./governance.js";
import { RdfEvidenceGraph, CG, nodeIri } from "../graph/rdf.js";

it('checks positive/negative architecture, transitive inference and scoped debt using actual analysis tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'architecture-fixture-'));
  const execute = promisify(execFile);
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  for (const layer of ['domain','adapters','ui']) await mkdir(join(root,'src',layer),{recursive:true});
  await writeFile(join(root,'src/domain/contract.ts'),'export interface Order { id: string }\n');
  await writeFile(join(root,'src/adapters/queue.ts'),"import type { Order } from '../domain/contract';\nexport const enqueue = (order: Order) => order.id;\n");
  await writeFile(join(root,'src/ui/view.ts'),'export const view = () => "view";\n');
  const policy: ArchitecturePolicy = {
    schemaVersion:1, roots:['src'],
    modules:[
      {id:'domain',path:'^src/domain/',domain:'orders',layer:'domain'},
      {id:'adapters',path:'^src/adapters/',domain:'orders',layer:'adapters',adapter:true},
      {id:'ui',path:'^src/ui/',domain:'orders',layer:'presentation'},
    ],
    contracts:[{path:'src/domain/contract.ts',owner:'domain'}],
    rules:[
      {id:'domain-no-ui',kind:'forbidden-import',from:'^src/domain/',to:'^src/ui/',approved:true,
        approvalRef:'approved-fictional-example',transitive:true},
      {id:'unique-owner',kind:'contract-owner',approved:true,approvalRef:'approved-fictional-example'},
      {id:'no-cycles',kind:'no-cycles',approved:true,approvalRef:'approved-fictional-example'},
    ],
    advisory:{maxLines:100,maxComplexity:10,duplicateMinTokens:40},
  };
  const savePolicy = () => writeFile(join(root,'architecture.policy.json'),JSON.stringify(policy));
  await savePolicy(); await git('init','--quiet'); await git('add','.');
  await git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
    '-c','commit.gpgsign=false','commit','--quiet','-m','architecture');
  const good = await analyzeArchitecture(root,policy);
  expect(good.findings.filter((f)=>f.category==='infrastructure-failure')).toEqual([]);
  expect(good.passed).toBe(true);
  await writeFile(join(root,'src/adapters/queue.ts'),"import { view } from '../ui/view';\nexport const enqueue = () => view();\n");
  await writeFile(join(root,'src/domain/service.ts'),"import { enqueue } from '../adapters/queue';\nexport const service = () => enqueue();\n");
  const bad = await analyzeArchitecture(root,policy);
  const violation = bad.findings.find((f)=>f.ruleId==='domain-no-ui');
  expect(violation).toMatchObject({category:'rule-violation',disposition:'new',
    from:'src/domain/service.ts',to:'src/ui/view.ts'});
  expect(bad.passed).toBe(false);
  policy.roots = ['src/domain', 'src/ui'];
  await savePolicy();
  const throughExcludedEntryPoint = await analyzeArchitecture(root, policy);
  expect(throughExcludedEntryPoint.passed).toBe(false);
  expect(throughExcludedEntryPoint.findings).toContainEqual(expect.objectContaining({
    ruleId: 'domain-no-ui', category: 'rule-violation',
    from: 'src/domain/service.ts', to: 'src/ui/view.ts',
  }));
  expect(throughExcludedEntryPoint.snapshot.facts).toContainEqual(expect.objectContaining({
    subject: expect.objectContaining({ id: 'component:file:src/adapters/queue.ts' }),
    object: expect.objectContaining({ id: 'component:file:src/ui/view.ts' }),
    predicate: 'consumes',
  }));
  policy.modules = policy.modules.filter((module) => module.id !== 'adapters');
  await savePolicy();
  expect((await analyzeArchitecture(root, policy)).findings).toContainEqual(expect.objectContaining({
    category: 'extraction-gap', ruleId: 'module-mapping', from: 'src/adapters/queue.ts',
  }));
  policy.modules.push({id:'adapters',path:'^src/adapters/',domain:'orders',layer:'adapters',adapter:true});
  policy.roots = ['src'];
  await savePolicy();
  const graph = new RdfEvidenceGraph(bad.snapshot);
  const closure = await graph.select(`SELECT ?target WHERE {
    <${nodeIri('component:file:src/domain/service.ts')}> <${CG}consumes>+ ?target
  }`);
  expect(closure.rows.some((row)=>row.target===nodeIri('component:file:src/ui/view.ts'))).toBe(true);
  policy.baseline=[{fingerprint:violation!.fingerprint,reason:'Existing bounded example debt',
    approvalRef:'approved-fictional-baseline'}];
  await savePolicy();
  expect((await analyzeArchitecture(root,policy)).findings.find((f)=>f.ruleId==='domain-no-ui')?.disposition).toBe('baseline');
  await writeFile(join(root,'src/domain/another.ts'),"import { view } from '../ui/view';\nexport const another = view;\n");
  const newer = await analyzeArchitecture(root,policy);
  expect(newer.findings.some((f)=>f.ruleId==='domain-no-ui'&&f.disposition==='new')).toBe(true);
  policy.exceptions = [{fingerprint:violation!.fingerprint, ruleId:'domain-no-ui',
    from:'src/domain/service.ts',to:'src/ui/view.ts',reason:'Temporary fictional migration',
    approvalRef:'approved-fictional-exception',expires:'2999-01-01'}];
  await savePolicy();
  expect((await analyzeArchitecture(root,policy)).findings.find((f)=>f.from==='src/domain/service.ts'&&f.ruleId==='domain-no-ui')?.disposition).toBe('exception');
  policy.baseline = []; policy.exceptions[0]!.expires = '2000-01-01';
  await savePolicy();
  expect((await analyzeArchitecture(root,policy)).findings.find((f)=>f.from==='src/domain/service.ts'&&f.ruleId==='domain-no-ui')?.disposition).toBe('new');
  await writeFile(join(root,'src/ui/view.ts'),"import { service } from '../domain/service';\nexport const view = () => service();\n");
  expect((await analyzeArchitecture(root,policy)).findings.some((f)=>f.ruleId==='no-cycles'&&f.category==='rule-violation')).toBe(true);
  await writeFile(join(root,'src/domain/missing.ts'),"export { unknown } from './not-present';\n");
  expect((await analyzeArchitecture(root,policy)).findings.some((f)=>f.category==='extraction-gap'&&f.ruleId==='unresolved-import')).toBe(true);
  policy.contracts!.push({path:'src/domain/contract.ts',owner:'ui'});
  await savePolicy();
  expect((await analyzeArchitecture(root,policy)).findings.some((f)=>f.ruleId==='unique-owner'&&f.category==='rule-violation')).toBe(true);
},60_000);
