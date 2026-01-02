## JSON conversion 504 troubleshooting playbook

Use this checklist to identify whether JSON conversions fail due to permissions, SQL mistakes, or timeouts.

### 1) Inspect API and MySQL logs

* API server logs every conversion attempt to `api-server/logs/json_conversion.log` (or the path in `JSON_CONVERSION_LOG_PATH`). Each entry includes run ID, table, columns, statement count, any failed statement, and the SQL error code.
  ```bash
  # Show the most recent entries
  tail -n 50 api-server/logs/json_conversion.log | jq .
  ```
* Standard API errors still go to `api-server/logs/error.log`.
* MySQL error logs help distinguish privilege vs. syntax vs. long-running operations. On Ubuntu/Debian this is often `/var/log/mysql/error.log`; on Amazon Linux it may be under `/var/log/mysqld.log` or available via `journalctl -u mysql`.
  ```bash
  sudo tail -f /var/log/mysql/error.log
  # or, on systemd hosts
  sudo journalctl -u mysql -f
  ```

### 2) Increase timeouts when long ALTER TABLEs are legitimate

* The API server now accepts timeout tuning:
  * `SERVER_TIMEOUT_MS` — request timeout (default 900000 ms / 15 minutes)
  * `SERVER_HEADERS_TIMEOUT_MS` — headers timeout (defaults to `SERVER_TIMEOUT_MS + 5000`)
  * `SERVER_KEEP_ALIVE_TIMEOUT_MS` — keep-alive socket timeout (default 120000)
* PM2 config (`ecosystem.config.js`) sets these by default. If you need to override them in production, adjust the env block and redeploy with `pm2 reload ecosystem.config.js`.
* Nginx must allow the same window; raise `proxy_read_timeout` (and optionally `proxy_send_timeout`) on the upstream location that fronts the API.
  ```nginx
  location /api/ {
      proxy_pass http://localhost:3002;
      proxy_read_timeout 900s;
      proxy_send_timeout 900s;
  }
  ```
* If the ALTER is expected to take even longer, consider running it as a background job and calling `/api/json_conversion/convert` with `"runNow": false` to capture the script without executing.

### 3) Test against a small table first

* Choose a small table with a single foreign key (e.g., `sample_child` referencing `sample_parent`) and attempt conversion there. If it succeeds quickly, timeouts are the likely culprit.
* If it fails immediately, inspect the generated statements in the API response and in the log:
  * Confirm DROP/ADD constraint names match `information_schema.KEY_COLUMN_USAGE`.
  * Verify the generated column definitions mirror your actual schema (especially `ON UPDATE` and default clauses).

### 4) Collect details before retrying

When a conversion fails, capture:
* The `runId`, `failedStatementIndex`, and `failedStatement` from `api-server/logs/json_conversion.log`.
* The MySQL error code/SQLSTATE from the same log entry.
* Whether Nginx/PM2 timeouts were hit (check upstream and PM2 logs for timeout messages).

With these details you can decide whether to fix SQL, grant privileges, or simply allow more time.
