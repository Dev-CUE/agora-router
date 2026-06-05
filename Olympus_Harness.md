# Olympus_Harness.md — 테스트 하네스 명세

> 코딩 에이전트가 **스스로 구현을 검증**하기 위한 테스트 골격. PRD의 Exit Criteria(T1.1~T7.4)를 node:test로 실행 가능한 형태로 매핑한다.
> 에이전트는 각 Phase 구현 후 해당 테스트를 직접 실행하고 통과율을 보고해야 한다.

---

## 0. 하네스 사용 지침 (에이전트용)

1. 각 Phase 구현 직후, 해당 Phase 테스트를 `node --test harness/tests/phaseN.test.js`로 실행한다.
2. 100% 통과하지 못하면 "Phase 완료"를 선언하지 않는다.
3. 실패 시: 원인을 기술하고 재수정 → 재실행. PRD와 모순이면 코드를 고치지 말고 보고.
4. mock은 실제 에이전트 없이도 라우터/어댑터를 검증하기 위한 가짜 컴포넌트다.

---

## 1. 하네스 목표 & 비범위

**목표**: PRD의 모든 Exit Criteria를 재현 가능하게 자동 검증.
**비범위**: 실제 LLM 추론, 실제 Mem0/Obsidian/Gemini 연동(이들은 mock 또는 호출 여부만 검증).

---

## 2. 디렉터리 구조

```
harness/
├── tests/
│   ├── phase1.test.js   # T1.x
│   ├── phase2.test.js   # T2.x
│   ├── phase3.test.js   # T3.x
│   ├── phase4.test.js   # T4.x
│   ├── phase5.test.js   # T5.x
│   ├── phase6.test.js   # T6.x
│   ├── phase7.test.js   # T7.x
│   └── e2e.test.js      # E1~E8
├── mocks/
│   ├── mock-agent.js    # 설정 가능한 가짜 에이전트
│   └── mock-adapter.js  # 엔벨롭 주입기
└── fixtures/
    ├── agents.test.yaml # 테스트용 에이전트 정의
    └── envelopes/       # 시나리오별 입력 JSON
```

---

## 3. Mock 컴포넌트 명세

### 3.1 mock-agent — 행동 설정형 (Zero Hardcoding 준수)

에이전트 이름이 아니라 **behavior**로 정의한다. 어떤 id를 줘도 동작한다.

```javascript
// harness/mocks/mock-agent.js
export function createMockAgent(behavior = {}) {
  const {
    delayMs = 0,            // 응답 지연 (타임아웃 테스트용)
    fail = false,           // 강제 실패 (장애 격리 테스트용)
    a2aInitiate = null,     // { to, mode } — A2A 개시 시뮬레이션
    resolveAtRound = null,  // 이 라운드에서 resolved 반환
    response = "ok"
  } = behavior;

  return async function handleInvoke(envelope) {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    if (fail) throw new Error("mock failure");

    const round = envelope.a2a?.round ?? 0;
    const a2a_status =
      (resolveAtRound && round >= resolveAtRound) ? "resolved" : "continue";

    return {
      status: "success",
      response_text: response,
      a2a_status,
      activities: [{ tool: "mock", detail: "executed" }]
    };
  };
}
```

### 3.2 mock-adapter — 엔벨롭 주입기

```javascript
// harness/mocks/mock-adapter.js
export function buildEnvelope(overrides = {}) {
  return {
    context_key: "telegram:group:CTEST:root",
    routing: { to: ["agentA"], cc: [] },
    memory_scope: { space_key: "telegram:group:CTEST:root", persona_key: "agentA" },
    payload: { origin_platform: "telegram", text: "test" },
    a2a: { enabled: false },
    idempotency_key: `telegram:CTEST:root:msg_${Date.now()}`,
    ...overrides
  };
}
```

### 3.3 fixtures/agents.test.yaml

```yaml
system:
  a2a:
    max_speaker_calls: 10
    max_rounds: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
  wiki:
    raw_logging_enabled: true
    raw_path: "harness/tmp/raw/"

agents:
  - id: "agentA"
    url: "http://localhost:9101"
    a2a: { can_initiate: true,  allowed_targets: "*" }
  - id: "agentB"
    url: "http://localhost:9102"
    a2a: { can_initiate: true,  allowed_targets: "*" }
  - id: "agentC"
    url: "http://localhost:9103"
    a2a: { can_initiate: false, allowed_targets: [] }
```

> 테스트도 Zero Hardcoding을 지킨다. 코드가 아닌 yaml에서 agentA/B/C를 정의한다.

---

## 4. Phase별 테스트 매핑

### Phase 1 (phase1.test.js)
| 테스트 | 검증 내용 | 어서션 |
|--------|-----------|--------|
| T1.1 | yaml 3기 로드 | `getAllIds().length === 3` |
| T1.2 | 4번째 추가 시 코드 무수정 4개 | yaml만 바꿔 4 확인 |
| T1.3 | 미존재 to 거부 | `rejects /UNKNOWN_AGENT/` |
| T1.4 | 하드코딩 0건 | `grep` 결과 0 (셸 보조) |
| T1.5 | 유효 to 패스스루 | mock URL 호출 확인 |

### Phase 2 (phase2.test.js)
| 테스트 | 검증 |
|--------|------|
| T2.1 | `to:[A,B,C]` 병렬 → 총시간 ≈ max(개별) |
| T2.2 | A delayMs=무한/fail → B,C success |
| T2.3 | cc 응답 대기 없이 즉시 반환 |
| T2.4 | cc fail → 메인 영향 0 |
| T2.5 | 실패 status:error, 성공 status:success 매핑 |

### Phase 3 (phase3.test.js)
| 테스트 | 검증 |
|--------|------|
| T3.1 | DM → space_type=dm, to=봇1기 |
| T3.2 | 그룹 @멘션 → to/cc 분리 |
| T3.3 | 멘션 없음 → to:[], 전원 cc |
| T3.4 | 포럼 토픽1↔2 context_key 격리 |
| T3.5 | General Topic(1) → root |
| T3.6 | slack thread_ts / discord thread_id 추출 |
| T3.7 | persona_key === agent_id (플랫폼 prefix 없음) |
| T3.8 | activities → 이모지 렌더 |
| T3.9 | 어댑터 하드코딩 0건 |

### Phase 4 (phase4.test.js)
| 테스트 | 검증 |
|--------|------|
| T4.1 | 그룹A↔B raw 로그 미노출 (space_key 다름) |
| T4.2 | persona_key 동일 → 기억 공유 확인 |
| T4.3 | space_key 다름 → 로그 격리 확인 |
| T4.4 | persona_key 형식 = agent_id |
| T4.5 | cc → persona_key:null |

### Phase 5 (phase5.test.js) — 가장 중요
| 테스트 | 검증 |
|--------|------|
| T5.1 | SINGLE → 즉시 종료, speaker_counts 1 |
| T5.2 | SINGLE 연쇄 11회 → SPEAKER_LIMIT |
| T5.3 | 3기 DIALOGUE 각자 10회 → 10라운드 도달 |
| T5.4 | 11라운드 → ROUND_LIMIT |
| T5.5 | resolveAtRound=3 → 조기종료 |
| T5.6 | resolved가 라운드·발화보다 먼저 체크 |
| T5.7 | can_initiate:false(agentC) → INITIATION_DENIED |
| T5.8 | allowed_targets 위반 → UNAUTHORIZED |
| T5.9 | 자기호출 → SELF_CALL |
| T5.10 | telegram→slack → CROSS_PLATFORM_DENIED |
| T5.11 | cc A2A 개시 → 차단 |
| T5.12 | 위조 caller → 스푸핑 실패 |
| T5.13 | 중간 라운드 → SPACE만, Mem0 미기록 |
| T5.14 | resolved → 최종만 Mem0 기록 |
| T5.15 | cc 매 라운드 청취, 게시·기록 없음 |
| T5.16 | 모드 미지정 → single 기본값 |

### Phase 6 (phase6.test.js)
| 테스트 | 검증 |
|--------|------|
| T6.1 | 동일 idempotency_key 재전송 → 202 무시 |
| T6.2 | Wiki 워커 다운 → 라우팅 정상 |
| T6.3 | 1000건 동시 → 블로킹 없음 |

### Phase 7 (phase7.test.js)
| 테스트 | 검증 |
|--------|------|
| T7.1 | raw_logging_enabled=true → 파일 생성 |
| T7.2 | =false → 파일 미생성 |
| T7.3 | Raw 드롭 코어 지연 0 |
| T7.4 | (mock) Gemini 분류 → Obsidian 병합 호출 |

---

## 5. A2A 핵심 테스트 상세 예시 (T5.3 — 3기 발화자 한도)

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('T5.3 — 3기 DIALOGUE 각자 10회 발화 보장', async () => {
  // agentA, B, C가 순환하며 티키타카
  // 각 에이전트 발화 카운트가 독립적으로 10까지 허용되는지 확인
  let counts = { agentA: 0, agentB: 0, agentC: 0 };
  const speakers = ['agentA', 'agentB', 'agentC'];

  for (let i = 0; i < 30; i++) {           // 30회 = 각자 10회
    const caller = speakers[i % 3];
    counts[caller]++;
    assert.ok(counts[caller] <= 10,
      `${caller} 발화 ${counts[caller]}회 — 10 이내여야 함`);
  }
  // 각자 정확히 10회까지 도달, 차단 없이 라운드 보장
  assert.deepStrictEqual(counts, { agentA: 10, agentB: 10, agentC: 10 });
});

test('T5.6 — resolved 우선순위', async () => {
  // round=10, speaker=10 동시 도달해도 resolved면 정상 종료
  const a2a = { mode: "dialogue", round: 10, max_rounds: 10,
                speaker_counts: { agentA: 10 }, max_speaker_calls: 10 };
  const response = { a2a_status: "resolved" };
  // resolved가 먼저 체크되어 ROUND_LIMIT 에러가 아닌 정상 종료여야 함
  assert.throws(() => validateA2A(a2a, response), /A2A_EARLY_TERMINATION/);
});
```

---

## 6. 실행 명령 & 리포트

```bash
# Phase별 실행
node --test harness/tests/phase1.test.js

# 전체 실행
node --test harness/tests/

# 하드코딩 검사 (T1.4, T3.9 보조)
grep -rE '\b(zeus|hera|athena)\b' router-core/ adapters/ registry/ # config/ 제외 (yaml id는 정상)
  && echo "FAIL" || echo "PASS"
```

리포트 형식:
```
[Phase N 테스트 리포트]
T_N.1 ✅  T_N.2 ✅  T_N.3 ❌ (원인: ...)
통과율: 12/14
다음 조치: T_N.3, T_N.5 재수정
```

---

## 7. 결함 기록 템플릿 (다듬기 루프)

```
[결함 #001]
테스트: T5.10
증상: telegram→slack A2A가 차단되지 않음
원인: a2a-guard.js에서 parent_platform 비교 누락
조치: 검증 3번 항목 추가
PRD 반영: 불필요 (구현 누락이었음)
```

> PRD 자체가 틀린 경우에만 PRD를 먼저 수정. 구현 실수면 코드만 수정.

---

## 8. 변경 이력

| 버전 | 내용 |
|------|------|
| v1.0 | PRD v6.3 기준 Phase 1~7 + E2E 테스트 매핑 초안 |
