# AGENT.md — 현재 작업 지시서 (GitHub 공개 준비)

> ⚠️ 이 파일은 **GitHub 공개 준비 전용** 지시서다. 완료 후 다음 작업 지시서로 교체된다.
> 작업 시작 전 `CLAUDE.md`(헌법)를 먼저 읽었다고 가정한다.
> 자기완결형 — 이 파일만으로 작업이 완결된다.

---

## 1. 너의 역할

Agora Router를 GitHub에 공개하기 위한 파일 4종을 생성한다.
기존 코드·설계·문서는 **일절 건드리지 않는다.** 새 파일만 추가한다.

---

## 2. 반드시 지킬 원칙

1. **신규 생성만**: 기존 파일 수정 금지. 4개 파일만 새로 만든다.
2. **보안 우선**: 실제 서버 URL, 실제 에이전트 이름(zeus/hera/athena)이 공개 파일에 노출되면 안 된다.
3. **Zero Hardcoding 유지**: agents.example.yaml에도 에이전트 이름을 예시용 제네릭으로 작성한다.
4. **승인 후 생성**: 브리핑 후 승인 받고 파일을 생성한다.

---

## 3. 작업 범위 (화이트리스트 — 이 파일들만 생성)

```
생성:
  README.md
  .gitignore
  config/agents.example.yaml
  LICENSE
```

## 4. 절대 건드리지 말 것 (블랙리스트)

```
config/agents.yaml        ← 실제 운영 설정 (절대 수정/노출 금지)
router-core/              ← 기존 코드
registry/
adapters/
harness/
CLAUDE.md, SKILLS.md      ← 기존 문서
Agora_PRD_Plan.md 등      ← 기존 문서
data/                     ← 운영 데이터
```

---

## 5. 생성할 파일 상세 명세

### 5.1 README.md

아래 구조로 작성한다. 영어로 작성한다 (GitHub 공개용).

```
# Agora Router

[한 줄 설명 — 배지 포함]

## What is Agora Router?
[3축 격리 모델 설명 — 메시지 격리 / 인격 공유 / 지식 공용]

## Key Features
- Dumb Pipe core (no text parsing, no LLM calls)
- Zero Hardcoding (agents defined only in agents.yaml)
- Non-blocking parallel dispatch (Promise.allSettled)
- A2A collaboration (SINGLE / DIALOGUE modes)
- Universal adapters (Telegram / Slack / Discord)
- 3-Axis Isolation Model
- Platform-absolute isolation (no cross-platform A2A)

## Architecture
[토폴로지 다이어그램 — 텍스트 아스키아트]

## Quick Start
[설치 → 설정 → 실행 3단계]

## Configuration (agents.yaml)
[agents.example.yaml 내용 코드블록으로 표시]

## A2A Modes
[SINGLE / DIALOGUE 설명]

## Error Codes
[에러 코드 표]

## Project Structure
[디렉터리 구조]

## License
MIT
```

### 5.2 .gitignore

반드시 포함해야 할 항목:

```
# Dependencies
node_modules/

# 실제 운영 설정 (절대 커밋 금지)
config/agents.yaml

# 운영 데이터
data/wiki/raw/

# 환경변수
.env
.env.local
.env.*.local

# 로그
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# 테스트 임시 파일
harness/tmp/

# Claude Code 설정 (로컬 전용)
.claude/settings.local.json
```

### 5.3 config/agents.example.yaml

실제 `config/agents.yaml`을 기반으로 하되:
- 실제 URL → 플레이스홀더로 교체 (`http://your-agent-a:3001`)
- 에이전트 id → 제네릭 예시로 교체 (`agent-a`, `agent-b`, `agent-c`)
- 구조와 주석은 최대한 상세하게 (사용자가 따라 작성하기 쉽게)

```yaml
# config/agents.example.yaml
# Copy this file to config/agents.yaml and fill in your actual values.
# agents.yaml is gitignored and will never be committed.

system:
  a2a:
    max_speaker_calls: 10      # Per-agent call limit (SINGLE & DIALOGUE)
    max_rounds: 10             # DIALOGUE round limit
    default_mode: "single"    # "single" | "dialogue"
    allow_self_call: false
    allow_cross_platform: false
  wiki:
    raw_logging_enabled: false  # Set true to drop raw logs to data/wiki/raw/
    raw_path: "data/wiki/raw/"

agents:
  - id: "agent-a"                          # Unique agent identifier
    url: "http://your-agent-a:3001"        # Agent server URL
    a2a:
      can_initiate: true                   # Can this agent initiate A2A?
      allowed_targets: "*"                 # "*" = all | [] = receive only | ["agent-b"] = specific

  - id: "agent-b"
    url: "http://your-agent-b:3002"
    a2a:
      can_initiate: true
      allowed_targets: "*"

  - id: "agent-c"
    url: "http://your-agent-c:3003"
    a2a:
      can_initiate: false                  # Receive-only agent
      allowed_targets: []
```

### 5.4 LICENSE

MIT License. 연도: 2026. 저작권자: 공란으로 두고 `[Your Name or Organization]` 플레이스홀더 사용.

---

## 6. 자가 검증 (작업 완료 후 반드시 실행)

```bash
# 생성 파일 확인
ls README.md .gitignore config/agents.example.yaml LICENSE

# 보안 확인 — 실제 운영 URL 또는 실제 에이전트 이름 노출 여부
grep -E "(zeus|hera|athena|cfargotunnel|localhost|3001|3002|3003)" \
  README.md config/agents.example.yaml

# agents.yaml이 .gitignore에 포함되어 있는지 확인
grep "agents.yaml" .gitignore

# README 길이 확인 (너무 짧으면 안 됨 — 최소 80줄)
wc -l README.md
```

---

## 7. 완료 보고 형식

```
[GitHub 공개 준비 완료 보고]

생성 파일:
  README.md ✅ (N줄)
  .gitignore ✅
  config/agents.example.yaml ✅
  LICENSE ✅

보안 검증:
  실제 URL 노출: 0건 ✅
  agents.yaml gitignore 포함: ✅

상태: 완료 — GitHub 배포 승인 요청
```

---

## 8. 다음 단계

GitHub 공개 준비 완료 후:
1. GitHub 저장소 생성 (`agora-router`)
2. 초기 커밋 및 푸시
3. Cloudflare Tunnel 연동 — 실제 HTTP 왕복 테스트 (T1.5 해결)
