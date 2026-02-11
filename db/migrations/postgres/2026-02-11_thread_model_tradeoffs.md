# Thread model tradeoffs: adjacency list vs closure table

## Adjacency list (`messages.parent_message_id`)

### Pros
- Simple write path: each message stores only direct parent.
- Lower storage overhead for shallow trees.
- Easy to enforce max depth with trigger (`parent.reply_depth + 1`).
- Works naturally for chat UIs that load one branch at a time.

### Cons
- Recursive CTE required for full subtree expansion.
- Aggregate queries (descendant counts) are slower on deep trees.
- Moving subtrees is expensive and error-prone.

## Closure table (`message_closure(ancestor_id, descendant_id, depth)`)

### Pros
- Fast subtree and ancestor lookups with straightforward indexed queries.
- Excellent for analytics (counts per branch, permission inheritance).
- No recursive CTE needed for common read patterns.

### Cons
- Write amplification: each insert requires multiple closure rows.
- Higher storage cost.
- More complex transactional maintenance logic.

## Recommendation for this migration

Use adjacency list now because conversational threads are typically shallow and capped (max depth = 3). If depth limits increase significantly or analytics become primary workload, add a closure table as a derived projection maintained by triggers/jobs.
