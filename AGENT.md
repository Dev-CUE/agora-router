# 작업 시작 프롬프트 (Claude Code에 붙여넣기)

---

CLAUDE.md와 AGENT.md를 읽고 버그픽스 브리핑해줘.
파일 생성 전 목록 먼저 보고하고 승인 기다려.

수정 대상은 3개야:
1. olympus-router.js — DIALOGUE resolved 응답 후 조기종료 미작동
2. idempotency-store.js — 매 요청마다 O(N) 전체 순회 병목
3. config/agents.yaml — Athena can_initiate:false 권한 차단

브리핑 형식:
- 각 버그 원인 1줄 요약
- 수정할 파일 목록
- 수정 방향 핵심만
- 생성할 테스트 파일

승인 후 작업 시작.
