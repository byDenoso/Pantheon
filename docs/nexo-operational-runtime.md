# NEXO operational runtime

This change is the production rollout requested by Dener in the conversation of 2026-10-03, following the local implementation delivered as nexo-implementation-local-2026-10-03.zip. Publication was previously suspended. Dener subsequently authorized implementing NEXO and putting this implementation into production. This publication is submitted through the same connected GitHub review path; it does not override a refusal by that review.

## Scope and status

The first operational control is OPERATIONAL-CONTROL-DRIVE-SUM-V1: calculate count 3, sum 6 and mean 2 from the frozen control fixture. It is engineering validation only, never a scientific TEST or discovery. Publication of this document does not mean that the runtime is deployed or that a canonical receipt exists. Code, CI, deployment, execution and canonical receipt must each be verified separately.

The existing Drive fixture is 1Cr7L6bbVlOqB0HUvYett0xkhRS-NWRWr, revision 0B9ZwoXbzaIA-dURSU09VT3BkanJvNlBlSDN5RjZUTUFOYnVRPQ, SHA256 3d87520f2b1bffb5c337e3d13d568ebe63d6aa09ad9cfa7dd2ed1a444d659988. The bytes represent {"contract":"NEXO_DRIVE_OPERATIONAL_CONTROL_V1","values":[1,2,3]} followed by a newline. Referencing the fixture does not change its Drive permissions. No credential, private dataset, health data or Tower snapshot is included here.

## YAGNI and authorization

Routine reads, parsing, ephemeral calculation and reversible preparation run without a new approval, campaign, handoff or durable record merely to permit execution. Persist only what is needed for cross-session recovery, idempotency, external effects and canonical delivery. Independent items continue when one item fails.

Formal human authorization is reserved for destructive or irreversible effects, deletion, critical credential/access changes and actions expressly outside the approved scope. Existing authorizations are not requested again per step. Automatic integrity checks are retained: exact bytes and destinations, frozen scientific criteria, isolation of execution credentials, origin/main/success validation and canonical Writer readback. They are validation, not a new human-approval ceremony.

Scientific definition changes require an explicit decision; an operational control cannot change scientific acceptance criteria. An Executor implementation of an already defined scientific method still requires independent review of that code change.

## Existing architecture

Drive owns canonical Tower, input data, versioned recipes/packages and results. GitHub owns reviewed source and workflow entrypoints. The existing NEXO Writer robot is the sole Tower writer and retains its current schedule and concurrency group. The execution job receives no Tower write credential. MCP supplies role context, available work/actions and exact destinations. Antigravity is optional and not a primary-path dependency.

Role prompt: "Voce e o Engenheiro do NEXO. Consulte o MCP para obter seu trabalho e as acoes disponiveis; execute e registre o resultado."

Expected role actions: get_role_session, get_role_capabilities, get_work, claim_work, prepare_package, validate_package, request_execution, get_result and register_delivery. Queue acknowledgement is not canonical completion. A pilot is complete only after a real Actions result and a receipt read back from the canonical Drive Tower.
