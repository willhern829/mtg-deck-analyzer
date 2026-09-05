import assert from 'node:assert/strict';
import test from 'node:test';
import { TtlCache } from '../src/lib/cache.js';
import { getCommanderCardPool, getCommanderResearch } from '../src/clients/edhrec.js';

test('concurrent cache misses share one load; failures can retry', async () => {
  const cache = new TtlCache<string>(10000);
  let calls = 0;
  const fail = async () => { calls++; throw new Error('offline'); };
  const failed = await Promise.allSettled([
    cache.getOrLoad('key', fail), cache.getOrLoad('key', fail),
  ]);
  assert.equal(calls, 1);
  assert.ok(failed.every((r) => r.status === 'rejected'));
  assert.equal(await cache.getOrLoad('key', async () => 'recovered'), 'recovered');
});

test('EDHREC recovers after an uncached failure and shares research/pool requests', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify({ container: { json_dict: {
        cardlists: [{ cardviews: [{ name: 'Sol Ring' }] }],
      } } }), { status: 200 });
  };
  try {
    assert.equal(await getCommanderResearch(['Cache Recovery Fixture']), null);
    const [research, pool] = await Promise.all([
      getCommanderResearch(['Cache Recovery Fixture']),
      getCommanderCardPool(['Cache Recovery Fixture']),
    ]);
    assert.ok(research);
    assert.ok(pool.has('sol ring'));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
