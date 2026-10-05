-- send.applescript — hand a reply to Messages.
--   osascript send.applescript buddy <handle> <text> [iMessage|SMS]
--   osascript send.applescript chat  <chat_identifier> <text>
-- the text comes in as an argument, never spliced into this source.
on run argv
	set kind to item 1 of argv
	set target to item 2 of argv
	set body to item 3 of argv
	tell application "Messages"
		if kind is "chat" then
			send body to chat id target
		else
			set svc to "iMessage"
			if (count of argv) ≥ 4 then set svc to item 4 of argv
			if svc is "SMS" then
				set theService to 1st account whose service type = SMS
			else
				set theService to 1st account whose service type = iMessage
			end if
			set theBuddy to participant target of theService
			send body to theBuddy
		end if
	end tell
end run
