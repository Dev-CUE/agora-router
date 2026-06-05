import fs from 'node:fs';
import registry from '../registry/agent-registry.js';

/**
 * Raw 드롭 — 옵션 모듈
 * raw_logging_enabled=true 일 때만 data/wiki/raw/ 에 JSONL 기록.
 * void 반환 — 코어가 await 불가, 블로킹 0.
 */
export function dropToRaw(envelope) {
  if (!registry.system?.wiki?.raw_logging_enabled) return;

  const rawPath = registry.system.wiki.raw_path ?? 'data/wiki/raw/';

  const record = {
    timestamp: new Date().toISOString(),
    targets: envelope.routing?.to ?? [],
    meta: {
      platform: envelope.payload?.origin_platform ?? 'unknown',
      space_key: envelope.context_key ?? ''
    },
    text: envelope.payload?.text ?? ''
  };

  const filename = `${rawPath}${Date.now()}_${envelope.idempotency_key ?? 'noid'}.jsonl`;

  fs.promises.mkdir(rawPath, { recursive: true })
    .then(() => fs.promises.appendFile(filename, JSON.stringify(record) + '\n'))
    .catch(() => {});
}
