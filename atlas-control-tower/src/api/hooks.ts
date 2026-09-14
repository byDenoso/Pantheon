import { useEffect, useMemo, useState } from 'react';
import type { AtlasApiClient, AtlasContext, LabData, ObservatoryData, PanelRead, ResearchRecord } from './types';
import type { ObservatoryQuestionsRead } from './observatory-questions';
import type { ScienceReadModelV2 } from './science-read-model';
import { createAtlasAdapter } from './multisurface-adapters';
import { errorMessage } from './errors';

function initialRead<T>(): PanelRead<T> {
  return { state: 'LOADING', data: null, freshness: { state: 'DEGRADED' } };
}

function freshnessFromResults(results: PromiseSettledResult<unknown>[], failed: number, fallback?: string): 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' {
  const states = results.filter((item): item is PromiseFulfilledResult<unknown> => item.status === 'fulfilled').map(item => {
    const value = item.value;
    if (!value || typeof value !== 'object') return '';
    const state = (value as Record<string, unknown>).freshness;
    if (typeof state === 'string') return state.toUpperCase();
    if (state && typeof state === 'object' && typeof (state as Record<string, unknown>).state === 'string') return String((state as Record<string, unknown>).state).toUpperCase();
    return '';
  });
  if (states.includes('STALE')) return 'STALE';
  if (states.includes('SNAPSHOT')) return 'SNAPSHOT';
  if (failed) return 'DEGRADED';
  const normalizedFallback = fallback?.toUpperCase();
  if (normalizedFallback === 'STALE') return 'STALE';
  if (normalizedFallback === 'SNAPSHOT') return 'SNAPSHOT';
  if (normalizedFallback === 'DEGRADED' || normalizedFallback === 'OFFLINE') return 'DEGRADED';
  return 'LIVE';
}

export function useScienceReadModel(client: AtlasApiClient) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<ScienceReadModelV2>>(initialRead<ScienceReadModelV2>);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    void adapter.getScienceReadModel().then(data => {
      if (!live) return;
      const state = data.state === 'PARTIAL' ? 'PARTIAL' : data.state === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : data.state === 'ERROR' ? 'API_ERROR' : data.state === 'EMPTY' ? 'EMPTY' : data.freshness === 'STALE' ? 'STALE' : 'READY';
      const freshness = data.freshness === 'LIVE' || data.freshness === 'SNAPSHOT' || data.freshness === 'STALE' || data.freshness === 'DEGRADED' ? data.freshness : 'DEGRADED';
      setRead({ state, data, freshness: { state: freshness, source: 'GOOGLE_DRIVE', sourceVersion: data.sourceVersion, updatedAt: data.generatedAt } });
    }).catch(error => {
      if (!live) return;
      setRead(previous => ({ ...previous, state: previous.data ? 'STALE' : 'API_ERROR', error: errorMessage(error), freshness: { ...previous.freshness, state: previous.data ? 'STALE' : 'DEGRADED' } }));
    });
    return () => { live = false; };
  }, [adapter]);
  return read;
}

export function useObservatoryData(client: AtlasApiClient, context: AtlasContext) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<ObservatoryData>>(initialRead<ObservatoryData>);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    void adapter.getObservatorySummary(context).then(data => {
      if (!live) return;
      const hasData = Boolean(data.h0 || data.h0Stacks?.length || data.tensions.length || data.directionalSignals.length || data.parameters.length || data.narrative);
      setRead({ state: hasData ? (data.freshness.state === 'STALE' ? 'STALE' : 'READY') : 'EMPTY', data, freshness: data.freshness });
    }).catch(error => {
      if (!live) return;
      setRead(previous => ({ ...previous, state: previous.data ? 'STALE' : 'API_ERROR', error: errorMessage(error), freshness: { ...previous.freshness, state: previous.data ? 'STALE' : 'DEGRADED' } }));
    });
    return () => { live = false; };
  }, [adapter, context]);
  return read;
}

export function useObservatoryQuestions(client: AtlasApiClient) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<ObservatoryQuestionsRead>>(initialRead<ObservatoryQuestionsRead>);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    void adapter.getObservatoryQuestions().then(data => {
      if (!live) return;
      const freshness = String(data.freshness || '').toUpperCase();
      const state = freshness === 'STALE' ? 'STALE' : data.questions.length ? 'READY' : 'EMPTY';
      setRead({ state, data, freshness: { state: freshness === 'LIVE' ? 'LIVE' : freshness === 'STALE' ? 'STALE' : 'SNAPSHOT', source: data.source, sourceVersion: data.sourceVersion } });
    }).catch(error => {
      if (!live) return;
      setRead(previous => ({ ...previous, state: previous.data ? 'STALE' : 'API_ERROR', error: errorMessage(error), freshness: { ...previous.freshness, state: previous.data ? 'STALE' : 'DEGRADED' } }));
    });
    return () => { live = false; };
  }, [adapter]);
  return read;
}

export function useLabData(client: AtlasApiClient, context: AtlasContext) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<LabData>>(initialRead);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    const jobs = Promise.allSettled([
      adapter.getHypotheses(context), adapter.getClaims(context), adapter.getTests(context),
      adapter.getRuns(context), adapter.getResults(context), adapter.getEvidence(context),
      adapter.getDecisions(context), adapter.getKnowledge(context), adapter.getPipelines(context)
    ]);
    void jobs.then(results => {
      if (!live) return;
      const value = <T,>(index: number): T[] => results[index].status === 'fulfilled' ? results[index].value as T[] : [];
      const failed = results.filter(item => item.status === 'rejected').length;
      const data: LabData = {
        hypotheses: value<ResearchRecord>(0), claims: value<ResearchRecord>(1), tests: value<ResearchRecord>(2),
        runs: value<ResearchRecord>(3), results: value<ResearchRecord>(4), evidence: value<ResearchRecord>(5),
        decisions: value<ResearchRecord>(6), knowledge: value<ResearchRecord>(7), pipelines: value<ResearchRecord>(8)
      };
      const hasData = Object.values(data).some(items => items.length > 0);
      const freshness = freshnessFromResults(results, failed, client.provenance?.freshness);
      setRead({ state: failed === results.length ? 'API_ERROR' : failed ? 'PARTIAL' : hasData ? 'READY' : 'EMPTY', data, freshness: { state: freshness }, error: failed ? 'PARTIAL_READ' : undefined });
    });
    return () => { live = false; };
  }, [adapter, context]);
  return read;
}
