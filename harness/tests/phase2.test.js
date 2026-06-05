import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/olympus-router.js';

function startServer(port, handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise(resolve => server.close(resolve));
}

function makeEnvelope(to, cc = []) {
  return {
    context_key: 'telegram:group:C123:root',
    routing: { to, cc },
    payload: { origin_platform: 'telegram', text: 'test' },
    idempotency_key: `test:${Date.now()}`
  };
}

test('T2.1 — to:[A,B,C] 병렬 실행 — 총시간 ≈ max(개별)', async () => {
  const ports = [9201, 9202, 9203];
  const ids = ['agentA', 'agentB', 'agentC'];

  const servers = await Promise.all(ports.map(port =>
    startServer(port, (req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, 500);
    })
  ));

  registry.agents.clear();
  ids.forEach((id, i) => registry.agents.set(id, { id, url: `http://127.0.0.1:${ports[i]}` }));

  const t0 = Date.now();
  const result = await route(makeEnvelope(ids));
  const elapsed = Date.now() - t0;

  await Promise.all(servers.map(closeServer));

  assert.ok(elapsed < 1000, `병렬이어야 함: ${elapsed}ms (직렬이면 ~1500ms)`);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 3);
});

test('T2.2 — A HTTP 500 실패 → B,C success (장애 격리)', async () => {
  const portA = 9211, portB = 9212, portC = 9213;

  const serverA = await startServer(portA, (req, res) => {
    res.writeHead(500);
    res.end('error');
  });
  const serverB = await startServer(portB, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  const serverC = await startServer(portC, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: `http://127.0.0.1:${portA}` });
  registry.agents.set('agentB', { id: 'agentB', url: `http://127.0.0.1:${portB}` });
  registry.agents.set('agentC', { id: 'agentC', url: `http://127.0.0.1:${portC}` });

  const result = await route(makeEnvelope(['agentA', 'agentB', 'agentC']));

  await Promise.all([serverA, serverB, serverC].map(closeServer));

  assert.strictEqual(result.ok, true);
  const rA = result.results.find(r => r.agent === 'agentA');
  const rB = result.results.find(r => r.agent === 'agentB');
  const rC = result.results.find(r => r.agent === 'agentC');
  assert.strictEqual(rA.status, 'error', 'A는 error여야 함');
  assert.strictEqual(rB.status, 'success', 'B는 success여야 함');
  assert.strictEqual(rC.status, 'success', 'C는 success여야 함');
});

test('T2.3 — cc 지연 2000ms → route() 800ms 안에 반환 (fire-and-forget)', async () => {
  const portA = 9221, portD = 9224;

  const serverA = await startServer(portA, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  const serverD = await startServer(portD, (req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }, 2000);
  });

  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: `http://127.0.0.1:${portA}` });
  registry.agents.set('agentD', { id: 'agentD', url: `http://127.0.0.1:${portD}` });

  const t0 = Date.now();
  const result = await route(makeEnvelope(['agentA'], ['agentD']));
  const elapsed = Date.now() - t0;

  await new Promise(r => setTimeout(r, 50));
  await closeServer(serverA);
  serverD.closeAllConnections?.();
  await closeServer(serverD);

  assert.ok(elapsed < 800, `cc fire-and-forget이어야 함: ${elapsed}ms (cc 대기했다면 ~2000ms)`);
  assert.strictEqual(result.ok, true);
});

test('T2.4 — cc 에이전트 다운 → ok:true, 메인 results 무영향', async () => {
  const portA = 9231;

  const serverA = await startServer(portA, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: `http://127.0.0.1:${portA}` });
  registry.agents.set('agentD', { id: 'agentD', url: 'http://127.0.0.1:9234' }); // no server

  const result = await route(makeEnvelope(['agentA'], ['agentD']));

  await new Promise(r => setTimeout(r, 50));
  await closeServer(serverA);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 1);
  assert.strictEqual(result.results[0].agent, 'agentA');
  assert.strictEqual(result.results[0].status, 'success');
});

test('T2.5 — 실패 status:"error"+error_message, 성공 status:"success"', async () => {
  const portA = 9241, portB = 9242;

  const serverA = await startServer(portA, (req, res) => {
    res.writeHead(500);
    res.end('error');
  });
  const serverB = await startServer(portB, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: 'hello' }));
  });

  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: `http://127.0.0.1:${portA}` });
  registry.agents.set('agentB', { id: 'agentB', url: `http://127.0.0.1:${portB}` });

  const result = await route(makeEnvelope(['agentA', 'agentB']));

  await Promise.all([serverA, serverB].map(closeServer));

  const rA = result.results.find(r => r.agent === 'agentA');
  const rB = result.results.find(r => r.agent === 'agentB');

  assert.strictEqual(rA.status, 'error', 'A는 error여야 함');
  assert.ok(rA.error_message, 'error_message가 있어야 함');
  assert.ok(rA.error_message.includes('HTTP_ERROR'), `HTTP_ERROR 포함해야 함: ${rA.error_message}`);
  assert.strictEqual(rB.status, 'success', 'B는 success여야 함');
});
