# SKILLS.md — Olympus Router 기술 컨벤션 & 패턴

> 구현 전 반드시 참조. 이 프로젝트에서 허용되는 코드 패턴과 금지되는 안티패턴을 정의한다.
> 자기완결형 — 예시 코드를 그대로 따라 작성하면 설계 원칙을 자동으로 지키게 된다.

---

## 1. 핵심 기술 스택

| 항목 | 선택 | 비고 |
|------|------|------|
| 언어 | Node.js (ESM, `import`/`export`) | CommonJS 금지 |
| 병렬 처리 | `Promise.allSettled` | 절대 `await` 직렬 루프 금지 |
| 테스트 | `node:test` + `node:assert` | 내장, 외부 의존 없음 |
| 설정 | `js-yaml` | agents.yaml 파싱 |
| HTTP | Node 내장 `fetch` | axios 등 불필요 |
| 타임아웃 | `AbortSignal.timeout(ms)` | |

---

## 2. agents.yaml 로딩 패턴 (정답 코드)

```javascript
// registry/agent-registry.js
import yaml from 'js-yaml';
import fs from 'fs';

class AgentRegistry {
  constructor() {
    this.agents = new Map();   // id -> agent config
    this.system = {};
  }

  load(configPath = './config/agents.yaml') {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8'));
    this.system = raw.system;
    // 에이전트 이름을 모른 채 순수 반복만 (Zero Hardcoding)
    for (const agent of raw.agents) {
      this.agents.set(agent.id, agent);
    }
  }

  exists(id)      { return this.agents.has(id); }
  getUrl(id)      { return this.agents.get(id)?.url; }
  getAllIds()     { return [...this.agents.keys()]; }
  getAgent(id)    { return this.agents.get(id); }
}

export default new AgentRegistry();  // 싱글턴
```

> 포인트: `zeus`/`hera` 문자열이 코드에 단 한 번도 등장하지 않는다.

---

## 3. 병렬 디스패치 패턴 (정답 코드)

```javascript
// ✅ 정답 — Promise.allSettled 병렬
const toPromises = routing.to.map(id => dispatchToAgent(id, envelope));
const results = await Promise.allSettled(toPromises);

// ❌ 금지 — 직렬 루프 (장애 격리 불가, 블로킹)
for (const id of routing.to) {
  await dispatchToAgent(id, envelope);   // 절대 금지
}
```

cc는 Fire-and-forget:
```javascript
// cc는 응답을 기다리지 않는다
routing.cc?.forEach(id => {
  if (registry.exists(id)) {
    dispatchToAgent(id, { ...envelope, is_cc_only: true, mode: "listen_only" })
      .catch(() => {});   // 실패 무시
  }
});
```

---

## 4. context_key 생성 패턴 (어댑터 책임)

플랫폼별로 어댑터가 생성. topic/thread 없으면 `root`.

```javascript
// Telegram
function telegramContextKey(msg) {
  if (msg.chat.type === 'private')
    return `telegram:dm:${msg.chat.id}:root`;
  if (msg.chat.is_forum && msg.message_thread_id) {
    const topic = msg.message_thread_id === 1 ? 'root' : msg.message_thread_id;
    return `telegram:forum:${msg.chat.id}:${topic}`;
  }
  return `telegram:group:${msg.chat.id}:root`;
}

// Slack
function slackContextKey(event) {
  const thread = event.thread_ts ?? 'root';
  const type = event.channel_type === 'im' ? 'dm' : 'channel';
  return `slack:${type}:${event.channel}:${thread}`;
}

// Discord
function discordContextKey(msg) {
  if (msg.channel.isThread())
    return `discord:forum:${msg.channel.parentId}:${msg.channel.id}`;
  return `discord:channel:${msg.channel.id}:root`;
}
```

> 규격: `{platform}:{space_type}:{space_id}:{topic_or_thread_id}`

---

## 5. memory_scope 주입 패턴 (라우터 책임)

```javascript
// to 에이전트: 인격 + 공간 둘 다
const scope = {
  space_key: context_key,
  persona_key: id          // ★ 플랫폼 prefix 없음. agent_id 그대로
};

// cc 에이전트: 공간만, 인격 미기록
const ccScope = {
  space_key: context_key,
  persona_key: null        // null = Mem0 기록 안 함
};
```

> ❌ `persona_key: \`${platform}:${id}\`` — 절대 금지 (플랫폼 격리 아님)
> ✅ `persona_key: id` — 플랫폼 초월 공유

---

## 6. A2A 엔벨롭 구조

### SINGLE (기본값, 1문1답)
```javascript
a2a: {
  enabled: true,
  mode: "single",
  origin_agent: "<개시자>",
  caller: "<현재 호출자>",
  speaker_counts: { /* id: 횟수 */ },
  max_speaker_calls: 10,
  parent_platform: "<플랫폼>"
}
```

### DIALOGUE (티키타카)
```javascript
a2a: {
  enabled: true,
  mode: "dialogue",
  origin_agent: "<개시자>",
  caller: "<현재 호출자>",
  speaker_counts: { /* id: 횟수 */ },
  max_speaker_calls: 10,
  round: 1,
  max_rounds: 10,
  last_caller: "<직전 호출자>",
  status: "continue",       // 또는 "resolved"
  parent_platform: "<플랫폼>"
}
```

---

## 7. A2A 가드 패턴 (정답 코드)

검증 순서를 반드시 지킨다.

```javascript
// router-core/a2a-guard.js
function validateA2A(a2a, routing, currentCaller, payload, response) {
  const agent = registry.getAgent(currentCaller);

  // 1. 권한
  if (!agent?.a2a?.can_initiate)
    throw new A2AError("A2A_INITIATION_DENIED");
  resolveTargets(currentCaller, routing.to);   // allowed_targets 검증

  // 2. 자기호출
  if (routing.to.includes(currentCaller))
    throw new A2AError("A2A_SELF_CALL");

  // 3. 교차플랫폼 (절대 차단)
  if (a2a.parent_platform !== payload.origin_platform)
    throw new A2AError("A2A_CROSS_PLATFORM_DENIED");

  // 4. 조기종료 — 최우선 (resolved > round > speaker)
  //    합의가 끝났으면 발화자/라운드 한도와 무관하게 정상 종료시킨다.
  if (a2a.mode === "dialogue" && response?.a2a_status === "resolved")
    throw new A2AResolved("A2A_EARLY_TERMINATION");   // 정상 종료

  // 5. 라운드 한도 (DIALOGUE 전용)
  if (a2a.mode === "dialogue" && a2a.round > a2a.max_rounds)
    throw new A2AError("A2A_ROUND_LIMIT_EXCEEDED");

  // 6. 발화자 한도 증가 + 검증 (단일 증가 지점) — 최후
  const counts = { ...a2a.speaker_counts,
    [currentCaller]: (a2a.speaker_counts[currentCaller] ?? 0) + 1 };
  if (counts[currentCaller] > a2a.max_speaker_calls)
    throw new A2AError("A2A_SPEAKER_LIMIT_EXCEEDED");

  return counts;
}
```

> 종료 우선순위: **resolved > 라운드 > 발화자**. resolved를 가장 먼저 체크하여, 합의가 끝났는데 한도 에러가 나는 것을 방지한다(T5.6).

---

## 8. allowed_targets 해석 패턴

```javascript
function resolveTargets(callerId, requested) {
  const caller = registry.getAgent(callerId);
  const allowed = caller.a2a.allowed_targets;

  // "*" = 자기 제외 전체
  const resolved = allowed === "*"
    ? registry.getAllIds().filter(id => id !== callerId)
    : allowed;

  const bad = requested.filter(t => !resolved.includes(t));
  if (bad.length) throw new A2AError("A2A_UNAUTHORIZED");
}
```

---

## 9. 에러 코드 목록 (고정)

| 코드 | 의미 |
|------|------|
| `UNKNOWN_AGENT` | routing 대상이 registry에 없음 |
| `A2A_INITIATION_DENIED` | can_initiate:false 에이전트가 A2A 시도 |
| `A2A_UNAUTHORIZED` | allowed_targets 위반 |
| `A2A_SELF_CALL` | 자기 자신 호출 |
| `A2A_CROSS_PLATFORM_DENIED` | 플랫폼 간 A2A |
| `A2A_SPEAKER_LIMIT_EXCEEDED` | 발화자 10회 초과 |
| `A2A_ROUND_LIMIT_EXCEEDED` | DIALOGUE 10라운드 초과 |
| `A2A_EARLY_TERMINATION` | resolved 정상 조기종료 (에러 아님, 종료 신호) |

에러 응답 포맷:
```json
{ "ok": false, "context_key": "...", "error": { "code": "...", "message": "...", "meta": {} } }
```

---

## 10. Raw 드롭 패턴 (옵션)

```javascript
// router-core/raw-logger.js
async function dropToRaw(envelope) {
  if (!registry.system.wiki?.raw_logging_enabled) return;  // 옵션 OFF면 skip
  const record = {
    timestamp: new Date().toISOString(),
    targets: envelope.routing.to,
    meta: { platform: envelope.payload.origin_platform, space_key: envelope.context_key },
    text: envelope.payload.text
  };
  // 플랫폼 무관 단일 폴더. 비동기, 코어 블로킹 금지
  fs.promises.appendFile(
    `${registry.system.wiki.raw_path}${Date.now()}_${envelope.idempotency_key}.jsonl`,
    JSON.stringify(record) + '\n'
  ).catch(() => {});   // 실패해도 코어 영향 0
}
```

---

## 11. 금지 안티패턴 모음

```javascript
// ❌ 하드코딩
if (id === "zeus") { ... }
const AGENTS = ["zeus", "hera", "athena"];

// ❌ 직렬 처리
for (const id of to) { await call(id); }

// ❌ 라우터에서 텍스트 파싱
if (text.includes("@zeus")) { ... }   // 어댑터 책임이다

// ❌ persona_key 플랫폼 격리
persona_key: `${platform}:${id}`

// ❌ 라우터에서 외부 인프라 직접 호출
await mem0.write(...);     // 라우터 금지
await obsidian.save(...);  // 라우터 금지

// ❌ Raw 드롭이 코어 블로킹
await fs.appendFile(...);  // await로 코어 멈추면 안 됨
```

---

## 12. 테스트 작성 패턴 (node:test)

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import registry from '../registry/agent-registry.js';

test('T1.1 — yaml 3기 로드', () => {
  registry.load('./harness/fixtures/agents.test.yaml');
  assert.strictEqual(registry.getAllIds().length, 3);
});

test('T1.3 — 미존재 에이전트 거부', async () => {
  await assert.rejects(
    () => route({ routing: { to: ['ghost'], cc: [] } }),
    /UNKNOWN_AGENT/
  );
});
```

실행: `node --test harness/tests/`
