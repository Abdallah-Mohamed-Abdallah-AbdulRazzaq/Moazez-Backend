-- Extend timetable scope without rewriting existing enum values or scope keys.
ALTER TYPE "timetable_scope_type" ADD VALUE 'STAGE' AFTER 'TERM';

ALTER TABLE "timetable_configs" ADD COLUMN "stage_id" UUID;

-- Refuse to guess ancestry when a legacy nested scope contradicts the
-- tenant-local Grade -> Section -> Classroom hierarchy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "timetable_configs" AS tc
    LEFT JOIN "grades" AS g
      ON g."id" = tc."grade_id"
     AND g."school_id" = tc."school_id"
    WHERE tc."scope_type" = 'GRADE'
      AND (
        tc."grade_id" IS NULL
        OR tc."section_id" IS NOT NULL
        OR tc."classroom_id" IS NOT NULL
        OR g."id" IS NULL
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Cannot backfill timetable stage scope: invalid GRADE hierarchy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "timetable_configs" AS tc
    LEFT JOIN "sections" AS s
      ON s."id" = tc."section_id"
     AND s."school_id" = tc."school_id"
    LEFT JOIN "grades" AS g
      ON g."id" = tc."grade_id"
     AND g."school_id" = tc."school_id"
    WHERE tc."scope_type" = 'SECTION'
      AND (
        tc."grade_id" IS NULL
        OR tc."section_id" IS NULL
        OR tc."classroom_id" IS NOT NULL
        OR s."id" IS NULL
        OR g."id" IS NULL
        OR s."grade_id" <> g."id"
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Cannot backfill timetable stage scope: invalid SECTION hierarchy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "timetable_configs" AS tc
    LEFT JOIN "classrooms" AS c
      ON c."id" = tc."classroom_id"
     AND c."school_id" = tc."school_id"
    LEFT JOIN "sections" AS s
      ON s."id" = tc."section_id"
     AND s."school_id" = tc."school_id"
    LEFT JOIN "grades" AS g
      ON g."id" = tc."grade_id"
     AND g."school_id" = tc."school_id"
    WHERE tc."scope_type" = 'CLASSROOM'
      AND (
        tc."grade_id" IS NULL
        OR tc."section_id" IS NULL
        OR tc."classroom_id" IS NULL
        OR c."id" IS NULL
        OR s."id" IS NULL
        OR g."id" IS NULL
        OR c."section_id" <> s."id"
        OR s."grade_id" <> g."id"
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Cannot backfill timetable stage scope: invalid CLASSROOM hierarchy';
  END IF;
END $$;

-- Populate the canonical stage from the deepest authoritative ancestor for
-- every existing nested scope. TERM rows intentionally remain NULL.
UPDATE "timetable_configs" AS tc
SET "stage_id" = g."stage_id"
FROM "grades" AS g
WHERE tc."scope_type" = 'GRADE'
  AND g."id" = tc."grade_id"
  AND g."school_id" = tc."school_id";

UPDATE "timetable_configs" AS tc
SET "stage_id" = g."stage_id"
FROM "sections" AS s
JOIN "grades" AS g
  ON g."id" = s."grade_id"
 AND g."school_id" = s."school_id"
WHERE tc."scope_type" = 'SECTION'
  AND s."id" = tc."section_id"
  AND s."school_id" = tc."school_id";

UPDATE "timetable_configs" AS tc
SET "stage_id" = g."stage_id"
FROM "classrooms" AS c
JOIN "sections" AS s
  ON s."id" = c."section_id"
 AND s."school_id" = c."school_id"
JOIN "grades" AS g
  ON g."id" = s."grade_id"
 AND g."school_id" = s."school_id"
WHERE tc."scope_type" = 'CLASSROOM'
  AND c."id" = tc."classroom_id"
  AND c."school_id" = tc."school_id";

CREATE INDEX "timetable_configs_stage_id_idx" ON "timetable_configs"("stage_id");

ALTER TABLE "timetable_configs"
ADD CONSTRAINT "timetable_configs_stage_id_school_id_fkey"
FOREIGN KEY ("stage_id", "school_id")
REFERENCES "stages"("id", "school_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
