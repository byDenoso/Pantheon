import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
);

test('Vercel Hobby deployment stays within the 12-function limit', () => {
  const serverlessBuilds = vercelConfig.builds.filter(
    (build) => build.use === '@vercel/node',
  );

  assert.ok(
    serverlessBuilds.length <= 12,
    `declares ${serverlessBuilds.length} Serverless Functions; Hobby allows at most 12`,
  );
});
