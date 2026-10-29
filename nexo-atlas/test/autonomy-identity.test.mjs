import test from "node:test";
import assert from "node:assert/strict";

import {
  generateKeyPairSync,
  createSign,
} from "node:crypto";

import {
  verifyActionsIdentity,
} from "../worker/autonomy/identity.mjs";


const {
  privateKey,
  publicKey,
} =
  generateKeyPairSync(
    "rsa",
    {
      modulusLength: 2048,
    },
  );


function b64(value) {
  return Buffer
    .from(
      JSON.stringify(value),
    )
    .toString("base64url");
}


function createToken(
  overrides = {},
) {
  const now =
    Math.floor(
      Date.now() / 1000,
    );

  const header = {
    alg:
      "RS256",
    kid:
      "test-key",
    typ:
      "JWT",
  };


  const payload = {
    iss:
      "https://token.actions.githubusercontent.com",

    aud:
      "nexo-atlas-autonomy-writer",

    repository:
      "byDenoso/Pantheon",

    repository_id:
      "1192094714",

    repository_owner_id:
      "271082760",

    repository_visibility:
      "public",

    workflow_ref:
      "byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main",

    ref:
      "refs/heads/main",

    sub:
      "repo:byDenoso/Pantheon:ref:refs/heads/main",

    run_id:
      "12345",

    run_attempt:
      "1",

    iat:
      now,

    nbf:
      now,

    exp:
      now + 300,

    ...overrides,
  };


  const h =
    b64(header);

  const p =
    b64(payload);

  const sign =
    createSign(
      "RSA-SHA256",
    );

  sign.update(
    `${h}.${p}`,
  );

  sign.end();


  return (
    `${h}.${p}.` +
    sign
      .sign(privateKey)
      .toString("base64url")
  );
}


function fetcher() {
  return Promise.resolve({
    ok:
      true,

    async arrayBuffer() {
      return Buffer.from(
        JSON.stringify({
          keys:[
            {
              ...publicKey.export({
                format:"jwk",
              }),
              kty:
                "RSA",
              kid:
                "test-key",
              alg:
                "RS256",
              use:
                "sig",
            },
          ],
        }),
      );
    },
  });
}


test(
  "accepts exact writer identity",
  async () => {
    const result =
      await verifyActionsIdentity(
        {
          headers:{
            authorization:
              `Bearer ${createToken()}`,
          },
        },
        {
          fetcher,
        },
      );

    assert.deepEqual(
      result,
      {
        run_id:
          "12345",

        run_attempt:
          1,

        workflow_ref:
          "byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main",
      },
    );
  },
);


for (
  const [name, patch] of [
    [
      "wrong repository id",
      {
        repository_id:
          "1",
      },
    ],

    [
      "wrong owner id",
      {
        repository_owner_id:
          "1",
      },
    ],

    [
      "wrong ref",
      {
        ref:
          "refs/heads/dev",
      },
    ],

    [
      "wrong attempt",
      {
        run_attempt:
          "2",
      },
    ],

    [
      "expired",
      {
        exp:
          1,
      },
    ],

    [
      "future nbf",
      {
        nbf:
          Math.floor(Date.now()/1000)+100,
      },
    ],
  ]
) {
  test(
    `rejects ${name}`,
    async () => {
      const result =
        await verifyActionsIdentity(
          {
            headers:{
              authorization:
                `Bearer ${createToken(patch)}`,
            },
          },
          {
            fetcher,
          },
        );

      assert.equal(
        result,
        null,
      );
    },
  );
}


test(
  "rejects invalid signature",
  async () => {
    const parts = createToken().split(".");
    const signature = Buffer.from(parts[2], "base64url");
    signature[0] ^= 1;
    const token = parts.slice(0, 2).join(".") + "." + signature.toString("base64url");

    const result =
      await verifyActionsIdentity(
        {
          headers:{
            authorization:
              `Bearer ${token}`,
          },
        },
        {
          fetcher,
        },
      );

    assert.equal(
      result,
      null,
    );
  },
);


test(
  "rejects extra token segment",
  async () => {
    const result =
      await verifyActionsIdentity(
        {
          headers:{
            authorization:
              `Bearer ${createToken()}.x`,
          },
        },
        {
          fetcher,
        },
      );

    assert.equal(
      result,
      null,
    );
  },
);

