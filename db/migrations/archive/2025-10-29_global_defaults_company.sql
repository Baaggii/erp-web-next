-- Ensure a global tenant row exists for shared defaults
INSERT INTO companies (id, name)
VALUES (0, 'Global Defaults')
ON DUPLICATE KEY UPDATE name = VALUES(name);
