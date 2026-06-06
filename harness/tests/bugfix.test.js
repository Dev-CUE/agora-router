import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/agora-router.js';
import idempotencyStore from '../../router-core/idempotency-store.js';

function makeDialogueEnvelope(overrides = {}) {
  return {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['hera'], cc: [] },
    payload: { origin_platform: 'telegram' },
    a2a: {
      enabled: true,
      mode: 'dialogue',
      caller: 'zeus',
      parent_platform: 'telegram',
      max_speaker_calls: 10,
      max_rounds: 10,
      round: 3,
      speaker_counts: {},
      ...overrides.a2a
    },
    ...overrides
  };
}

beforeEach(() => {
  registry.agents.clear();
  registry.agents.set('zeus',   { id: 'zeus',   url: 'http://zeus-agent:3001',   a2a: { can_initiate: true, allowed_targets: '*' } });
  registry.agents.set('hera',   { id: 'hera',   url: 'http://hera-agent:3002',   a2a: { can_initiate: true, allowed_targets: '*' } });
  registry.agents.set('athena', { id: 'athena', url: 'http://athena-agent:3003', a2a: { can_initiate: true, allowed_targets: '*' } });
  idempotencyStore.clear();
});

// ── BF.1: DIALOGUE resolved 조기종료 ──────────────────────────────────────────

test('BF.1 — DIALOGUE: agent가 a2a_status=resolved 응답 시 a2a_termination 리턴', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, a2a_status: 'resolved' })
  });

  const result = await route(makeDialogueEnvelope({
    payload: { origin_platform: 'telegram', _source_url: registry.getUrl('zeus') }
  }));

  assert.ok(result.ok);
  assert.deepStrictEqual(result.a2a_termination, { reason: 'resolved' });
  assert.ok(Array.isArray(result.results), 'results 포함 확인');
});

test('BF.2 — DIALOGUE: a2a_status=resolved 없으면 a2a_termination 미포함', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true })
  });

  const result = await route(makeDialogueEnvelope({
    payload: { origin_platform: 'telegram', _source_url: registry.getUrl('zeus') }
  }));

  assert.ok(result.ok);
  assert.strictEqual(result.a2a_termination, undefined);
  assert.ok(Array.isArray(result.results));
});

test('BF.3 — SINGLE 모드는 resolved 체크 미적용', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, a2a_status: 'resolved' })
  });

  const result = await route(makeDialogueEnvelope({ a2a: { mode: 'single' } }));

  assert.ok(result.ok);
  assert.strictEqual(result.a2a_termination, undefined);
});

// ── BF.4~6: idempotency O(1) ──────────────────────────────────────────────────

test('BF.4 — idempotencyStore: 신규 키 → true', () => {
  assert.strictEqual(idempotencyStore.checkAndSet('bf4-new-key'), true);
});

test('BF.5 — idempotencyStore: 동일 키 두 번 → 두 번째 false', () => {
  assert.strictEqual(idempotencyStore.checkAndSet('bf5-dup-key'), true);
  assert.strictEqual(idempotencyStore.checkAndSet('bf5-dup-key'), false);
});

test('BF.6 — idempotencyStore: TTL 만료 키 → true (신규 취급)', () => {
  // store에 직접 만료된 타임스탬프 삽입
  idempotencyStore.store.set('bf6-expire-key', Date.now() - (idempotencyStore.ttlMs + 1000));
  assert.strictEqual(idempotencyStore.checkAndSet('bf6-expire-key'), true);
});

// ── BF.7: agents.yaml athena can_initiate 수정 확인 ──────────────────────────

test('BF.7 — agents.yaml: athena can_initiate=true, allowed_targets 비어있지 않음', () => {
  registry.load('./config/agents.yaml');
  const athena = registry.getAgent('athena');
  assert.strictEqual(athena.a2a.can_initiate, true);
  assert.notDeepStrictEqual(athena.a2a.allowed_targets, []);
});
