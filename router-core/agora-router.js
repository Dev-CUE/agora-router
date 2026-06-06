import registry from '../registry/agent-registry.js';
import { validateA2A, A2AResolved } from './a2a-guard.js';
import idempotencyStore from './idempotency-store.js';
import { dropToRaw } from './raw-logger.js';
import sessionStore from './session-store.js';

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
    const limits = getRouterA2ALimits();
    const sessionId = resolveSessionId(envelope, a2a);
    a2a = {
      ...a2a,
      mode: a2a.mode ?? registry.system?.a2a?.default_mode ?? 'single',
      session_id: sessionId,
      max_speaker_calls: limits.max_speaker_calls,
      max_rounds: limits.max_rounds
    };

    try {
      const updatedCounts = validateA2A(a2a, routing, payload, null, { sessionId });
      a2a = { ...a2a, speaker_counts: updatedCounts };
    } catch (err) {
      if (err instanceof A2AResolved) {
        sessionStore.clear(sessionId);
        return { ok: true, context_key,
          a2a_termination: { reason: 'resolved' }, results: [] };
      }
      return { ok: false, context_key,
        error: { code: err.code, message: err.message } };
    }
  }

  // 1단계 A2A 디스패치: persona 기록 판단은 settled 이후 _meta에서만 수행
  const toPromises = routing.to.map(id =>
    dispatchToAgent(id, {
      ...envelope,
      a2a,
      memory_scope: {
        space_key: context_key,
        persona_key: a2a?.enabled ? null : id
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

  dropToRaw(envelope);

  if (a2a?.mode === 'dialogue') {
    if (isResolved) {
      sessionStore.clear(a2a.session_id);
      return { ok: true, context_key, a2a_termination: { reason: 'resolved' }, results };
    }
  }

  return { ok: true, context_key, results };
}

function getRouterA2ALimits() {
  const systemA2A = registry.system?.a2a ?? {};
  return {
    max_speaker_calls: positiveInteger(systemA2A.max_speaker_calls, 10),
    max_rounds: positiveInteger(systemA2A.max_rounds, 10)
  };
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveSessionId(envelope, a2a) {
  if (a2a.session_id) return a2a.session_id;

  const platform = envelope.payload?.origin_platform ?? a2a.parent_platform ?? 'unknown';
  return [
    'legacy',
    platform,
    envelope.context_key ?? 'no-context',
    a2a.origin_agent ?? 'unknown-origin'
  ].join(':');
}
