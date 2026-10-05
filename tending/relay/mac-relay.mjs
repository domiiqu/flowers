#!/usr/bin/env node
// mac-relay.mjs — the post. Runs on a Mac that is signed into her
// Messages. It watches the Messages database for texts that arrive,
// drops each one in the Mail table of the life_emergent base (with a
// draft), and sends whatever she approves on the inhabitant's desk,
// through Messages itself. Nothing else touches her phone.
//
// Two loops, one process, no server:
//   inbound  — chat.db  →  Mail (Status: waiting, with a Draft)
//   outbound — Mail (Status: approved)  →  Messages  →  Mail (sent)
//
// Setup, permissions and the launchd job are in README.md beside this.
//
// Runs on the Node that ships with Homebrew or nodejs.org (18+). The one
// dependency is the Anthropic SDK, installed beside this file (see README);
// without it, or without a key, texts still arrive — just with no draft.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ config
// read from the environment, or from ~/.inhabitant/relay.env (KEY=value
// lines) so the launchd job needs no secrets in its plist.
const HOME = join(homedir(), '.inhabitant');
async function loadEnv() {
  try {
    const text = await readFile(join(HOME, 'relay.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no file — the environment will do */ }
}
await loadEnv();

const cfg = {
  pat: process.env.AIRTABLE_PAT,
  baseId: process.env.AIRTABLE_BASE,
  table: process.env.AIRTABLE_TABLE || 'Mail',
  chatDb: process.env.CHAT_DB || join(homedir(), 'Library/Messages/chat.db'),
  pollSeconds: Number(process.env.POLL_SECONDS || 15),
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.DRAFT_MODEL || 'claude-opus-5-5',
  statePath: join(HOME, 'state.json'),
  namesPath: join(HOME, 'names.json'),   // { "+15551234567": "sam", ... }
  voicePath: join(HOME, 'voice.txt'),    // how she writes, in her own words
  onlyFrom: (process.env.ONLY_FROM || '').split(',').map(s => s.trim()).filter(Boolean),
  dryRun: process.argv.includes('--dry-run'),
  once: process.argv.includes('--once'),
};
if (!cfg.pat || !cfg.baseId) {
  console.error('relay: AIRTABLE_PAT and AIRTABLE_BASE are needed (env, or ~/.inhabitant/relay.env)');
  process.exit(2);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------- state
// where we got to in chat.db, so a restart never re-delivers a text.
let state = { lastRowId: 0 };
async function loadState() {
  try { state = { ...state, ...JSON.parse(await readFile(cfg.statePath, 'utf8')) }; }
  catch { /* first run: start from now, not from the beginning of time */ }
}
async function saveState() {
  await mkdir(HOME, { recursive: true });
  await writeFile(cfg.statePath, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------- chat.db
// read through the sqlite3 that ships with macOS — read-only, so Messages
// is never blocked. Terminal (or whatever runs this) needs
// Full Disk Access to open the file at all.
async function sql(query) {
  const { stdout } = await exec('sqlite3', ['-json', '-readonly', cfg.chatDb, query], { maxBuffer: 1 << 24 });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

// Messages stamps dates as nanoseconds since 2001-01-01 (older macOS: seconds)
const APPLE_EPOCH = Date.UTC(2001, 0, 1);
function appleDate(n) {
  const v = Number(n || 0);
  const ms = v > 1e12 ? v / 1e6 : v * 1000;
  return new Date(APPLE_EPOCH + ms);
}

// newer macOS leaves `text` empty and keeps the words in `attributedBody`,
// an NSAttributedString archive. the string sits right after the NSString
// class marker: 0x2B, then its length (one byte, or 0x81 + two bytes
// little-endian), then the UTF-8. good enough for every text I've seen;
// anything stranger falls back to empty and the row still arrives.
export function textFromAttributedBody(hex) {
  if (!hex) return '';
  const buf = Buffer.from(hex, 'hex');
  const marker = buf.indexOf(Buffer.from('NSString'));
  if (marker < 0) return '';
  let i = buf.indexOf(0x2b, marker);
  if (i < 0) return '';
  i += 1;
  let len = buf[i];
  if (len === 0x81) { len = buf.readUInt16LE(i + 1); i += 3; }
  else if (len === 0x82) { len = buf.readUInt32LE(i + 1); i += 5; }
  else i += 1;
  return buf.subarray(i, i + len).toString('utf8');
}

async function newMessages() {
  const rows = await sql(`
    SELECT m.ROWID AS rowid, m.text, hex(m.attributedBody) AS body, m.date,
           h.id AS handle, c.chat_identifier AS chat, c.service_name AS service, c.display_name AS groupname
    FROM message m
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN chat c ON c.ROWID = cmj.chat_id
    WHERE m.is_from_me = 0 AND m.ROWID > ${Number(state.lastRowId)}
    ORDER BY m.ROWID ASC LIMIT 50`);
  return rows.map(r => ({
    rowid: r.rowid,
    text: (r.text || '').trim() || textFromAttributedBody(r.body),
    received: appleDate(r.date),
    handle: r.handle || '',
    chat: r.chat || r.handle || '',
    service: r.service || 'iMessage',
    group: r.chat && r.chat !== r.handle ? (r.groupname || r.chat) : '',
  }));
}

// the last few turns of that conversation, both ways, so a draft knows
// what it is answering
async function recentThread(chat, beforeRowId, n = 8) {
  const rows = await sql(`
    SELECT m.text, hex(m.attributedBody) AS body, m.is_from_me AS mine
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat c ON c.ROWID = cmj.chat_id
    WHERE c.chat_identifier = '${String(chat).replace(/'/g, "''")}' AND m.ROWID < ${Number(beforeRowId)}
    ORDER BY m.ROWID DESC LIMIT ${n}`);
  return rows.reverse()
    .map(r => ({ mine: !!r.mine, text: (r.text || '').trim() || textFromAttributedBody(r.body) }))
    .filter(r => r.text);
}

// ---------------------------------------------------------------- airtable
const API = 'https://api.airtable.com/v0';
async function at(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.pat}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`airtable ${res.status} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const T = `/${cfg.baseId}/${encodeURIComponent(cfg.table)}`;

async function upsertMail(fields) {
  return at(T, {
    method: 'PATCH',
    body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['Key'] }, records: [{ fields }] }),
  });
}
async function approvedMail() {
  const q = encodeURIComponent(`{Status} = 'approved'`);
  const out = await at(`${T}?filterByFormula=${q}&pageSize=20`);
  return out.records || [];
}
async function markMail(id, fields) {
  return at(`${T}/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}

// ------------------------------------------------------------------ names
let names = {};
async function loadNames() {
  try { names = JSON.parse(await readFile(cfg.namesPath, 'utf8')); } catch { names = {}; }
}
const nameOf = (handle) => names[handle] || handle;

// ---------------------------------------------------------------- drafting
// his draft of her reply. the draft goes out under her name, so it is
// written in her voice (voice.txt, if she has written one) — short, in
// the register the sender used, and never promising what only she knows.
let anthropic = null;
async function drafter() {
  if (anthropic !== null) return anthropic || null;
  if (!cfg.anthropicKey) { anthropic = false; return null; }
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  } catch (e) {
    log('no drafts: @anthropic-ai/sdk is not installed beside the relay —', e.message);
    anthropic = false;
  }
  return anthropic || null;
}

async function draftReply(msg, thread) {
  const client = await drafter();
  if (!client) return '';
  let voice = '';
  try { voice = (await readFile(cfg.voicePath, 'utf8')).trim(); } catch { /* none yet */ }
  const system = [
    'You draft a short text-message reply for the owner of this phone. She reads every draft and decides whether to send it; nothing goes out without her.',
    'Write as her, to the sender. Match the length and register of the sender — a one-line text gets a one-line reply. No sign-off, no emoji unless the sender uses them.',
    'Never invent facts, plans, or commitments she has not stated in the thread. When the text asks for something only she can know (a time, a decision, a recipe), draft a warm holding reply instead of guessing.',
    'Reply with the message text only — no quotes, no preamble.',
    voice ? `How she writes, in her words:\n${voice}` : '',
  ].filter(Boolean).join('\n\n');
  const lines = thread.map(t => `${t.mine ? 'her' : nameOf(msg.handle)}: ${t.text}`);
  lines.push(`${nameOf(msg.handle)}: ${msg.text}`);
  const user = `${msg.group ? `Group chat "${msg.group}". ` : ''}The conversation so far, newest last:\n\n${lines.join('\n')}\n\nDraft her reply to the last message.`;
  try {
    const res = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 400,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') return '';
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (e) {
    log('draft failed:', e.message);
    return '';
  }
}

// ----------------------------------------------------------------- sending
// through Messages itself, by AppleScript, so it goes from her own number
// on the same service the text came in on. The script takes its arguments
// rather than having them spliced into its source, so a reply with a
// quote mark in it is just a reply.
async function sendMessage({ handle, chat, service, group }, text) {
  if (cfg.dryRun) { log('dry run — would send to', handle || chat, ':', text); return; }
  const script = join(HERE, 'send.applescript');
  const args = group ? ['chat', chat, text] : ['buddy', handle, text, service === 'SMS' ? 'SMS' : 'iMessage'];
  await exec('osascript', [script, ...args], { timeout: 30000 });
}

// ------------------------------------------------------------------- loops
async function inbound() {
  const msgs = await newMessages();
  for (const m of msgs) {
    state.lastRowId = Math.max(state.lastRowId, m.rowid);
    if (!m.text) continue;                                      // a bare attachment, a reaction
    if (cfg.onlyFrom.length && !cfg.onlyFrom.includes(m.handle)) continue;
    const thread = await recentThread(m.chat, m.rowid).catch(() => []);
    const draft = await draftReply(m, thread);
    const fields = {
      Key: `imsg:${m.rowid}`,
      From: m.group ? `${nameOf(m.handle)} · ${m.group}` : nameOf(m.handle),
      Handle: m.group ? m.chat : m.handle,
      Text: m.text,
      Received: m.received.toISOString(),
      Status: 'waiting',
    };
    if (draft) fields.Draft = draft;
    if (cfg.dryRun) log('dry run — would post:', fields);
    else await upsertMail(fields);
    log('in the box:', fields.From, '—', m.text.slice(0, 60));
  }
  if (msgs.length) await saveState();
}

const routes = new Map(); // Key → {handle, chat, service, group}, from inbound in this run
async function outbound() {
  const approved = await approvedMail();
  for (const rec of approved) {
    const f = rec.fields;
    const reply = String(f.Reply || '').trim();
    if (!reply) { await markMail(rec.id, { Status: 'failed' }); continue; }
    const rowid = Number((String(f.Key || '').match(/^imsg:(\d+)$/) || [])[1]);
    // where it goes back: by the message's own chat, looked up fresh, so
    // a reply works across restarts and for the group chats too
    let route = routes.get(f.Key);
    if (!route && rowid) {
      const rows = await sql(`
        SELECT h.id AS handle, c.chat_identifier AS chat, c.service_name AS service, c.display_name AS groupname
        FROM message m
        LEFT JOIN handle h ON h.ROWID = m.handle_id
        LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        LEFT JOIN chat c ON c.ROWID = cmj.chat_id
        WHERE m.ROWID = ${rowid}`);
      const r = rows[0];
      if (r) route = { handle: r.handle || '', chat: r.chat || r.handle, service: r.service || 'iMessage', group: r.chat && r.chat !== r.handle ? (r.groupname || r.chat) : '' };
    }
    if (!route && f.Handle) route = { handle: f.Handle, chat: f.Handle, service: 'iMessage', group: '' };
    if (!route) { log('cannot route', f.Key); await markMail(rec.id, { Status: 'failed' }); continue; }
    try {
      await sendMessage(route, reply);
      if (!cfg.dryRun) await markMail(rec.id, { Status: 'sent', Decided: new Date().toISOString() });
      log('sent to', f.From, '—', reply.slice(0, 60));
    } catch (e) {
      log('send failed for', f.From, '—', e.message);
      await markMail(rec.id, { Status: 'failed' });
    }
  }
}

async function tick() {
  try { await inbound(); } catch (e) { log('inbound:', e.message); }
  try { await outbound(); } catch (e) { log('outbound:', e.message); }
}

// --------------------------------------------------------------------- main
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await loadState(); await loadNames();
  if (!state.lastRowId) {
    // first run: start at the newest message, so the whole history does
    // not land in the box at once
    const [{ top } = { top: 0 }] = await sql('SELECT MAX(ROWID) AS top FROM message');
    state.lastRowId = Number(top || 0);
    await saveState();
    log('first run — watching from message', state.lastRowId);
  }
  log(`relay up · base ${cfg.baseId} · every ${cfg.pollSeconds}s${cfg.dryRun ? ' · DRY RUN' : ''}${cfg.anthropicKey ? ` · drafting with ${cfg.model}` : ' · no drafts (no ANTHROPIC_API_KEY)'}`);
  await tick();
  if (!cfg.once) setInterval(tick, cfg.pollSeconds * 1000);
}
