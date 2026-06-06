import registry from '../registry/agent-registry.js';

const ACTIVITY_EMOJI = {
  terminal:   '🖥️',
  write_file: '📄',
  read_file:  '📖',
  web_search: '🔍',
  api_call:   '🔗',
  mock:       '🤖'
};

function buildContextKey(event) {
  const type = event.channel_type === 'im' ? 'dm' : 'channel';
  const thread = event.thread_ts ?? 'root';
  return `slack:${type}:${event.channel}:${thread}`;
}

function extractText(event) {
  return event.text ?? '';
}

function resolveRouting(event, botAgentId) {
  const allIds = registry.getAllIds();

  if (event.channel_type === 'im') {
    return { to: [botAgentId], cc: [] };
  }

  const mentioned = new Set();
  for (const [, name] of extractText(event).matchAll(/@(\w+)/g)) {
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

export function buildEnvelope(event, botAgentId) {
  const context_key = buildContextKey(event);
  const { to, cc } = resolveRouting(event, botAgentId);

  return {
    context_key,
    routing: { to, cc },
    memory_scope: {
      space_key: context_key,
      persona_key: to[0] ?? null
    },
    payload: {
      origin_platform: 'slack',
      text: extractText(event),
      raw: event,
      _source_url: null
    },
    a2a: { enabled: false },
    idempotency_key: `slack:${event.channel}:${event.ts}`
  };
}

export function renderActivities(activities = []) {
  return activities.map(a => {
    const emoji = ACTIVITY_EMOJI[a.tool] ?? '⚙️';
    return `${emoji} ${a.tool}: ${a.detail}`;
  }).join('\n');
}
