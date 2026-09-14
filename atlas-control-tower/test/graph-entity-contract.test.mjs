import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceGraphEntityContract,
  MAP_ENTITY_TYPES,
  TRANSVERSAL_GROUP_ID,
  TRANSVERSAL_GROUP_TYPE
} from '../src/graph-engine/graph-entity-contract.ts';

function projectionFixture(nodes, edges) {
  return {
    id: 'p1',
    version: '1',
    level: 'domain',
    focusId: nodes[0]?.id || null,
    nodes,
    edges,
    breadcrumbs: [],
    capabilities: { drillDown: true, learning: false, provenance: true, search: true }
  };
}

test('map entity contract keeps SYSTEM/ROOT/DOMAIN/CAMPAIGN plus the real PROGRAM/ACTION structural types Engineering/Olympus/Operations publish', () => {
  assert.deepEqual([...MAP_ENTITY_TYPES].sort(), ['ACTION', 'CAMPAIGN', 'DOMAIN', 'PROGRAM', 'ROOT', 'SYSTEM']);
});

test('PROGRAM and ACTION nodes survive the contract like DOMAIN/CAMPAIGN do -- focusing a system whose real children are PROGRAM/ACTION typed must not collapse to a lone root node', () => {
  const nodes = [
    { id: 'system:ENGINEERING', type: 'SYSTEM', label: 'Engenharia' },
    { id: 'ENG-PROG-NOVA-CAMB', type: 'PROGRAM', label: 'Nova Camb' },
    { id: 'ENG-CAMP-CAMB-PORTABILITY-RUNTIME', type: 'CAMPAIGN', label: 'Portability Runtime' }
  ];
  const edges = [
    { id: 'e1', source: 'system:ENGINEERING', target: 'ENG-PROG-NOVA-CAMB', type: 'CONTAINS', declared: true },
    { id: 'e2', source: 'ENG-PROG-NOVA-CAMB', target: 'ENG-CAMP-CAMB-PORTABILITY-RUNTIME', type: 'CONTAINS', declared: true }
  ];
  const { projection, issues } = enforceGraphEntityContract(projectionFixture(nodes, edges));

  assert.deepEqual(projection.nodes.map(n => n.id).sort(), nodes.map(n => n.id).sort());
  assert.equal(projection.edges.length, 2);
  assert.ok(!issues.some(issue => issue.code === 'REJECTED_NODE_TYPE'));
});

test('rejects TEST/CLAIM/DATASET/ARTIFACT/RESULT/EVIDENCE node types and reports an issue per node', () => {
  const rejectedTypes = ['TEST', 'CLAIM', 'DATASET', 'ARTIFACT', 'RESULT', 'EVIDENCE', 'HYPOTHESIS', 'RUN'];
  const nodes = [
    { id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' },
    ...rejectedTypes.map(type => ({ id: `${type.toLowerCase()}:1`, type, label: type }))
  ];
  const { projection, issues } = enforceGraphEntityContract(projectionFixture(nodes, []));

  assert.deepEqual(projection.nodes.map(n => n.id), ['domain:sci']);
  const rejectedCodes = issues.filter(issue => issue.code === 'REJECTED_NODE_TYPE');
  assert.equal(rejectedCodes.length, rejectedTypes.length);
  for (const type of rejectedTypes) {
    assert.ok(rejectedCodes.some(issue => issue.nodeType === type), `expected an issue for rejected type ${type}`);
  }
});

test('drops edges that touch a rejected node instead of leaving a dangling reference', () => {
  const nodes = [
    { id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' },
    { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha 1' },
    { id: 'test:t1', type: 'TEST', label: 'Teste 1' }
  ];
  const edges = [
    { id: 'e1', source: 'domain:sci', target: 'campaign:c1', type: 'CONTAINS', declared: true },
    { id: 'e2', source: 'campaign:c1', target: 'test:t1', type: 'TESTS', declared: true }
  ];
  const { projection, issues } = enforceGraphEntityContract(projectionFixture(nodes, edges));

  assert.deepEqual(projection.edges.map(e => e.id), ['e1']);
  assert.ok(issues.some(issue => issue.code === 'REJECTED_EDGE_TYPE' && issue.edgeId === 'e2'));
});

test('campaign is terminal: a campaign never gains DOMAIN-shaped children of its own', () => {
  // The contract module never introduces a third graph ring on its own; it only
  // ever removes non-DOMAIN/CAMPAIGN nodes or regroups orphans. A campaign with a
  // child of a rejected type simply loses that child, proving there is no path for
  // the map to grow a level below CAMPAIGN.
  const nodes = [
    { id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' },
    { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha 1' },
    { id: 'claim:x', type: 'CLAIM', label: 'Claim X' }
  ];
  const edges = [
    { id: 'e1', source: 'domain:sci', target: 'campaign:c1', type: 'CONTAINS', declared: true },
    { id: 'e2', source: 'campaign:c1', target: 'claim:x', type: 'PRODUCES', declared: true }
  ];
  const { projection } = enforceGraphEntityContract(projectionFixture(nodes, edges));
  const campaign = projection.nodes.find(n => n.id === 'campaign:c1');
  assert.ok(campaign);
  assert.equal(projection.edges.filter(e => e.source === 'campaign:c1').length, 0);
});

test('a campaign with no DOMAIN parent is grouped under the derived Transversais group, not dropped', () => {
  const nodes = [
    { id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' },
    { id: 'campaign:orphan', type: 'CAMPAIGN', label: 'Cross-domain campaign' }
  ];
  const { projection, issues } = enforceGraphEntityContract(projectionFixture(nodes, []));

  const group = projection.nodes.find(n => n.id === TRANSVERSAL_GROUP_ID);
  assert.ok(group, 'Transversais group should be created');
  assert.equal(group.type, TRANSVERSAL_GROUP_TYPE);
  assert.notEqual(group.type, 'DOMAIN', 'Transversais must never be labeled as a canonical domain');
  assert.ok(projection.edges.some(e => e.source === TRANSVERSAL_GROUP_ID && e.target === 'campaign:orphan'));
  assert.ok(issues.some(issue => issue.code === 'ORPHAN_CAMPAIGN_GROUPED' && issue.nodeId === 'campaign:orphan'));
});

test('a campaign with a DOMAIN parent is left alone and never grouped under Transversais', () => {
  const nodes = [
    { id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' },
    { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha 1' }
  ];
  const edges = [{ id: 'e1', source: 'domain:sci', target: 'campaign:c1', type: 'CONTAINS', declared: true }];
  const { projection, issues } = enforceGraphEntityContract(projectionFixture(nodes, edges));

  assert.ok(!projection.nodes.some(n => n.id === TRANSVERSAL_GROUP_ID));
  assert.ok(!issues.some(issue => issue.code === 'ORPHAN_CAMPAIGN_GROUPED'));
});

test('is a pure function: never mutates the input projection', () => {
  const nodes = [{ id: 'domain:sci', type: 'DOMAIN', label: 'Ciência' }, { id: 'test:t1', type: 'TEST', label: 'Teste' }];
  const input = projectionFixture(nodes, []);
  const snapshot = JSON.parse(JSON.stringify(input));
  enforceGraphEntityContract(input);
  assert.deepEqual(input, snapshot);
});
