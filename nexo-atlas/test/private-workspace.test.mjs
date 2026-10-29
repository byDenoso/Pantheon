import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {domainOutline} from '../src/private-workspace/model.ts';
import {WORKSPACE_COPY} from '../src/private-workspace/copy.ts';

test('canonical subdomain and topic identifiers remain visible when display names are absent', () => {
  const state = {graph:{nodes:[],edges:[]},lanes:[]};
  const lab = {campaigns:new Map(),hypotheses:new Map()};
  const row = {id:'synthetic-only',domain:'SCIENCE',subdomainId:'synthetic-subdomain',subdomain:null,topicId:'synthetic-topic',topic:null};
  const outline = domainOutline([row],lab,state,'SCIENCE');
  assert.equal(outline.withoutSubdomain,0);
  assert.equal(outline.subdomains[0].key,'synthetic-subdomain');
  assert.equal(outline.subdomains[0].named,false);
  assert.equal(outline.subdomains[0].topics[0].key,'synthetic-topic');
  assert.equal(outline.subdomains[0].topics[0].named,false);
});

test('different canonical topics with one display name are not merged', () => {
  const state = {graph:{nodes:[],edges:[]},lanes:[]};
  const lab = {campaigns:new Map(),hypotheses:new Map()};
  const rows = ['first','second'].map(id => ({id,domain:'SCIENCE',subdomainId:'synthetic-subdomain',subdomain:'Synthetic subdomain',topicId:id,topic:'Shared synthetic name'}));
  assert.equal(domainOutline(rows,lab,state,'SCIENCE').subdomains[0].topics.length,2);
});

test('an absent interpretation is not labelled as an absent result; memory has its own coverage', () => {
  for (const lang of ['pt-BR','en']) assert.notEqual(WORKSPACE_COPY[lang].noMeaning,WORKSPACE_COPY[lang].noResult);
  const view = readFileSync('src/private-workspace/Views.tsx','utf8');
  assert.match(view,/test\.meaning \? <SourceValue[^\n]+m\.noMeaning/);
  assert.match(readFileSync('src/private-workspace/PrivateWorkspace.tsx','utf8'),/route\.page !== 'memory' && route\.page !== 'board' && coverageNote/);
});
