import yaml from 'js-yaml';
import fs from 'fs';

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.system = {};
    this._load();
  }

  _load(configPath = './config/agents.yaml') {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8'));
    this.system = raw.system;
    this.agents.clear();
    for (const agent of raw.agents) {
      this.agents.set(agent.id, agent);
    }
  }

  load(configPath) {
    this._load(configPath);
  }

  exists(id)    { return this.agents.has(id); }
  getUrl(id)    { return this.agents.get(id)?.url; }
  getAllIds()   { return [...this.agents.keys()]; }
  getAgent(id)  { return this.agents.get(id); }
}

export default new AgentRegistry();
