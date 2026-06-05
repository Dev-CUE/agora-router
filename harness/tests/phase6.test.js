import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../../registry/agent-registry.js';
import idempotencyStore from '../../router-core/idempotency-store.js';
import { route } from '../../router-core/agora-router.js';

let captured = [];

beforeEach(() => {
  captured = [];
  idempotencyStore.clear();

  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: 'http://localhost:9601' });
  registry.agents.set('agentB', { id: 'agentB', url: 'http://localhost:9602' });

  global.fetch = async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  // appendFile 기본 mock — 파일 I/O 없이 no-op
  fs.promises.appendFile = async () => {};
});

// T6.1
test('T6.1 — 동일 idempotency_key 재전송 → 202 Accepted, dispatchToAgent 미호출', async () => {
  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram', text: 'hello' },
    idempotency_key: 'telegram:G1:root:msg_001'
  };

  // 첫 번째 호출 — 처리 진행
  const first = await route(envelope);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(captured.length, 1, '첫 번째 호출에서 agentA 디스패치됨');

  captured = [];

  // 두 번째 호출 — 동일 key → 202 드롭
  const second = await route(envelope);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.status, 202);
  assert.strictEqual(second.message, 'Duplicate request ignored');
  assert.strictEqual(captured.length, 0, '중복 호출에서 dispatchToAgent 미호출');
});

// T6.2
test('T6.2 — Wiki 스풀 appendFile 실패 → 메인 라우팅 정상 완료 (ok:true)', async () => {
  // appendFile을 강제 실패
  fs.promises.appendFile = async () => { throw new Error('DISK_FULL'); };

  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram', text: 'hello' },
    idempotency_key: 'telegram:G1:root:msg_002'
  };

  const result = await route(envelope);

  // 스풀 실패에도 메인 라우팅은 정상
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results[0].agent, 'agentA');
  assert.strictEqual(result.results[0].status, 'success');
});

// T6.3
test('T6.3 — 1000건 동시 인입 → 코어 블로킹 없음, 모두 완료', async () => {
  const envelopes = Array.from({ length: 1000 }, (_, i) => ({
    context_key: `telegram:group:G1:root`,
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram', text: `msg ${i}` },
    idempotency_key: `telegram:G1:root:msg_${i}`
  }));

  const results = await Promise.all(envelopes.map(e => route(e)));

  assert.strictEqual(results.length, 1000, '1000건 모두 완료');
  assert.ok(results.every(r => r.ok === true), '모든 결과 ok:true');
});
