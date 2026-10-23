-- Additive only. Existing activities retain an empty tag list.
ALTER TABLE "Event" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
