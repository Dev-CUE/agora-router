# Agora Router

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org)

A universal, multi-platform AI organization operation infrastructure designed to run multiple AI agents across various messaging platforms (Telegram, Slack, Discord).

Agora Router isolates messaging contexts, shares agent personas across platforms, and safely mediates Agent-to-Agent (A2A) collaboration.

---

## What is Agora Router?

Agora Router operates on a **3-Axis Isolation & Sharing Model** to coordinate multiple agents seamlessly:

1. **Message Isolation (MESSAGE)**: Every chat space (group, thread, or DM) is completely isolated using a `context_key`. Conversation logs from one room never leak to another.
2. **Persona Sharing (PERSONA)**: Agent identities and memories are shared across platforms. Zeus on Telegram is the same Zeus on Slack or Discord, identified by `{agent_id}`.
3. **Knowledge Commoning (KNOWLEDGE)**: All agents and platforms share a single Obsidian-based organization knowledge base, structured asynchronously.

---

## Key Features

- **Dumb Pipe Core**: The core router is completely stateless, performing zero text parsing or LLM calls. It only validates routing destinations and dispatches envelopes.
- **Zero Hardcoding**: No agent names or configurations are hardcoded. Everything is loaded dynamically from `config/agents.yaml`.
- **Non-blocking Parallel Dispatch**: Parallel routing using Node.js `Promise.allSettled` with fault isolation.
- **A2A Collaboration**: Rich Agent-to-Agent collaboration supporting both `SINGLE` and `DIALOGUE` conversation modes with safety guards.
- **Universal Adapters**: Modular integration paths for Telegram, Slack, and Discord.
- **Platform-Absolute Isolation**: Prevents cross-platform messaging or A2A loops to enforce structural boundaries.

---

## Architecture

```
[ Users ]
   |
   v
[ Universal Adapters ] (Telegram / Slack / Discord ...)   <- Smart Edge
   |  +- Generate context_key & persona_key
   |  +- Parse mentions, DMs, threads
   |  +- Render UI (emojis, markdown, A2A progression)
   v  (Standard JSON Ingress)
[ Agora Router Core ]                                    <- Dumb Pipe
   |  +- Validate destinations against agents.yaml
   |  +- Run A2A Guard (permissions, speaker/round limits, spoofing check)
   |  +- Promise.allSettled parallel dispatch
   |  +- (Optional) Drop raw messages to spool
   |
   +--------------+--------------+
   v              v              v
[ Agent A(to) ] [ Agent B(to) ] [ Agent C(cc) ]          <- Brains
   |  +- Re-enter router for A2A if needed
   |  +- Resolve memories (Mem0 / Obsidian)
   |
  Mem0 (agent_id, cross-platform persona)
```

---

## Quick Start

### 1. Install Dependencies
Ensure you have Node.js (v20+) installed. Clone the repository and install dependencies:
```bash
git clone <repository-url> agora-router
cd agora-router
npm install
```

### 2. Configure Agents
Copy the example configuration file and register your agents:
```bash
cp config/agents.example.yaml config/agents.yaml
```
Open `config/agents.yaml` and configure your agent IDs and service endpoints.

### 3. Run Tests
Verify the installation by running the test suite:
```bash
# Run all tests (Phase 1-7 + E2E integration)
npm test
```

---

## Configuration (agents.yaml)

```yaml
system:
  a2a:
    max_speaker_calls: 10      # Individual agent speaker limit
    max_rounds: 10             # Maximum rounds in DIALOGUE mode
    default_mode: "single"     # "single" | "dialogue"
    allow_self_call: false
    allow_cross_platform: false
  wiki:
    raw_logging_enabled: false  # Save raw message spool for KB ingestion
    raw_path: "data/wiki/raw/"

agents:
  - id: "agent-a"
    url: "http://your-agent-a:3001"
    a2a:
      can_initiate: true
      allowed_targets: "*"

  - id: "agent-b"
    url: "http://your-agent-b:3002"
    a2a:
      can_initiate: true
      allowed_targets: "*"

  - id: "agent-c"
    url: "http://your-agent-c:3003"
    a2a:
      can_initiate: false
      allowed_targets: []
```

---

## A2A Modes

Agora Router supports two communication styles for Agent-to-Agent interaction:

| Mode | Flow | Termination Triggers |
|---|---|---|
| `single` | Q&A style. Initiator calls target, target replies, dialogue terminates immediately. | Direct reply. |
| `dialogue` | Multi-agent discussion. Multi-turn conversation among participants. | 1. Any agent sends `resolved` status (early exit).<br>2. Total turns reach `max_rounds`.<br>3. Any single agent reaches `max_speaker_calls`. |

---

## Error Codes

Agora Router uses standard error codes in its A2A and routing guards:

| Error Code | Description |
|---|---|
| `UNKNOWN_AGENT` | Destination agent ID is not registered in `agents.yaml`. |
| `A2A_INITIATION_DENIED` | Agent attempted to initiate A2A, but has `can_initiate: false`. |
| `A2A_UNAUTHORIZED` | Target agent is not in the initiator's `allowed_targets` list. |
| `A2A_SELF_CALL` | Agent attempted to initiate an A2A call to itself. |
| `A2A_CROSS_PLATFORM_DENIED` | A2A call crossing different platform boundaries was blocked. |
| `A2A_SPOOF_DETECTED` | Caller agent ID does not match the incoming source URL. |
| `A2A_ROUND_LIMIT_EXCEEDED` | Dialogue reached the maximum round limit (`max_rounds`). |
| `A2A_SPEAKER_LIMIT_EXCEEDED` | A single agent exceeded the speech count limit (`max_speaker_calls`). |

---

## Project Structure

```
agora-router/
├── config/
│   ├── agents.yaml            # Active agent configuration (gitignored)
│   └── agents.example.yaml    # Example template for agents.yaml
├── router-core/
│   ├── agora-router.js        # Core routing, parallel dispatch & spool logging
│   ├── a2a-guard.js           # A2A validation (permissions, round limits, spoof checks)
│   ├── idempotency-store.js   # Ingress idempotency check (deduplication)
│   └── raw-logger.js          # Fire-and-forget logging to raw wiki spool
├── registry/
│   └── agent-registry.js      # Dynamic registry loader for config/agents.yaml
├── adapters/
│   ├── telegram-adapter.js    # Telegram webhook parsing, context-key & UI rendering
│   ├── slack-adapter.js       # Slack event subscription, thread context adapter
│   └── discord-adapter.js     # Discord gateway/webhook adapter
└── harness/
    ├── tests/                 # Unit & E2E integration test suites
    └── fixtures/              # Test configuration YAML files
```

---

## Operations

- **Configuration Reload**: When `agents.yaml` is modified, you must restart the server process to apply the changes (as it is loaded once upon initialization).
- **Idempotency TTL**: After a server restart, duplicate messages sent within 1 hour may be processed again due to the 1-hour Time-To-Live (TTL) limit of the idempotency store.
- **A2A Walkie-Talkie Signals**:
  - `resolved` / `out`: Initiates dialogue early termination and stops routing.
  - `over`: Signal indicating it is the next agent's turn to speak.

---

## License

This project is licensed under the MIT License - see the [LICENSE](file:///C:/DEV/claude/olympus-router/LICENSE) file for details.
