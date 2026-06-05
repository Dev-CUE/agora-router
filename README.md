# Olympus Router

복수의 AI 에이전트를 Telegram / Slack / Discord 등 여러 플랫폼에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**.

라우터는 메시지를 격리하고, 에이전트 인격은 플랫폼 초월 공유하며, 에이전트 간 협업(A2A)을 안전하게 중개한다.

---

## 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Dumb Pipe** | 라우터 코어는 텍스트를 파싱하지 않는다. JSON 엔벨롭의 목적지(to/cc) 검증과 병렬 패스스루만 수행 |
| **Zero Hardcoding** | 코드 어디에도 에이전트 이름을 직접 쓰지 않는다. 모든 에이전트 정보는 `config/agents.yaml` |
| **3축 격리** | MESSAGE(방마다 격리) / PERSONA(플랫폼 초월 공유) / KNOWLEDGE(조직 공용) |
| **Stage-Gated** | Phase를 순서대로만 구현. Exit Criteria 100% 통과 후 다음 Phase 진행 |

---

## 3축 격리 모델

| 축 | 키 | 격리/공유 |
|----|----|-----------|
| MESSAGE | `context_key` | 방마다 완전 격리 |
| PERSONA | `{agent_id}` | 플랫폼 초월 공유 (Mem0) |
| KNOWLEDGE | Obsidian | 플랫폼 초월 공용 |

> `persona_key: "telegram:zeus"` ❌ — 플랫폼 prefix 금지  
> `persona_key: "zeus"` ✅

---

## 디렉터리 구조

```
olympus-router/
├── config/
│   └── agents.yaml           # 에이전트 레지스트리 (유일한 에이전트 정의 위치)
├── router-core/
│   ├── olympus-router.js     # 라우터 코어 — 병렬 디스패치, A2A 가드 호출
│   ├── a2a-guard.js          # A2A 검증 — 권한/라운드/발화 한도/스푸핑 방지
│   ├── idempotency-store.js  # 멱등성 처리 (중복 요청 202 드롭)
│   └── raw-logger.js         # Raw 드롭 — fire-and-forget JSONL 기록
├── registry/
│   └── agent-registry.js     # YAML 기반 에이전트 레지스트리
├── adapters/
│   ├── telegram-adapter.js
│   ├── slack-adapter.js
│   └── discord-adapter.js
└── harness/
    ├── fixtures/             # 테스트용 YAML 설정
    └── tests/                # Phase 1~7 단위 테스트 + E2E 통합 테스트
```

---

## 기술 스택

- **언어**: Node.js (ESM)
- **병렬**: `Promise.allSettled`
- **테스트**: `node:test` + `node:assert`
- **설정**: YAML (`config/agents.yaml`)
- **HTTP**: Node 내장 `fetch`

---

## 에이전트 등록

`config/agents.yaml` 에 에이전트를 추가하면 코드 수정 없이 즉시 라우팅된다.

```yaml
agents:
  - id: "myAgent"
    url: "http://my-agent-host:3001"
    a2a:
      can_initiate: true
      allowed_targets: "*"
```

---

## 메시지 엔벨롭

```json
{
  "context_key": "telegram:group:G1:root",
  "routing": {
    "to": ["agentA", "agentB"],
    "cc": ["agentC"]
  },
  "payload": {
    "origin_platform": "telegram",
    "text": "메시지 내용"
  },
  "idempotency_key": "telegram:G1:root:msg_001"
}
```

- `to`: 응답 대상 에이전트 (병렬 호출)
- `cc`: 청취 전용 에이전트 (fire-and-forget)
- `idempotency_key`: 중복 요청 방지 (재전송 시 202 반환)

---

## A2A (Agent-to-Agent) 협업

에이전트 간 협업 모드를 지원한다.

```json
{
  "a2a": {
    "enabled": true,
    "mode": "single",
    "caller": "agentA",
    "parent_platform": "telegram",
    "max_speaker_calls": 10,
    "max_rounds": 10,
    "round": 1,
    "speaker_counts": {}
  }
}
```

| 모드 | 설명 |
|------|------|
| `single` | 1문 1답. caller가 target에게 질의 후 즉시 종료 |
| `dialogue` | 다자 순환 대화. `resolved` 신호 또는 라운드 한도 도달 시 종료 |

---

## 테스트 실행

```bash
# E2E 통합 테스트
node --test harness/tests/e2e.test.js

# 전체 테스트 (Phase 1~7 + E2E)
node --test harness/tests/phase1.test.js harness/tests/phase2.test.js \
  harness/tests/phase3.test.js harness/tests/phase4.test.js \
  harness/tests/phase5.test.js harness/tests/phase6.test.js \
  harness/tests/phase7.test.js harness/tests/e2e.test.js

# 하드코딩 검사
grep -rE '\b(agent_name_here)\b' router-core/ adapters/ registry/
```
