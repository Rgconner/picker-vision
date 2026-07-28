/**
 * useRemoteLogger — ships browser console output to the server so remote
 * diagnosis does not require physical access to the device.
 *
 * Call remoteLog(pickerId, level, message) anywhere in the app.
 * Lines are batched and POSTed to POST /api/debug/logs/{picker_id} every 3s.
 * Retrieve via GET /api/debug/logs/{picker_id} (no auth required).
 */

const _queue: { level: string; message: string }[] = [];
let   _flushTimer: ReturnType<typeof setTimeout> | null = null;
let   _currentPickerId: string | null = null;

async function _flush() {
  _flushTimer = null;
  if (!_currentPickerId || _queue.length === 0) return;
  const lines = _queue.splice(0, _queue.length);
  try {
    await fetch(`/api/debug/logs/${_currentPickerId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lines }),
    });
  } catch { /* best-effort — never throw from background logger */ }
}

function _schedule() {
  if (!_flushTimer) _flushTimer = setTimeout(_flush, 3000);
}

export function setRemoteLogPickerId(pickerId: string | null) {
  _currentPickerId = pickerId;
}

export function remoteLog(level: 'info' | 'warn' | 'error', message: string) {
  if (!_currentPickerId) return;
  _queue.push({ level, message });
  _schedule();
}
