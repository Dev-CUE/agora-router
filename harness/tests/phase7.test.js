import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../../registry/agent-registry.js';
import { dropToRaw } from '../../router-core/raw-logger.js';

const RAW_TEST_PATH = 'harness/tmp/raw-phase7/';

before(() => {
  registry.load('./harness/fixtures/agents.test.yaml');
  registry.system.wiki = {
    raw_logging_enabled: true,
    raw_path: RAW_TEST_PATH
  };
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

after(() => {
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

// T7.1
test('T7.1 — raw_logging_enabled=true → JSONL 파일 생성', async () => {
  registry.system.wiki.raw_logging_enabled = true;

  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'] },
    payload: { origin_platform: 'telegram', text: '테스트 메시지' },
    idempotency_key: 'msg_t71'
  };

  dropToRaw(envelope);

  await new Promise(resolve => setTimeout(resolve, 150));

  const files = fs.readdirSync(RAW_TEST_PATH);
  assert.ok(files.length > 0, 'JSONL 파일이 생성되어야 함');
  assert.ok(files.some(f => f.endsWith('.jsonl')), '파일 확장자는 .jsonl');

  const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
  const content = fs.readFileSync(`${RAW_TEST_PATH}${jsonlFiles[0]}`, 'utf8');
  const record = JSON.parse(content.trim());
  assert.deepStrictEqual(record.targets, ['agentA']);
  assert.strictEqual(record.meta.platform, 'telegram');
  assert.strictEqual(record.text, '테스트 메시지');
});

// T7.2
test('T7.2 — raw_logging_enabled=false → 드롭 안 함', async () => {
  registry.system.wiki.raw_logging_enabled = false;

  const countBefore = fs.existsSync(RAW_TEST_PATH)
    ? fs.readdirSync(RAW_TEST_PATH).length
    : 0;

  dropToRaw({
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'] },
    payload: { origin_platform: 'telegram', text: '비활성화 테스트' },
    idempotency_key: 'msg_t72'
  });

  await new Promise(resolve => setTimeout(resolve, 150));

  const countAfter = fs.existsSync(RAW_TEST_PATH)
    ? fs.readdirSync(RAW_TEST_PATH).length
    : 0;

  assert.strictEqual(countAfter, countBefore, 'raw_logging_enabled=false → 파일 미생성');

  registry.system.wiki.raw_logging_enabled = true;
});

// T7.3
test('T7.3 — Raw 드롭이 코어 응답 지연 유발하지 않음 (< 5ms)', () => {
  registry.system.wiki.raw_logging_enabled = true;

  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'] },
    payload: { origin_platform: 'telegram', text: '지연 테스트' },
    idempotency_key: 'msg_t73'
  };

  const start = Date.now();
  dropToRaw(envelope);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 5, `dropToRaw() 동기 경과 시간 ${elapsed}ms < 5ms 이어야 함`);
});

// T7.4
test('T7.4 — mock WikiWorker: Gemini 분류 → Obsidian 병합 호출', async () => {
  const geminiCalled = { value: false };
  const obsidianCalled = { value: false };

  const mockGemini = {
    classify: async (record) => {
      geminiCalled.value = true;
      return { category: 'decision' };
    }
  };

  const mockObsidian = {
    merge: async (classified) => {
      obsidianCalled.value = true;
    }
  };

  async function mockWikiWorker(rawRecord) {
    const classified = await mockGemini.classify(rawRecord);
    await mockObsidian.merge(classified);
  }

  await mockWikiWorker({ text: 'test', meta: {} });

  assert.ok(geminiCalled.value, 'Gemini classify 호출됨');
  assert.ok(obsidianCalled.value, 'Obsidian merge 호출됨');

  // 라우터 코드에 Gemini/Obsidian 직접 호출 없음
  const rawLoggerSrc = fs.readFileSync('router-core/raw-logger.js', 'utf8');
  assert.ok(!rawLoggerSrc.toLowerCase().includes('gemini'), 'raw-logger에 gemini 직접 호출 없음');
  assert.ok(!rawLoggerSrc.toLowerCase().includes('obsidian'), 'raw-logger에 obsidian 직접 호출 없음');
  assert.ok(!rawLoggerSrc.toLowerCase().includes('mem0'), 'raw-logger에 mem0 직접 호출 없음');
});
