import {
  createPublicKey,
  createVerify,
} from "node:crypto";


const DEFAULTS = Object.freeze({
  issuer:
    "https://token.actions.githubusercontent.com",

  audience:
    "nexo-atlas-autonomy-writer",

  repository:
    "byDenoso/Pantheon",

  repository_id:
    "1192094714",

  repository_owner_id:
    "271082760",

  workflow_ref:
    "byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main",

  ref:
    "refs/heads/main",

  sub:
    "repo:byDenoso/Pantheon:ref:refs/heads/main",

  jwks_url:
    "https://token.actions.githubusercontent.com/.well-known/jwks",
});


const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_HEADER_BYTES = 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_JWKS_BYTES = 64 * 1024;


function fail() {
  return null;
}


function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function base64urlDecode(value, maxBytes) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("BASE64URL");
  }

  const decoded =
    Buffer.from(value, "base64url");

  if (decoded.length > maxBytes) {
    throw new Error("SIZE");
  }

  const roundtrip =
    decoded.toString("base64url");

  if (roundtrip !== value) {
    throw new Error("ROUNDTRIP");
  }

  return decoded;
}


function jsonPart(value, maxBytes) {
  const raw =
    base64urlDecode(
      value,
      maxBytes,
    );

  return JSON.parse(
    raw.toString("utf8"),
  );
}


function validDecimalId(value) {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  );
}


function validAttempt(value) {
  return (
    value === 1 ||
    value === "1"
  );
}


function validTimeClaims(
  claims,
  now,
) {
  const seconds =
    Math.floor(now / 1000);

  if (
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.nbf) ||
    !Number.isSafeInteger(claims.exp)
  ) {
    return false;
  }

  if (
    claims.iat < seconds - 600 ||
    claims.iat > seconds + 30
  ) {
    return false;
  }

  if (
    claims.nbf > seconds + 30 || claims.nbf >= claims.exp
  ) {
    return false;
  }

  if (
    claims.exp <= seconds ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 600
  ) {
    return false;
  }

  return true;
}


function validateClaims(
  claims,
  options,
  now,
) {
  return (
    isObject(claims) &&
    claims.iss === options.issuer &&
    claims.aud === options.audience &&
    claims.repository === options.repository &&
    claims.repository_id ===
      options.repository_id &&
    claims.repository_owner_id ===
      options.repository_owner_id &&
    claims.repository_visibility ===
      "public" &&
    claims.workflow_ref ===
      options.workflow_ref &&
    claims.ref === options.ref &&
    claims.sub === options.sub &&
    validDecimalId(claims.run_id) &&
    validAttempt(claims.run_attempt) &&
    validTimeClaims(
      claims,
      now,
    )
  );
}


async function fetchJwks(
  fetcher,
  url,
) {
  const response =
    await fetcher(
      url,
      {
        redirect:
          "error",

        signal:
          AbortSignal.timeout(
            5000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      "JWKS_STATUS",
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer(),
    );

  if (
    buffer.length > MAX_JWKS_BYTES
  ) {
    throw new Error(
      "JWKS_SIZE",
    );
  }

  return JSON.parse(
    buffer.toString("utf8"),
  );
}


function verifySignature(
  headerPart,
  payloadPart,
  signaturePart,
  key,
) {
  const verifier =
    createVerify(
      "RSA-SHA256",
    );

  verifier.update(
    `${headerPart}.${payloadPart}`,
  );

  verifier.end();

  return verifier.verify(
    key,
    base64urlDecode(
      signaturePart,
      1024,
    ),
  );
}


export async function verifyActionsIdentity(
  request,
  {
    fetcher = fetch,
    now = Date.now(),
  } = {},
) {
  try {
    if (!Number.isFinite(now)) return null;
    const options = DEFAULTS;
    const authorization =
      request?.headers?.get?.("authorization") || request?.headers?.authorization ||
      "";

    const match =
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
        .exec(
          authorization,
        );

    if (!match) {
      return fail();
    }

    const token =
      match[1];

    if (
      Buffer.byteLength(
        token,
        "utf8",
      ) > MAX_TOKEN_BYTES
    ) {
      return fail();
    }

    const parts =
      token.split(".");

    if (
      parts.length !== 3
    ) {
      return fail();
    }

    const header =
      jsonPart(
        parts[0],
        MAX_HEADER_BYTES,
      );

    const claims =
      jsonPart(
        parts[1],
        MAX_PAYLOAD_BYTES,
      );

    if (
      !isObject(header) ||
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      !header.kid.length || header.kid.length > 128 ||
      "crit" in header ||
      "jku" in header ||
      "x5u" in header
    ) {
      return fail();
    }

    if (
      !validateClaims(
        claims,
        options,
        now,
      )
    ) {
      return fail();
    }

    const jwks =
      await fetchJwks(
        fetcher,
        options.jwks_url,
      );

    if (
      !isObject(jwks) ||
      !Array.isArray(jwks.keys)
    ) {
      return fail();
    }

    const matches =
      jwks.keys.filter(
        key =>
          key &&
          key.kty === "RSA" &&
          key.kid === header.kid &&
          (!key.alg || key.alg === "RS256") &&
          (!key.use || key.use === "sig"),
      );

    if (
      matches.length !== 1
    ) {
      return fail();
    }

    const publicKey =
      createPublicKey({
        key: matches[0],
        format: "jwk",
      });

    if (
      !verifySignature(
        parts[0],
        parts[1],
        parts[2],
        publicKey,
      )
    ) {
      return fail();
    }

    return {
      run_id:
        claims.run_id,

      run_attempt:
        1,

      workflow_ref:
        claims.workflow_ref,
    };
  } catch {
    return fail();
  }
}

