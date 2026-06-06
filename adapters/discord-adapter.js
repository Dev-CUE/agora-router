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
  if (msg.channel.isThread()) {
    return `discord:forum:${msg.channel.parentId}:${msg.channel.id}`;
  }
  return `discord:channel:${msg.channel.id}:root`;
}

function extractText(msg) {
  return msg.content ?? '';
}

function resolveRouting(msg, botAgentId) {
  const allIds = registry.getAllIds();

  if (msg.channel.type === 'DM') {
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

  return {
    context_key,
    routing: { to, cc },
    memory_scope: {
      space_key: context_key,
      persona_key: to[0] ?? null
    },
    payload: {
      origin_platform: 'discord',
      text: extractText(msg),
      raw: msg,
      _source_url: null
    },
    a2a: { enabled: false },
    idempotency_key: `discord:${msg.channel.id}:${msg.id}`
  };
}

export function renderActivities(activities = []) {
  return activities.map(a => {
    const emoji = ACTIVITY_EMOJI[a.tool] ?? '⚙️';
    return `${emoji} ${a.tool}: ${a.detail}`;
  }).join('\n');
}
