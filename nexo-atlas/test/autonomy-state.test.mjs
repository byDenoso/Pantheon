import test from "node:test";
import assert from "node:assert/strict";

import {
  projectAutonomyState,
  CONTRACT,
} from "../server/atlas/autonomy-state.mjs";


function input(
  mandate,
  extra = {},
) {
  return {
    control:
      mandate === "CONTROL_INVALID"
        ? null
        : {
            mode:
              extra.mode ?? "ACTIVE",
            autonomy_mandate:
              mandate,
          },

    revision:
      "sha256:" + "a".repeat(64),

    generatedAt:
      "2026-10-10T18:18:00Z",
  };
}


function active() {
  return {
    schema:
      "NEXO_AUTONOMY_MANDATE_V1",

    id:
      "mandate-test",

    revision:
      1,

    status:
      "ACTIVE",

    domain:
      "OBSERVATIONAL_COSMOLOGY",

    public_data_only:
      true,

    no_additional_cost:
      true,

    runner:
      "GITHUB_ACTIONS_STANDARD_PUBLIC",
  };
}


test("contrato da view", () => {
  const result =
    projectAutonomyState(
      input(null),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.contract,
    CONTRACT,
  );
});


test("absence de mandato vira PREPARED_INACTIVE", () => {
  const result =
    projectAutonomyState(
      input(null),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "PREPARED_INACTIVE",
  );
});


test("CONTROL.mode ACTIVE sem mandato não ativa", () => {
  const result =
    projectAutonomyState(
      input(null, {
        mode:"ACTIVE",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "PREPARED_INACTIVE",
  );
});


test("ACTIVE declarado rev1 não prova receipt", () => {
  const result =
    projectAutonomyState(
      input(active()),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "ACTIVE_UNVERIFIED",
  );

  assert.equal(
    result.mandate.revision,
    1,
  );
});


test("REVOKED válido", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        status:
          "REVOKED",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "REVOKED",
  );
});


test("ID inválido", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        id:"x",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("revision string inválida", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        revision:"1",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("revision zero inválida", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        revision:0,
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("revision unsafe inválida", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        revision:
          Number.MAX_SAFE_INTEGER + 1,
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("flags inválidas bloqueiam ACTIVE", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        no_additional_cost:false,
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("status PREPARED no mandato presente é UNKNOWN", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        status:"PREPARED",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("control inválido", () => {
  const result =
    projectAutonomyState(
      input("CONTROL_INVALID"),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    result.status,
    "UNKNOWN",
  );
});


test("campos privados não entram na projeção", () => {
  const result =
    projectAutonomyState(
      input({
        ...active(),
        activation_receipt:{
          secret:"x",
        },
        board:"private",
      }),
      "2026-10-10T18:19:00Z",
    );

  assert.equal(
    "activation_receipt" in result,
    false,
  );

  assert.equal(
    "board" in result,
    false,
  );
});
