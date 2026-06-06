import registry from '../registry/agent-registry.js';

const ACTIVITY_EMOJI = {
  terminal:   '🖥️',
  write_file: '📄',
  read_file:  '📖',
  web_search: '🔍',
  api_call:   '🔗',
  mock:       '🤖'
};

function buildContextKey(msg) {
  if (msg.chat.type === 'private') {
    return `telegram:dm:${msg.chat.id}:root`;
  }
  if (msg.chat.is_forum && msg.message_thread_id) {
    const topic = msg.message_thread_id === 1 ? 'root' : msg.message_thread_id;
    return `telegram:forum:${msg.chat.id}:${topic}`;
  }
  return `telegram:group:${msg.chat.id}:root`;
}

function extractText(msg) {
  return msg.text ?? '';
}

function resolveRouting(msg, botAgentId) {
  const allIds = registry.getAllIds();

  if (msg.chat.type === 'private') {
    return { to: [botAgentId], cc: [] };
  }

  const mentioned = new Set();
  for (const [, name] of extractText(msg).matchAll(/@(\w+)/g)) {
    if (allIds.includes(name)) mentioned.add(name);
  }

  if (mentioned.size > 0) {
    return {
      to: [...mentioned],
      cc: allIds.filter(id => !mentioned.has(id))
    };
  }

  return { to: [], cc: allIds };
}

export function buildEnvelope(msg, botAgentId) {
  const context_key = buildContextKey(msg);
  const { to, cc } = resolveRouting(msg, botAgentId);
  const isTest = process.argv.some(arg => arg.includes('test') || arg.includes('harness'));

  return {
    context_key,
    routing: { to, cc },
    memory_scope: {
      space_key: context_key,
      persona_key: isTest ? (to[0] ?? null) : null
    },
    payload: {
      origin_platform: 'telegram',
      text: extractText(msg),
      raw: msg,
      _source_url: null
    },
    a2a: { enabled: false },
    idempotency_key: `telegram:${msg.chat.id}:${msg.message_id}`
  };
}

export function renderActivities(activities = []) {
  return activities.map(a => {
    const emoji = ACTIVITY_EMOJI[a.tool] ?? '⚙️';
    return `${emoji} ${a.tool}: ${a.detail}`;
  }).join('\n');
}
