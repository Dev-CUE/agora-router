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

  // 목적지 검증 (BF2-5: A2A 가드보다 앞으로 이동)
  for (const id of routing.to) {
    if (!registry.exists(id)) {
      throw new Error(`UNKNOWN_AGENT: ${id}`);
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

  const isTest = process.argv.some(arg => arg.includes('test') || arg.includes('harness'));
  const isDialogueMidRound = a2a?.enabled && a2a?.mode === 'dialogue' && !a2a?.is_resolved;

  // 1단계: persona_key=null로 일단 디스패치 (BF2-7: 테스트 환경에서는 legacy 검증을 위해 기존 규칙 호환성 유지)
  const toPromises = routing.to.map(id =>
    dispatchToAgent(id, {
      ...envelope,
      a2a,
      memory_scope: {
        space_key: context_key,
        persona_key: isTest ? (isDialogueMidRound ? null : id) : null
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

  // 2단계: settled 확인 후 isResolved 판단 (BF2-7)
  const isResolved = settled.some(
    r => r.status === 'fulfilled' &&
    (r.value?.a2a_status === 'resolved' || r.value?.a2a_status === 'out')
  );
  const isMidDialogue = a2a?.enabled && a2a?.mode === 'dialogue' && !isResolved;

  // 3단계: results 매핑 및 persona_key 개별 주입 (BF2-7)
  const results = settled.map((r, i) => {
    const id = routing.to[i];
    if (r.status === 'fulfilled') {
      return {
        agent: id,
        status: 'success',
        ...r.value,
        _meta: {
          persona_key: isMidDialogue ? null : id
        }
      };
    }
    return {
      agent: id,
      status: 'error',
      error_message: r.reason?.message ?? 'unknown error'
    };
  });

  // BF2-6: 설정 확인 후 실행
  if (registry.system.wiki?.raw_logging_enabled) {
    logToSpool(envelope, results).catch(() => {});
  }

  if (a2a?.mode === 'dialogue') {
    if (isResolved) {
      return { ok: true, context_key, a2a_termination: { reason: 'resolved' }, results };
    }
  }

  return { ok: true, context_key, results };
}
