import registry from '../registry/agent-registry.js';
import sessionStore from './session-store.js';

export class A2AError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export class A2AResolved extends Error {
  constructor() { super('A2A_EARLY_TERMINATION'); this.code = 'A2A_EARLY_TERMINATION'; }
}

export function validateA2A(a2a, routing, payload, response, options = {}) {
  const currentCaller = a2a.caller;
  const mode = a2a.mode ?? registry.system?.a2a?.default_mode ?? 'single';
  const limits = getA2ALimits();
  const sessionId = options.sessionId ?? a2a.session_id;

  // 1. 자기호출 (공통)
  if (routing.to.includes(currentCaller))
    throw new A2AError('A2A_SELF_CALL');

  // 2. 권한 (공통)
  const agent = registry.getAgent(currentCaller);
  if (!agent)
    throw new A2AError('UNKNOWN_AGENT');
  if (!agent?.a2a?.can_initiate)
    throw new A2AError('A2A_INITIATION_DENIED');
  resolveTargets(currentCaller, routing.to);

  // 3. 교차플랫폼 (공통) — 절대 차단
  if (a2a.parent_platform !== payload.origin_platform)
    throw new A2AError('A2A_CROSS_PLATFORM_DENIED');

  // 4. 스푸핑 방지 (A2A 재진입은 source URL 필수)
  validateSourceOrigin(currentCaller, payload);

  // 4. 조기종료 — 최우선 (resolved > round > speaker)
  if (mode === 'dialogue') {
    const status = response?.a2a_status;
    if (status === 'resolved' || status === 'out') {
      sessionStore.clear(sessionId);
      throw new A2AResolved();
    }
    if (status === undefined) {
      console.warn(`[A2A] ${currentCaller} responded without over/out/resolved signal`);
    }
  }

  // 5. 라운드 한도 (dialogue만)
  if (mode === 'dialogue' && a2a.round > limits.max_rounds)
    throw new A2AError('A2A_ROUND_LIMIT_EXCEEDED');

  // 6. 발화자 한도 — 단일 증가 지점 (SINGLE/DIALOGUE 공통)
  const currentCounts = sessionId
    ? sessionStore.getCounts(sessionId, limits.session_ttl_ms)
    : { ...a2a.speaker_counts };
  const nextCount = (currentCounts[currentCaller] ?? 0) + 1;
  if (nextCount > limits.max_speaker_calls)
    throw new A2AError('A2A_SPEAKER_LIMIT_EXCEEDED');

  if (sessionId) {
    return sessionStore.increment(sessionId, currentCaller, limits.session_ttl_ms);
  }
  return { ...currentCounts, [currentCaller]: nextCount };
}

function resolveTargets(callerId, requested) {
  const caller = registry.getAgent(callerId);
  const allowed = caller.a2a.allowed_targets;
  const resolved = allowed === '*'
    ? registry.getAllIds().filter(id => id !== callerId)
    : allowed;
  const bad = requested.filter(t => !resolved.includes(t));
  if (bad.length) throw new A2AError('A2A_UNAUTHORIZED');
}

function getA2ALimits() {
  const systemA2A = registry.system?.a2a ?? {};
  return {
    max_speaker_calls: positiveInteger(systemA2A.max_speaker_calls, 10),
    max_rounds: positiveInteger(systemA2A.max_rounds, 10),
    session_ttl_ms: positiveInteger(systemA2A.session_ttl_ms, 60 * 60 * 1000)
  };
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function validateSourceOrigin(callerId, payload) {
  const sourceUrl = payload?._source_url;
  if (!sourceUrl) {
    throw new A2AError('A2A_SPOOF_DETECTED');
  }

  const registryUrl = registry.getUrl(callerId);
  try {
    if (new URL(sourceUrl).origin !== new URL(registryUrl).origin) {
      throw new A2AError('A2A_SPOOF_DETECTED');
    }
  } catch (err) {
    if (err instanceof A2AError) throw err;
    throw new A2AError('A2A_SPOOF_DETECTED');
  }
}
