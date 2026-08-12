const response = await fetch('http://127.0.0.1:3210/api/v1/shutdown', { method: 'POST' }).catch(() => null);

if (!response) {
  console.log('CanalBot local no está encendido.');
  process.exit(0);
}

if (!response.ok) {
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || `No se pudo apagar CanalBot local (${response.status}).`);
}

console.log('CanalBot local se está apagando.');
