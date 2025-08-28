-- Ensure notifications related_id references pending_request

-- Clean up notifications with missing pending_request
DELETE n FROM notifications n
LEFT JOIN pending_request p ON n.related_id = p.request_id
WHERE p.request_id IS NULL;

-- Add foreign key constraint linking notifications to pending_request
ALTER TABLE notifications
  ADD KEY idx_notifications_request (related_id),
  ADD CONSTRAINT fk_notifications_request FOREIGN KEY (related_id)
    REFERENCES pending_request(request_id);
