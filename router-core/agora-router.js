import fs from 'node:fs';
import registry from '../registry/agent-registry.js';
import { validateA2A, A2AResolved } from './a2a-guard.js';
import idempotencyStore from './idempotency-store.js';

async function dispatchToAgent(id, envelope) {
  const url = registry.getUrl(id);
  const res = await fetch(`${url}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP_ERROR: ${res.status}`);
  return await res.json();
}

async function logToSpool(envelope, results) {
  const record = JSON.stringify({
    ts: new Date().toISOString(),
    context_key: envelope.context_key,
    platform: envelope.payload?.origin_platform,
    targets: envelope.routing.to,
    results_count: results?.length ?? 0
  }) + '\n';
  await fs.promises.appendFile('data/wiki/raw/spool.jsonl', record);
}

export async function route(envelope) {
  const { context_key, routing, payload } = envelope;

  // ── 멱등성 체크 (최상단, A2A 가드보다 앞) ──
  if (envelope.idempotency_key) {
    const isNew = idempotencyStore.checkAndSet(envelope.idempotency_key);
    if (!isNew) {
      return { ok: true, context_key, status: 202,
               message: 'Duplicate request ignored' };
    }
  }

  let a2a = envelope.a2a;

  // A2A 가드 (a2a.enabled 시에만)
  if (a2a?.enabled) {
    try {
      const updatedCounts = validateA2A(a2a, routing, payload, null);
      a2a = { ...a2a, speaker_counts: updatedCounts };
    } catch (err) {
      if (err instanceof A2AResolved) {
        return { ok: true, context_key,
          a2a_termination: { reason: 'resolved' }, results: [] };
      }
      return { ok: false, context_key,
        error: { code: err.code, message: err.message } };
    }
  }

  // 목적지 검증 (기존 유지)
  for (const id of routing.to) {
    if (!registry.exists(id)) {
      throw new Error(`UNKNOWN_AGENT: ${id}`);
    }
  }

  // DIALOGUE 중간 라운드는 persona_key=null (Mem0 미기록)
  const isDialogueMidRound = a2a?.enabled && a2a?.mode === 'dialogue' && !a2a?.is_resolved;

  const toPromises = routing.to.map(id =>
    dispatchToAgent(id, {
      ...envelope,
      a2a,
      memory_scope: {
        space_key: context_key,
        persona_key: isDialogueMidRound ? null : id
      },
      mode: 'respond'
    })
  );

  (routing.cc ?? []).forEach(id => {
    if (registry.exists(id)) {
      dispatchToAgent(id, {
        ...envelope,
        a2a,
        memory_scope: {
          space_key: context_key,
          persona_key: null
        },
        is_cc_only: true,
        mode: 'listen_only'
      }).catch(() => {});
    }
  });

  const settled = await Promise.allSettled(toPromises);

  const results = settled.map((result, i) => {
    const id = routing.to[i];
    if (result.status === 'fulfilled') {
      return { agent: id, status: 'success', ...result.value };
    }
    return {
      agent: id,
      status: 'error',
      error_message: result.reason?.message ?? 'unknown error'
    };
  });

  logToSpool(envelope, results).catch(() => {});

  if (a2a?.mode === 'dialogue') {
    const isResolved = results.some(r => r.status === 'success' && r.a2a_status === 'resolved');
    if (isResolved) {
      return { ok: true, context_key, a2a_termination: { reason: 'resolved' }, results };
    }
  }

  return { ok: true, context_key, results };
}
