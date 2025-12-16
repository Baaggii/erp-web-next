# Temporary transaction chain detection

This document explains how transaction chains are detected and preserved when temporary submissions move through creation, senior forwarding, and final senior actions.

## When chain detection runs

1. **Creation** – during `createTemporaryTransaction`, the service resolves forward metadata before inserting a row to decide whether the new temporary should attach to an existing chain or start one.
2. **Forwarding senior actions** – inside `reviewTemporaryTransaction`, chain resolution runs when a reviewer chooses **Save as Temporary** (forward) to ensure the forwarded record reuses the correct chain.
3. **Final senior actions** – in the same review flow, chain updates occur when the reviewer promotes/rejects without forwarding to mark every row in the chain with the final status.

## How detection works in each path

### Creation path

- Forwarding metadata is parsed with `resolveForwardMeta`, which pulls `chainIds`, `rootTemporaryId`, and `parentTemporaryId` from `payload.forwardMeta`, normalizes them, and remembers the origin creator. It automatically adds the current submission ID as a chain candidate when available.
- `resolveExternalChainId` picks the smallest valid chain candidate that differs from the current row ID so inserts reuse an existing chain when one is forwarded in the payload.
- If the payload points to a parent temporary but no chain has been chosen yet, the service selects the parent’s `chain_id` via `SELECT chain_id FROM temporary_transactions WHERE id = ? LIMIT 1 FOR UPDATE` to keep the child on the same chain.
- When a senior is present but no chain was resolved, the code checks whether the senior also has a senior (`getEmploymentSession`), setting `chainShouldExist` so the insert later assigns its own ID as the chain to start a new chain tree when required.
- Before inserting, the code verifies the chosen chain ID exists and that no other pending temporary already uses it (`SELECT id FROM temporary_transactions WHERE chain_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE`). The row is then inserted with the resolved chain, and if a chain should exist but none was supplied the service updates the new row’s `chain_id` to its own ID.

### Forwarding senior actions (Save as Temporary)

- The reviewer flow reloads the row and parses `forwardMeta` again via `resolveForwardMeta`, then expands it with `expandForwardMeta` to include the current row as `parentTemporaryId`, fill missing roots, and merge any provided `chainIds`.
- `resolveExternalChainId` is used a second time to compute `resolvedChainId`; if missing, the code attempts a fallback from the stored `chain_id`. Missing chains block forwarding with a 409 error to prevent breaking the chain.
- The handler verifies exclusivity by checking that no other pending row already uses the candidate chain (`SELECT id FROM temporary_transactions WHERE chain_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE`).
- When forwarding proceeds, `updateTemporaryChainStatus` marks the existing rows in the chain as promoted/forwarded and `forwardMeta` is rewritten to include the chosen `chainId` so the newly inserted forwarded row keeps the same chain.

### Final senior actions (promote/reject without forwarding)

- The promotion path shares the same chain resolution as forwarding but simply promotes or rejects without inserting a new temporary. The resolved chain ID is used to update every row in the chain through `updateTemporaryChainStatus`, clearing reviewer assignments and setting `reviewed_by`, `reviewed_at`, `review_notes`, and `promoted_record_id` where applicable.
- If a chain cannot be resolved, the update falls back to the specific temporary ID so only the current row is marked, preventing accidental cross-chain updates.

## Functions and fields involved

- **Functions:** `resolveForwardMeta`, `resolveExternalChainId`, `expandForwardMeta`, `updateTemporaryChainStatus`, and `reviewTemporaryTransaction` (for review-time chain enforcement).
- **Fields inspected:** `payload.forwardMeta.chainIds`, `payload.forwardMeta.rootTemporaryId`, `payload.forwardMeta.parentTemporaryId`, the current temporary’s `id`, and stored `chain_id` values looked up via `SELECT chain_id FROM temporary_transactions WHERE id = ?` queries.
- **Uniqueness checks:** pending-state exclusivity uses `SELECT id FROM temporary_transactions WHERE chain_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE` before both creation and forwarding to avoid duplicate pending rows on the same chain.
