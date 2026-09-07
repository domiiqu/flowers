// gcal.js — Google Calendar, straight from the browser. No server and no
// secret: a *public* OAuth Client ID (set in tend) plus Google Identity
// Services' token client. The access token lives in memory and
// sessionStorage only — same trust model as the Airtable PAT, and just as
// easy to revoke (close the tab, or disconnect in tend).

import { getSettings } from './store.js?v=4';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = 'tending.gcal.token';

let gisReady = null;
let tokenClient = null;
let token = null; // { access_token, expiry(ms) }

function clientId() { return (getSettings().gcalClientId || '').trim(); }
export function configured() { return !!clientId(); }

function loadToken() {
  if (token && token.expiry > Date.now() + 5000) return token;
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (t && t.expiry > Date.now() + 5000) { token = t; return t; }
  } catch {}
  return null;
}
export function connected() { return !!loadToken(); }

function loadGIS() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('could not reach Google sign-in'));
    document.head.appendChild(s);
  });
  return gisReady;
}

async function ensureTokenClient() {
  const id = clientId();
  if (!id) throw new Error('add a Google client id in tend first');
  await loadGIS();
  if (!tokenClient || tokenClient.__id !== id) {
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: () => {} });
    tokenClient.__id = id;
  }
  return tokenClient;
}

// interactive sign-in — must be triggered by a tap (Google opens a popup)
export async function connect() {
  const tc = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    tc.callback = (resp) => {
      if (resp && resp.access_token) {
        token = { access_token: resp.access_token, expiry: Date.now() + (resp.expires_in || 3600) * 1000 };
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch {}
        resolve(true);
      } else {
        reject(new Error(resp && resp.error ? resp.error : 'sign-in failed'));
      }
    };
    try { tc.requestAccessToken({ prompt: connected() ? '' : 'consent' }); }
    catch (e) { reject(e); }
  });
}

export function disconnect() {
  token = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

async function api(path, opts = {}) {
  const t = loadToken();
  if (!t) throw new Error('not connected');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (res.status === 401) { disconnect(); throw new Error('the google session expired — connect again'); }
  if (!res.ok) {
    let d = '';
    try { d = JSON.stringify((await res.json()).error); } catch {}
    throw new Error(`google ${res.status} — ${d || res.statusText}`);
  }
  return res.json();
}

// the day's events, normalized to { id, time('HH:MM'|''), title, allDay },
// sorted all-day first then by clock
export async function listEvents(dateISO) {
  const start = new Date(dateISO + 'T00:00:00');
  const end = new Date(dateISO + 'T23:59:59');
  const params = new URLSearchParams({
    timeMin: start.toISOString(), timeMax: end.toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
  });
  const data = await api(`/calendars/primary/events?${params.toString()}`);
  return (data.items || []).map((e) => {
    const allDay = !!(e.start && e.start.date && !e.start.dateTime);
    let time = '';
    if (!allDay && e.start && e.start.dateTime) {
      const d = new Date(e.start.dateTime);
      time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return { id: e.id, time, title: e.summary || '(untitled)', allDay };
  }).sort((a, b) => (a.allDay === b.allDay ? a.time.localeCompare(b.time) : a.allDay ? -1 : 1));
}

// create a one-hour timed event on the given local day
export async function createEvent(dateISO, { title, time }) {
  const startD = new Date(`${dateISO}T${time || '09:00'}:00`);
  const endD = new Date(startD.getTime() + 60 * 60 * 1000);
  return api('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: title || '(untitled)',
      start: { dateTime: startD.toISOString() },
      end: { dateTime: endD.toISOString() },
    }),
  });
}
