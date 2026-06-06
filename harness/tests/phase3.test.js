import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../../registry/agent-registry.js';
import { buildEnvelope as tgBuild, renderActivities } from '../../adapters/telegram-adapter.js';
import { buildEnvelope as slBuild } from '../../adapters/slack-adapter.js';
import { buildEnvelope as dcBuild } from '../../adapters/discord-adapter.js';

beforeEach(() => {
  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: 'http://localhost:9301' });
  registry.agents.set('agentB', { id: 'agentB', url: 'http://localhost:9302' });
  registry.agents.set('agentC', { id: 'agentC', url: 'http://localhost:9303' });
});

// T3.1
test('T3.1 — 텔레그램 DM → context_key=telegram:dm:...:root, to=[botAgentId], cc=[]', () => {
  const msg = { message_id: 1, chat: { id: 12345, type: 'private' }, text: 'hello' };
  const env = tgBuild(msg, 'agentA');
  assert.strictEqual(env.context_key, 'telegram:dm:12345:root');
  assert.deepEqual(env.routing.to, ['agentA']);
  assert.deepEqual(env.routing.cc, []);
});

// T3.2
test('T3.2 — 텔레그램 그룹 @agentA → to:[agentA], cc:[agentB,agentC]', () => {
  const msg = { message_id: 2, chat: { id: 99, type: 'group' }, text: 'hey @agentA check this' };
  const env = tgBuild(msg, 'agentA');
  assert.deepEqual(env.routing.to, ['agentA']);
  assert.ok(env.routing.cc.includes('agentB'), 'agentB in cc');
  assert.ok(env.routing.cc.includes('agentC'), 'agentC in cc');
  assert.ok(!env.routing.cc.includes('agentA'), 'agentA not in cc');
});

// T3.3
test('T3.3 — 텔레그램 그룹 멘션 없음 → to:[], cc:[전원 3기]', () => {
  const msg = { message_id: 3, chat: { id: 99, type: 'group' }, text: 'anyone there?' };
  const env = tgBuild(msg, 'agentA');
  assert.deepEqual(env.routing.to, []);
  assert.strictEqual(env.routing.cc.length, 3);
});

// T3.4
test('T3.4 — 텔레그램 포럼 토픽2 vs 토픽3 → context_key 격리', () => {
  const base = { message_id: 4, chat: { id: 500, type: 'supergroup', is_forum: true }, text: 'hi' };
  const env1 = tgBuild({ ...base, message_thread_id: 2 }, 'agentA');
  const env2 = tgBuild({ ...base, message_thread_id: 3 }, 'agentA');
  assert.notStrictEqual(env1.context_key, env2.context_key);
  assert.strictEqual(env1.context_key, 'telegram:forum:500:2');
  assert.strictEqual(env2.context_key, 'telegram:forum:500:3');
});

// T3.5
test('T3.5 — 텔레그램 포럼 General Topic(thread_id=1) → root 정규화', () => {
  const msg = {
    message_id: 5,
    chat: { id: 500, type: 'supergroup', is_forum: true },
    message_thread_id: 1,
    text: 'general'
  };
  const env = tgBuild(msg, 'agentA');
  assert.strictEqual(env.context_key, 'telegram:forum:500:root');
});

// T3.6 — Slack thread_ts
test('T3.6 — Slack thread_ts → context_key에 thread_ts 포함', () => {
  const event = {
    channel: 'C001',
    channel_type: 'channel',
    thread_ts: '1700000000.123456',
    text: 'hello',
    ts: '1700000001.000'
  };
  const env = slBuild(event, 'agentA');
  assert.strictEqual(env.context_key, 'slack:channel:C001:1700000000.123456');
});

// T3.6 — Discord thread_id
test('T3.6 — Discord thread_id → context_key에 forum:parentId:threadId 포함', () => {
  const msg = {
    id: 'msg001',
    content: 'hello',
    channel: { id: 'thread999', parentId: 'forum888', isThread: () => true }
  };
  const env = dcBuild(msg);
  assert.strictEqual(env.context_key, 'discord:forum:forum888:thread999');
});

// T3.7
test('T3.7 — 어댑터는 persona_key를 주입하지 않음', () => {
  const tgDm = tgBuild(
    { message_id: 7, chat: { id: 12345, type: 'private' }, text: 'hi' },
    'agentA'
  );
  assert.strictEqual(tgDm.memory_scope.persona_key, null);

  const slDm = slBuild(
    { channel: 'D999', channel_type: 'im', text: 'hi', ts: '001' },
    'agentB'
  );
  assert.strictEqual(slDm.memory_scope.persona_key, null);
});

// T3.8
test('T3.8 — renderActivities 이모지 렌더링 정확', () => {
  const activities = [
    { tool: 'terminal',   detail: 'kubectl get pods' },
    { tool: 'write_file', detail: 'output.txt' },
    { tool: 'read_file',  detail: 'config.json' },
    { tool: 'web_search', detail: 'node.js ESM' },
    { tool: 'api_call',   detail: 'POST /invoke' },
    { tool: 'mock',       detail: 'fake response' },
    { tool: 'unknown',    detail: 'something' }
  ];
  const result = renderActivities(activities);
  assert.ok(result.includes('🖥️ terminal: kubectl get pods'));
  assert.ok(result.includes('📄 write_file: output.txt'));
  assert.ok(result.includes('📖 read_file: config.json'));
  assert.ok(result.includes('🔍 web_search: node.js ESM'));
  assert.ok(result.includes('🔗 api_call: POST /invoke'));
  assert.ok(result.includes('🤖 mock: fake response'));
  assert.ok(result.includes('⚙️ unknown: something'));
});

// T3.9
test('T3.9 — adapters/ 에이전트 이름 하드코딩 0건', () => {
  const files = [
    './adapters/telegram-adapter.js',
    './adapters/slack-adapter.js',
    './adapters/discord-adapter.js'
  ];
  const pattern = /\b(zeus|hera|athena)\b/;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!pattern.test(content), `${file}: 에이전트 이름 하드코딩 감지됨`);
  }
});
