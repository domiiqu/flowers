# the post — a relay for the inhabitant's mailbox

iPhones give no app a way to read Messages. A Mac signed into the same
iMessage account does: it keeps every text in a local database, and its
Messages app can send. So the relay is a small script that runs on a Mac
that stays on, and it does two things, forever:

- **inbound** — a text arrives → it goes in the `Mail` table of the
  `life_emergent` base (`Status: waiting`, with a draft reply). On the
  inhabitant's page the mailbox flag goes up; he fetches it, reads it at his
  desk, and shows you the draft.
- **outbound** — you press *send* → the row becomes `approved` → the relay
  sends it through Messages, from your own number, and marks it `sent`.
  *Skip* marks it `skipped` and nothing goes out.

Nothing is sent that you did not approve on his desk. The relay never
sends on its own.

> Written before the Mac existed, so it has not been run against a real
> `chat.db` yet. The first run is a `--dry-run` for exactly that reason.

## what you need

- a Mac that stays awake, signed into Messages with your Apple ID (iMessage
  and, if you want texts from green bubbles too, *Text Message Forwarding*
  turned on from the iPhone: Settings → Messages → Text Message Forwarding)
- Node 18 or newer (`brew install node`)
- the base already planted with the `Mail` table — open Life Emergent →
  tend → *plant the base* once after this version is deployed; it adds
  any table the base is missing
- a personal access token for the base (the same one tend uses)
- optionally, an Anthropic API key, for the drafts

## set up

1. **Full Disk Access.** The script reads `~/Library/Messages/chat.db`,
   which macOS protects. System Settings → Privacy & Security → Full Disk
   Access → add **Terminal** (or whatever will run the script: iTerm, or
   `node` itself for the launchd job). Without this, every read fails with
   *unable to open database*.

2. **Automation.** The first send will ask whether Terminal may control
   Messages. Say yes (System Settings → Privacy & Security → Automation
   if you need to find it again).

3. **The settings file.** Secrets live in `~/.inhabitant/relay.env`, never
   in the repo:

   ```
   AIRTABLE_PAT=pat...
   AIRTABLE_BASE=app...
   ANTHROPIC_API_KEY=sk-ant-...      # optional — no key, no drafts
   # POLL_SECONDS=15
   # ONLY_FROM=+15551234567,+15557654321   # while trying it out: only these senders
   ```

4. **Names.** The database knows numbers, not people. A small file maps
   them, and it is what the page shows as *from*:

   `~/.inhabitant/names.json`
   ```json
   { "+15551234567": "sam", "mum@icloud.com": "mum" }
   ```

5. **Your voice** (optional, but the drafts are much better for it).
   `~/.inhabitant/voice.txt` — a few lines in your own words on how you
   text: *lowercase, short, "x" to close friends, never exclamation marks
   with my mother…* The draft is written as **you**, to the sender; he is
   only the one carrying it.

6. **The SDK** for drafting, installed beside the script (it is the one
   dependency, and it stays out of the repo):

   ```
   cd flowers/tending/relay && npm install @anthropic-ai/sdk
   ```

## try it

```
cd flowers/tending/relay
node mac-relay.mjs --dry-run --once
```

A dry run reads the database and prints what it *would* post and send,
and writes nothing. Send yourself a text from the iPhone, run it again,
and the text should appear in the output with a draft. Then drop
`--dry-run` and watch the row land in the base and the flag go up on his
page. Approve a draft on his desk and the relay sends it on its next
pass (every 15 s).

While you trust it in, set `ONLY_FROM` to your own number so only your
own texts are relayed.

## keep it running

```
cp com.flowers.inhabitant-relay.plist ~/Library/LaunchAgents/
# edit the two paths in it first — node, and where this repo lives
launchctl load ~/Library/LaunchAgents/com.flowers.inhabitant-relay.plist
tail -f /tmp/inhabitant-relay.log
```

`launchctl unload …` stops it. The Mac must not sleep: System Settings →
Energy → *Prevent automatic sleeping when the display is off*, or
`caffeinate`.

## how it keeps its place

`~/.inhabitant/state.json` holds the id of the last message seen. The
first run starts from the newest message, so the whole history does not
land in the box at once. Delete the file to start again from now.

## what it does not do (yet)

- **Attachments and reactions** arrive with no text and are skipped.
- **Group chats** are relayed with the group's name after the sender's,
  and a reply goes to the whole chat — tested on paper only.
- **Contacts** are not read; names come from `names.json`.
- The relay polls the base every 15 s for approvals; the page polls the
  base every 30 s for new mail. A text takes up to half a minute to reach
  the flag, and a reply up to 15 s to leave. Fine for post.
