process.env.WA_DRY_RUN = 'true';
process.env.WA_ENABLE_CONNECT = 'true';
process.env.CANALBOT_ENABLE = 'false';
process.env.CANALBOT_PUBLISH_ENABLED = 'false';
process.env.CANALBOT_DASHBOARD_ENABLED = 'true';
process.env.CANALBOT_DASHBOARD_HOST ||= '127.0.0.1';
process.env.CANALBOT_DASHBOARD_PORT ||= '3210';

console.log('CanalBot local: vinculacion habilitada; comandos y publicaciones reales bloqueados.');
await import('../src/index.js');
