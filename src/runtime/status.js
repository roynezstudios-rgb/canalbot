const startedAt = new Date().toISOString();

let socket = null;
let state = {
  status: 'starting',
  qrAvailable: false,
  qrUpdatedAt: null,
  phoneJid: null,
  lastError: null,
  updatedAt: startedAt,
  startedAt
};

export function updateRuntimeStatus(patch) {
  state = {
    ...state,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  return getRuntimeStatus();
}

export function getRuntimeStatus() {
  return { ...state };
}

export function setRuntimeSocket(nextSocket) {
  socket = nextSocket || null;
}

export function getRuntimeSocket() {
  return socket;
}
