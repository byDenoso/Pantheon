/** Tower → public projection → Pages. No scientific inference in the client. */
export interface CosmologyEvidence {
  id: string;
  kind: 'TEST';
  title: string;
  verdict: 'CONFIRMED' | 'REFUTED' | 'REVIEW' | 'INCONCLUSIVE';
  meaning: string;
  historical: boolean;
  synthesis_eligible: boolean;
  member_ids?: string[];
  source_url?: string | null;
  superseded_by_current?: boolean;
  provenance?: Record<string, unknown>;
}
export interface CosmologyFrontier {
  id: string;
  title: string;
  state: 'SOLID' | 'TENSION' | 'OPEN';
  state_label: string;
  qualification?: string;
  summary: string;
  short_summary?: string;
  why: string;
  confidence: string;
  literature_baseline: string;
  literature_source?: { name: string; url: string; version?: string };
  synthesis_basis: string;
  synthesis_evidence_ids: string[];
  nexo_interpretation: Array<{ text: string; evidence_ids: string[] }>;
  evidence_counts: { confirmed: number; refuted: number; review: number; inconclusive: number; open: number };
  key_evidence: CosmologyEvidence[];
  historical_lessons: CosmologyEvidence[];
  campaign_ids: string[];
  roadmap_ids: string[];
  open_questions: string[];
  next_discriminants: string[];
  active_tests: Array<{ id: string; title: string }>;
}
export interface CosmologyState {
  model: 'COSMOLOGY_STATE_V1';
  authority: 'TOWER';
  projection_only: true;
  generated_at?: string;
  frontiers: CosmologyFrontier[];
  historical_tests: Array<Record<string, unknown> & { id: string }>;
}
