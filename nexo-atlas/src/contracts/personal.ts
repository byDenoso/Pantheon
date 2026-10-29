export type PersonalEntityKind='Person'|'Message'|'Event'|'Document'|'Task'|'Commitment'|'Decision';
export type PersonalPolicyLevel='L0'|'L1'|'L2'|'L3'|'L4'|'L5';
export type PersonalPolicy='AUTO'|'APPROVAL_REQUIRED'|'DENY';

export interface PersonalSource {
  provider:string;
  source_id:string;
  source_ref:string;
  authority:string;
}

export interface PersonalEntity {
  id:string;
  kind:PersonalEntityKind;
  title:string;
  status:string|null;
  due_at:string|null;
  end_at:string|null;
  source:PersonalSource;
  payload:{summary:string|null;attention:string};
  correlation_id:string;
}

export interface PersonalEvent {
  id:string;
  type:string;
  entity_id:string;
  occurred_at:string|null;
  actor:string;
  subject:string;
  payload:Record<string,unknown>;
  provenance:PersonalSource;
  confidence:number;
  correlation_id:string;
}

export interface PersonalModel {
  version:'1';
  generated_at:string;
  source_world_fingerprint:string|null;
  fingerprint:string;
  entities:PersonalEntity[];
  events:PersonalEvent[];
}

export interface PersonalPolicyDecision {level:PersonalPolicyLevel;policy:PersonalPolicy}

export interface PersonalProposal {
  id:string;
  fingerprint:string;
  kind:string;
  entity_ids:string[];
  evidence:string[];
  detail:string;
  policy:PersonalPolicyDecision;
  observed_at:string;
}

export interface PersonalFollowUp {
  id:string;
  entity_id:string;
  kind:'Task'|'Commitment';
  title:string;
  state:'OPEN'|'CLOSED';
  status:string|null;
  due_at:string|null;
  checked_at:string;
  correlation_id:string;
}
