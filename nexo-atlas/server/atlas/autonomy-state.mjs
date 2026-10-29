/**
 * Read-only autonomy projection.
 *
 * PRECONDITION:
 * The caller MUST run the existing canonical validation/normalization pipeline
 * before calling this function.
 *
 * This module does NOT authenticate Tower data, prove storage identity, verify
 * hashes, parse CONTROL files, or validate external receipts.
 *
 * Input contract:
 * {
 *   control,
 *   revision,
 *   generatedAt
 * }
 *
 * observedAt is the real query time supplied by the caller.
 */

export const CONTRACT =
  "NEXO_AUTONOMY_READ_ONLY_VIEW_V1";

const SCHEMA =
  "NEXO_AUTONOMY_MANDATE_V1";

const DOMAIN =
  "OBSERVATIONAL_COSMOLOGY";

const RUNNER =
  "GITHUB_ACTIONS_STANDARD_PUBLIC";

const ID_RE =
  /^[A-Za-z0-9_-]{3,80}$/;


function validRevision(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 1
  );
}


function validId(value) {
  return (
    typeof value === "string" &&
    ID_RE.test(value)
  );
}


function validCommon(mandate) {
  return (
    mandate.schema === SCHEMA &&
    validId(mandate.id) &&
    validRevision(mandate.revision)
  );
}


function view({
  status,
  observedAt,
  sourceUpdatedAt,
  towerFingerprint,
  mandate,
}) {
  return {
    contract: CONTRACT,
    status,
    observed_at: observedAt,
    source_updated_at: sourceUpdatedAt,
    tower_fingerprint:
      towerFingerprint ?? null,
    mandate,
    actions: {
      approve: false,
      revoke: false,
    },
  };
}


function projectedMandate(mandate) {
  if (!mandate) {
    return null;
  }

  return {
    id: mandate.id,
    revision: mandate.revision,
    status: mandate.status,
  };
}


export function projectAutonomyState(
  {
    control,
    revision,
    generatedAt,
  },
  observedAt,
) {
  const base = {
    observedAt,
    sourceUpdatedAt: generatedAt ?? null,
    towerFingerprint:
      revision ?? null,
  };

  if (!control || typeof control !== "object" || Array.isArray(control)) {
    return view({
      ...base,
      status: "UNKNOWN",
      mandate: null,
    });
  }

  const mandate =
    control.autonomy_mandate;

  if (
    mandate === undefined ||
    mandate === null
  ) {
    return view({
      ...base,
      status: "PREPARED_INACTIVE",
      mandate: null,
    });
  }

  if (
    typeof mandate !== "object" || Array.isArray(mandate) ||
    !validCommon(mandate)
  ) {
    return view({
      ...base,
      status: "UNKNOWN",
      mandate: null,
    });
  }

  // Canonical storage proves what was recorded, not the human approval chain.
  // This read-only view does not verify the Writer receipt and MUST NOT assert ACTIVE.
  if (mandate.status === "ACTIVE") {
    const validActive =
      mandate.domain === DOMAIN &&
      mandate.public_data_only === true &&
      mandate.no_additional_cost === true &&
      mandate.runner === RUNNER;

    return view({
      ...base,
      status:
        validActive
          ? "ACTIVE_UNVERIFIED"
          : "UNKNOWN",
      mandate:
        validActive
          ? projectedMandate(mandate)
          : null,
    });
  }

  if (mandate.status === "REVOKED") {
    return view({
      ...base,
      status: "REVOKED",
      mandate:
        projectedMandate(mandate),
    });
  }

  return view({
    ...base,
    status: "UNKNOWN",
    mandate: null,
  });
}
