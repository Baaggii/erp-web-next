-- Rename user level column typo
ALTER TABLE code_userlevel
  RENAME COLUMN userlever_id TO userlevel_id;
