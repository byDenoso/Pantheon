import type {SystemState} from '../contracts/system.ts';
import type {ViewId} from '../app/navigation.ts';

type ToolAnnotations = {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type ModelContextLike = {
  registerTool: (tool: WebMcpTool) => void | Promise<void>;
  unregisterTool?: (name: string) => void | Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
}

export interface AtlasWebMcpBindings {
  getState: () => SystemState | null;
  getLoad: () => string;
  getView: () => ViewId;
  refresh: () => void;
  navigate: (view: ViewId) => void;
  searchAtlas: (query: string) => void;
}

const EMPTY_SCHEMA = {type:'object',properties:{},additionalProperties:false} as const;
const LIMIT = 50;

const clean = (value: unknown): string => String(value ?? '').trim();
const upper = (value: unknown): string => clean(value).toUpperCase();
const limitOf = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(LIMIT, Math.trunc(parsed)));
};

const stateRequired = (bindings: AtlasWebMcpBindings): SystemState => {
  const state = bindings.getState();
  if (!state) throw new Error(`ATLAS_STATE_${bindings.getLoad() || 'UNAVAILABLE'}`);
  return state;
};

const snapshot = (state: SystemState) => ({
  contract_version: state.contract_version,
  generated_at: state.generated_at,
  global_state: state.global_state,
  fingerprint: state.bus.fingerprint,
  projection_state: state.bus.state,
  counts: {
    actions: state.actions.length,
    inbox: state.inbox.length,
    runs: state.runs.length,
    findings: state.findings.length,
    capabilities: state.capabilities.length,
    graph_nodes: state.graph.nodes.length,
    graph_edges: state.graph.edges.length,
    filaments: state.filaments.length,
  },
  sources: state.bus.sources.map(source => ({
    id: source.id,
    state: source.state,
    source_revision: source.source_revision,
    freshness: source.freshness,
  })),
});

export function installAtlasWebMcp(bindings: AtlasWebMcpBindings): () => void {
  if (typeof document === 'undefined' || typeof document.modelContext?.registerTool !== 'function') return () => {};

  const context = document.modelContext;
  const registered: string[] = [];

  const register = (tool: WebMcpTool) => {
    registered.push(tool.name);
    void Promise.resolve(context.registerTool(tool)).catch(error => {
      console.warn('[atlas-webmcp] register failed', tool.name, String((error as Error)?.message || error));
    });
  };

  register({
    name: 'atlas_get_snapshot',
    description: 'Read the current Atlas/NEXO projection summary, source revisions, freshness and counts. This does not mutate canonical state.',
    inputSchema: EMPTY_SCHEMA,
    annotations: {readOnlyHint:true},
    execute: async () => snapshot(stateRequired(bindings)),
  });

  register({
    name: 'atlas_search_graph',
    description: 'Search Atlas graph nodes by id, label or summary, optionally filtered by node type or domain.',
    inputSchema: {
      type:'object',
      properties:{
        query:{type:'string',minLength:1,maxLength:200,description:'Text to match against id, label and summary.'},
        type:{type:'string',maxLength:40,description:'Optional graph node type such as TEST, CLAIM, ACTION or CAPABILITY.'},
        domain:{type:'string',maxLength:40,description:'Optional domain such as SCIENCE, ENGINEERING, OLYMPUS or NEXO.'},
        limit:{type:'integer',minimum:1,maximum:50,default:20},
      },
      required:['query'],
      additionalProperties:false,
    },
    annotations: {readOnlyHint:true},
    execute: async input => {
      const state = stateRequired(bindings);
      const query = clean(input.query).toLocaleLowerCase();
      const type = upper(input.type);
      const domain = upper(input.domain);
      const rows = state.graph.nodes.filter(node => {
        if (type && node.type !== type) return false;
        if (domain && node.domain !== domain) return false;
        const haystack = `${node.id} ${node.label} ${node.summary}`.toLocaleLowerCase();
        return haystack.includes(query);
      }).slice(0,limitOf(input.limit));
      return {query:clean(input.query),count:rows.length,nodes:rows};
    },
  });

  register({
    name: 'atlas_get_entity',
    description: 'Read one Atlas graph entity by exact id together with its directly connected relations.',
    inputSchema: {
      type:'object',
      properties:{id:{type:'string',minLength:1,maxLength:300}},
      required:['id'],
      additionalProperties:false,
    },
    annotations: {readOnlyHint:true},
    execute: async input => {
      const state = stateRequired(bindings);
      const id = clean(input.id);
      const node = state.graph.nodes.find(item => item.id === id);
      if (!node) return {found:false,id};
      const edges = state.graph.edges.filter(edge => edge.from === id || edge.to === id);
      return {found:true,node,edges};
    },
  });

  register({
    name: 'atlas_list_actions',
    description: 'List canonical action projections visible in Atlas, optionally filtered by status or domain.',
    inputSchema: {
      type:'object',
      properties:{
        status:{type:'string',maxLength:40},
        domain:{type:'string',maxLength:40},
        limit:{type:'integer',minimum:1,maximum:50,default:20},
      },
      additionalProperties:false,
    },
    annotations: {readOnlyHint:true},
    execute: async input => {
      const state = stateRequired(bindings);
      const status = upper(input.status);
      const domain = upper(input.domain);
      const actions = state.actions.filter(action =>
        (!status || action.status === status) && (!domain || action.lane === domain)
      ).slice(0,limitOf(input.limit));
      return {count:actions.length,actions};
    },
  });

  register({
    name: 'atlas_list_blockers',
    description: 'List blockers and integrity findings currently visible in the Atlas projection.',
    inputSchema: {
      type:'object',
      properties:{limit:{type:'integer',minimum:1,maximum:50,default:20}},
      additionalProperties:false,
    },
    annotations: {readOnlyHint:true},
    execute: async input => {
      const state = stateRequired(bindings);
      const limit = limitOf(input.limit);
      const blockedActions = state.actions.filter(action => action.blocker || action.status === 'BLOCKED').slice(0,limit);
      const findings = state.findings.filter(finding =>
        ['BLOCKED','CONFLICT','DEGRADED','MISSING_PROVIDER','STALE_DECLARATION'].includes(finding.status)
      ).slice(0,limit);
      return {blocked_actions:blockedActions,findings};
    },
  });

  register({
    name: 'atlas_list_capabilities',
    description: 'List capability projections and their verification state, optionally filtered by status or domain.',
    inputSchema: {
      type:'object',
      properties:{
        status:{type:'string',maxLength:40},
        domain:{type:'string',maxLength:40},
        limit:{type:'integer',minimum:1,maximum:50,default:20},
      },
      additionalProperties:false,
    },
    annotations: {readOnlyHint:true},
    execute: async input => {
      const state = stateRequired(bindings);
      const status = upper(input.status);
      const domain = upper(input.domain);
      const capabilities = state.capabilities.filter(capability =>
        (!status || capability.status === status) && (!domain || capability.domain === domain)
      ).slice(0,limitOf(input.limit));
      return {count:capabilities.length,capabilities};
    },
  });

  register({
    name: 'atlas_refresh_projection',
    description: 'Request a refresh of the Atlas read-only projection from its existing backend. This does not write to TOWER_V06 or Drive.',
    inputSchema: EMPTY_SCHEMA,
    annotations: {readOnlyHint:true,idempotentHint:true},
    execute: async () => {
      const before = bindings.getState();
      bindings.refresh();
      return {
        accepted:true,
        effect:'READ_MODEL_REFRESH_REQUESTED',
        canonical_mutation:false,
        before_fingerprint:before?.bus.fingerprint ?? null,
        instruction:'Call atlas_get_snapshot after the refresh completes to verify the resulting fingerprint.',
      };
    },
  });

  register({
    name: 'atlas_open',
    description: 'Navigate the visible Atlas site to an existing view. For ATLAS, an optional query also applies the graph search filter.',
    inputSchema: {
      type:'object',
      properties:{
        view:{type:'string',enum:['OVERVIEW','INBOX','ACTIONS','EXECUTION','TRUTHGRAPH','CAPABILITIES','SOURCES','INTEGRITY','ATLAS','LEARNING']},
        query:{type:'string',maxLength:200},
      },
      required:['view'],
      additionalProperties:false,
    },
    annotations: {idempotentHint:true},
    execute: async input => {
      const view = upper(input.view) as ViewId;
      const query = clean(input.query);
      if (view === 'ATLAS' && query) bindings.searchAtlas(query);
      else bindings.navigate(view);
      return {opened:view,query:query || null,previous_view:bindings.getView()};
    },
  });

  return () => {
    if (typeof context.unregisterTool !== 'function') return;
    for (const name of registered) {
      void Promise.resolve(context.unregisterTool(name)).catch(() => {});
    }
  };
}
