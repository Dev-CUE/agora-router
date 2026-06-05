# AGENT.md — 현재 작업 지시서 (프로젝트 이름 변경)

> ⚠️ 이 파일은 **이름 변경 전용** 지시서다. 완료 후 다음 작업 지시서로 교체된다.
> 작업 시작 전 `CLAUDE.md`(헌법)를 먼저 읽었다고 가정한다.
> 자기완결형 — 이 파일만으로 작업이 완결된다.

---

## 1. 너의 역할

프로젝트명을 **Olympus Router → Agora Router** 로 변경한다.
코드 로직·설계 원칙·구조는 **일절 건드리지 않는다.** 이름만 바꾼다.

---

## 2. 반드시 지킬 원칙

1. **이름만**: 설계, 로직, 원칙 수정 금지. 텍스트 치환과 파일명 변경만 수행한다.
2. **확인 후 진행**: 각 단계 완료 후 grep으로 잔존 여부 확인한다.
3. **누락 금지**: 아래 화이트리스트의 모든 파일을 빠짐없이 처리한다.
4. **모순 발견 시**: 임의 수정 금지. 보고 후 지시를 기다린다.

---

## 3. 치환 규칙 (정확히 이 규칙만 적용)

| 변경 전 | 변경 후 |
|---------|---------|
| `Olympus Router` | `Agora Router` |
| `Olympus Universal Architecture` | `Agora Universal Architecture` |
| `Olympus_Router` | `Agora_Router` |
| `agora-router` | `agora-router` |
| `agora-router.js` | `agora-router.js` |
| `Agora_PRD_Plan` | `Agora_PRD_Plan` |
| `Agora_Harness` | `Agora_Harness` |
| `Olympus_Handoff` | `Agora_Handoff` |
| `Olympus_CONTEXT` | `Agora_CONTEXT` |

> ❌ `zeus` / `hera` / `athena` / `A2A` 등 다른 단어는 절대 건드리지 않는다.

---

## 4. 작업 범위 (화이트리스트 — 이 파일들만 수정)

### Step 1 — 문서 내 텍스트 치환 (내용 수정)

```
CLAUDE.md
SKILLS.md
AGENT.md                   ← 이 파일 자신도 포함
router-core/agora-router.js  ← 파일 상단 주석/import 경로만
Agora_PRD_Plan.md
Agora_Harness.md
Olympus_Handoff.md
```

### Step 2 — 파일명 변경

```
Agora_PRD_Plan.md      → Agora_PRD_Plan.md
Agora_Harness.md       → Agora_Harness.md
Olympus_Handoff.md       → Agora_Handoff.md
router-core/agora-router.js → router-core/agora-router.js
```

### Step 3 — import 경로 수정 (agora-router.js를 참조하는 파일)

`agora-router.js`를 import하는 파일이 있다면 경로를 `agora-router.js`로 수정한다.

```bash
# 확인 명령
grep -rn "agora-router" . --include="*.js"
```

---

## 5. 절대 건드리지 말 것 (블랙리스트)

```
config/agents.yaml          ← 에이전트 정의 소스 (내용 변경 금지)
registry/agent-registry.js  ← 로직 파일 (이름 변경 없음)
adapters/                   ← 로직 파일 (이름 변경 없음)
router-core/a2a-guard.js    ← 로직 파일 (이름 변경 없음)
harness/                    ← 테스트 파일 (이름 변경 없음)
data/                       ← 데이터 디렉터리
```

---

## 6. 자가 검증 (작업 완료 후 반드시 실행)

```bash
# Olympus 잔존 여부 확인 — 결과가 0건이어야 통과
grep -rni "olympus" . \
  --include="*.md" \
  --include="*.js" \
  --include="*.yaml" \
  --include="*.json"
```

```bash
# Agora 정상 치환 확인 — 핵심 파일에 Agora가 있어야 통과
grep -l "Agora" CLAUDE.md SKILLS.md router-core/agora-router.js
```

```bash
# 파일명 변경 확인
ls Agora_PRD_Plan.md Agora_Harness.md Agora_Handoff.md router-core/agora-router.js
```

---

## 7. 완료 보고 형식

```
[이름 변경 완료 보고]

Step 1 (텍스트 치환):
  CLAUDE.md ✅
  SKILLS.md ✅
  AGENT.md ✅
  router-core/agora-router.js (주석) ✅
  Agora_PRD_Plan.md ✅
  Agora_Harness.md ✅
  Olympus_Handoff.md ✅

Step 2 (파일명 변경):
  Agora_PRD_Plan.md → Agora_PRD_Plan.md ✅
  Agora_Harness.md  → Agora_Harness.md ✅
  Olympus_Handoff.md  → Agora_Handoff.md ✅
  agora-router.js   → agora-router.js ✅

Step 3 (import 경로):
  수정 파일: [목록 또는 "없음"]

검증:
  grep "olympus" 결과: 0건 ✅
  Agora 키워드 확인: ✅
  파일명 확인: ✅

상태: 완료 — 다음 작업(GitHub 공개 준비) 승인 요청
```

---

## 8. 다음 단계

이름 변경 완료 후, 다음 AGENT.md는 **GitHub 공개 준비** (README + .gitignore + agents.example.yaml + LICENSE) 전용으로 교체된다.
