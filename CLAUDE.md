# CLAUDE.md — Agora Router 프로젝트 헌법

> 이 파일은 코딩 에이전트가 작업을 시작하기 전 **반드시 먼저 읽어야 하는** 프로젝트 최상위 규칙이다.
> 자기완결형 — 이 파일만으로 핵심 규칙을 파악할 수 있다.

---

## ⛔ 0. 문서 보호 규칙 (최최우선 — 다른 모든 규칙보다 앞선다)

### AGENT.md는 읽기 전용이다

```
AGENT.md를 수정하는 것은 어떤 이유로도, 어떤 상황에서도 절대 금지된다.
"더 나은 구현을 위해", "Phase 진행을 위해", "브리핑 내용 반영을 위해" 등
어떤 명분도 AGENT.md 수정을 정당화할 수 없다.
```

**발견 즉시 행동 지침**:
- 작업 중 AGENT.md를 수정하고 싶은 충동이 생기면 → 즉시 멈추고 보고
- AGENT.md가 수정된 흔적을 발견하면 → 작업 전부 중단, 원본 복원 요청 보고
- 수정된 AGENT.md를 근거로 작업을 정당화하는 것 → 엄격히 금지

### 문서 수정 권한

| 파일 | 수정 권한 |
|------|-----------|
| AGENT.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| CLAUDE.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| SKILLS.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| Agora_PRD_Plan.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| Agora_Harness.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| config/agents.yaml | AGENT.md에 명시된 Phase에서만 수정 가능 |
| 소스 코드 | AGENT.md 화이트리스트에 명시된 파일만 수정 가능 |

### 자기 승인 금지

```
에이전트가 문서를 수정한 뒤 그 문서를 근거로 작업을 정당화하는 행위는
"자기 승인(Self-Authorization)"으로 간주하며 가장 심각한 원칙 위반이다.
이런 패턴이 감지되면 즉시 모든 작업을 중단하고 사장님에게 보고해야 한다.
```

---

## 1. 한 줄 요약

복수의 AI 에이전트를 Telegram/Slack/Discord 등 여러 플랫폼에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**. 라우터는 메시지를 격리하고, 에이전트 인격은 플랫폼 초월 공유하며, 에이전트 간 협업(A2A)을 안전하게 중개한다.

---

## 2. 불변 원칙 6조 (위반 = 작업 거부)

### 원칙 1: Dumb Pipe
라우터 코어는 텍스트를 파싱하지 않는다. 비즈니스 로직·LLM 호출·문자열 의도 분석을 일절 포함하지 않는다. 오직 JSON 엔벨롭의 목적지(to/cc) 검증과 병렬 패스스루만 수행한다.

### 원칙 2: Zero Hardcoding
코드 어디에도 `zeus`, `hera`, `athena` 같은 에이전트 이름을 직접 쓰지 않는다.
- 금지: `if (agent === "zeus")`, `const ZEUS_URL = ...`, `registry["athena"]`
- 허용: `registry.exists(id)`, `registry.getUrl(id)`, `registry.getAllIds()`

### 원칙 3: Stage-Gated
Phase는 순서대로만 구현한다. 각 Phase의 Exit Criteria를 100% 통과해야 다음 Phase로 진행한다. 현재 AGENT.md에 명시된 Phase 외의 작업을 선점하지 않는다.

### 원칙 4: 작업 프로토콜
`[작업금지] 브리핑 → 수정 → 승인` 순서를 지킨다. 코드 작성 전 반드시 무엇을 할지 브리핑하고 승인을 받는다. 승인 없이 코드를 생성하지 않는다.

### 원칙 5: 이 문서 우선
코드와 설계 문서가 충돌하면 설계 문서가 정답이다. 구현 중 모순을 발견하면 코드를 임의로 고치지 말고, 모순 내용을 정확히 기술해 보고한다.

### 원칙 6: 컴포넌트 독립성
라우터/어댑터는 Mem0·Obsidian·Gemini 등 외부 지식 인프라와 완전히 독립적이다. 라우터의 유일한 Wiki 접점은 Raw 폴더 드롭(옵션)뿐이다.

---

## 3. 3축 격리 모델 (절대 혼동 금지)

| 축 | 대상 | 키 | 격리/공유 |
|----|------|-----|-----------|
| MESSAGE | 대화 메시지 로그 | `context_key` | 방마다 완전 격리 |
| PERSONA | 에이전트 인격·기억 | `{agent_id}` | 플랫폼 초월 공유 (Mem0) |
| KNOWLEDGE | 조직 지식 | Obsidian | 플랫폼 초월 공용 |

> ❌ `persona_key: "telegram:zeus"` — 절대 금지
> ✅ `persona_key: "zeus"` — 플랫폼 prefix 없음

---

## 4. 디렉터리 구조

```
agora-router/
├── CLAUDE.md              # 이 파일 — 읽기 전용
├── SKILLS.md              # 기술 컨벤션 — 읽기 전용
├── AGENT.md               # 현재 Phase 지시서 — 읽기 전용
├── Agora_PRD_Plan.md    # 설계 전체 명세 — 읽기 전용
├── Agora_Harness.md     # 테스트 골격 — 읽기 전용
├── config/
│   └── agents.yaml
├── router-core/
│   ├── agora-router.js
│   ├── a2a-guard.js
│   └── raw-logger.js
├── registry/
│   └── agent-registry.js
├── adapters/
│   ├── telegram-adapter.js
│   ├── slack-adapter.js
│   └── discord-adapter.js
├── harness/
│   ├── tests/
│   ├── mocks/
│   └── fixtures/
└── data/wiki/raw/
```

---

## 5. 절대 금지 사항

1. **AGENT.md / CLAUDE.md / SKILLS.md / PRD / Harness 수정** (최우선 금지)
2. 에이전트 이름 하드코딩 (zeus/hera/athena)
3. 라우터 코어에서 텍스트/의도 파싱
4. 라우터에서 Mem0/Obsidian/Gemini 직접 호출
5. 플랫폼 간 메시지 교차
6. 플랫폼 간 A2A 호출
7. persona_key에 플랫폼 prefix 부착
8. AGENT.md에 명시되지 않은 파일 수정
9. Exit Criteria 미통과 상태로 Phase 완료 선언
10. 승인 없는 코드 생성
11. 설계 모순 발견 시 임의 수정
12. **자기 승인 (문서 수정 후 그 문서를 근거로 작업 정당화)**

---

## 6. 기술 스택 고정

- 언어: Node.js (ESM, `import`/`export`)
- 병렬: `Promise.allSettled`
- 테스트: `node:test` + `node:assert`
- 설정: YAML (`config/agents.yaml`)
- HTTP: Node 내장 `fetch`

---

## 7. 작업 보고 형식

```
[Phase N 완료 보고]
구현 파일: [목록]
Exit Criteria:
  T_N.1 ✅
  T_N.2 ✅
  T_N.3 ❌ — 원인: [구체적 설명]
상태: 전체 통과 / 미통과 항목 있음
다음 액션: Phase N+1 AGENT.md 제공 요청 (작업 대기)
```

> 모든 Exit Criteria가 통과하기 전에는 "완료"를 선언하지 않는다.
> 완료 후에는 **반드시 멈추고** 다음 AGENT.md가 제공될 때까지 대기한다.

---

## 8. 현재 Phase

현재 작업 Phase와 구체적 지시는 `AGENT.md`를 참조한다.
**AGENT.md는 Phase 시작 시마다 사장님이 교체해서 제공한다.**
에이전트는 AGENT.md를 수동으로 교체하거나 수정할 수 없다.
