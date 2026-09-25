-- 008: Reliable email intake.
--
-- Mail is now ingested in two steps: the poller stores each fetched message
-- (processed = false) before marking it read in the mailbox, and a time-bounded
-- drainer processes the stored queue. These columns let the drainer claim rows
-- safely and stop retrying a message that keeps failing (poison message).
-- Additive only; compatible with the currently deployed code.

BEGIN;

UPDATE public.emails SET processed = false WHERE processed IS NULL;
ALTER TABLE public.emails ALTER COLUMN processed SET DEFAULT false;
ALTER TABLE public.emails ALTER COLUMN processed SET NOT NULL;

ALTER TABLE public.emails
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  ADD COLUMN processing_error text CHECK (processing_error IS NULL OR char_length(processing_error) <= 1000),
  ADD COLUMN last_attempt_at timestamptz;

CREATE INDEX emails_intake_queue_idx ON public.emails (received_at)
  WHERE NOT processed;

COMMIT;
