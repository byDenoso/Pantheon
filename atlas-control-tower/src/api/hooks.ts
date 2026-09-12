import { useEffect, useMemo, useState } from 'react';
import type { AtlasApiClient, AtlasContext, LabData, ObservatoryData, PanelRead, ResearchRecord } from './types';
import { createAtlasAdapter } from './adapters';
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

export function useObservatoryData(client: AtlasApiClient, context: AtlasContext) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<ObservatoryData>>(initialRead<ObservatoryData>);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    void adapter.getObservatorySummary(context).then(data => {
      if (!live) return;
      const hasData = Boolean(data.h0 || data.tensions.length || data.directionalSignals.length || data.parameters.length || data.narrative);
      setRead({ state: hasData ? (data.freshness.state === 'STALE' ? 'STALE' : 'READY') : 'EMPTY', data, freshness: data.freshness });
    }).catch(error => {
      if (!live) return;
      setRead(previous => ({ ...previous, state: previous.data ? 'STALE' : 'API_ERROR', error: errorMessage(error), freshness: { ...previous.freshness, state: previous.data ? 'STALE' : 'DEGRADED' } }));
    });
    return () => { live = false; };
  }, [adapter, context]);
  return read;
}

export function useLabData(client: AtlasApiClient, context: AtlasContext) {
  const adapter = useMemo(() => createAtlasAdapter(client), [client]);
  const [read, setRead] = useState<PanelRead<LabData>>(initialRead);
  useEffect(() => {
    let live = true;
    setRead(previous => ({ ...previous, state: 'LOADING' }));
    const jobs = Promise.allSettled([
      adapter.getClaims(context), adapter.getTests(context), adapter.getRuns(context), adapter.getResults(context), adapter.getEvidence(context), adapter.getPipelines(context)
    ]);
    void jobs.then(results => {
      if (!live) return;
      const value = <T,>(index: number): T[] => results[index].status === 'fulfilled' ? results[index].value as T[] : [];
      const failed = results.filter(item => item.status === 'rejected').length;
      const data: LabData = { claims: value<ResearchRecord>(0), tests: value<ResearchRecord>(1), runs: value<ResearchRecord>(2), results: value<ResearchRecord>(3), evidence: value<ResearchRecord>(4), pipelines: value<ResearchRecord>(5) };
      const hasData = Object.values(data).some(items => items.length > 0);
      const freshness = freshnessFromResults(results, failed, client.provenance?.freshness);
      setRead({ state: failed === results.length ? 'API_ERROR' : failed ? 'PARTIAL' : hasData ? 'READY' : 'EMPTY', data, freshness: { state: freshness }, error: failed ? 'PARTIAL_READ' : undefined });
    });
    return () => { live = false; };
  }, [adapter, context]);
  return read;
}
