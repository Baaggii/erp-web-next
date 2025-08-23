-- Track the last seen request counts for each user so notification
-- badges don't reappear after logout.
CREATE TABLE IF NOT EXISTS request_seen_counts (
  emp_id VARCHAR(10) PRIMARY KEY,
  incoming_pending INT NOT NULL DEFAULT 0,
  incoming_accepted INT NOT NULL DEFAULT 0,
  incoming_declined INT NOT NULL DEFAULT 0,
  outgoing_accepted INT NOT NULL DEFAULT 0,
  outgoing_declined INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_seen_emp FOREIGN KEY (emp_id) REFERENCES tbl_employment(employment_emp_id)
);
