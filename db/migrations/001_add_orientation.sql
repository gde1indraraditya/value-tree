-- Migration 001: per-tree layout orientation.
-- Existing trees keep the current vertical layout; new trees default to
-- horizontal (set explicitly by the app on insert).
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'vertical'
  CHECK (orientation IN ('vertical', 'horizontal'));
