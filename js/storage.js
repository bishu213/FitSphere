/**
 * storage.js
 * Simple localStorage session manager
 */

const Storage = (() => {
  const SESSIONS_KEY = "fitai_sessions_v1";

  function saveSession(session) {
    const list = loadAllSessions();
    list.unshift(session); // newest first
    if (list.length > 50) list.pop();
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
  }

  function loadAllSessions() {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch(e){ return []; }
  }

  function lastSession() {
    const list = loadAllSessions();
    return list.length ? list[0] : null;
  }

  return { saveSession, loadAllSessions, lastSession };
})();
