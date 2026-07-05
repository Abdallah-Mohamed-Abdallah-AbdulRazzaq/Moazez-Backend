-- CreateEnum
CREATE TYPE "dismissal_request_status" AS ENUM ('REQUESTED', 'QUEUED', 'CALLED', 'MOVING', 'AT_GATE', 'READY', 'HANDED_OVER', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "dismissal_request_event_type" AS ENUM ('REQUEST_CREATED');

-- CreateTable
CREATE TABLE "dismissal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "status" "dismissal_request_status" NOT NULL DEFAULT 'REQUESTED',
    "client_request_id" VARCHAR(120),
    "parent_latitude" DECIMAL(9,6) NOT NULL,
    "parent_longitude" DECIMAL(9,6) NOT NULL,
    "distance_meters" INTEGER,
    "geofence_passed" BOOLEAN NOT NULL DEFAULT false,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dismissal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dismissal_request_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "type" "dismissal_request_event_type" NOT NULL,
    "actor_user_id" UUID,
    "status_from" "dismissal_request_status",
    "status_to" "dismissal_request_status",
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissal_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_idx" ON "dismissal_requests"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_status_idx" ON "dismissal_requests"("school_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_student_id_status_idx" ON "dismissal_requests"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_gate_id_status_idx" ON "dismissal_requests"("school_id", "gate_id", "status");

-- CreateIndex
CREATE INDEX "dismissal_requests_school_id_requested_at_idx" ON "dismissal_requests"("school_id", "requested_at");

-- CreateIndex
CREATE INDEX "dismissal_requests_requested_by_id_idx" ON "dismissal_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_guardian_id_idx" ON "dismissal_requests"("guardian_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_enrollment_id_idx" ON "dismissal_requests"("enrollment_id");

-- CreateIndex
CREATE INDEX "dismissal_requests_deleted_at_idx" ON "dismissal_requests"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_requests_id_school_id_key" ON "dismissal_requests"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_requests_school_id_requested_by_id_client_request_key" ON "dismissal_requests"("school_id", "requested_by_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissal_requests_one_active_per_student"
ON "dismissal_requests" ("school_id", "student_id")
WHERE "deleted_at" IS NULL
  AND "status" IN ('REQUESTED', 'QUEUED', 'CALLED', 'MOVING', 'AT_GATE', 'READY');

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_idx" ON "dismissal_request_events"("school_id");

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_request_id_created_at_idx" ON "dismissal_request_events"("school_id", "request_id", "created_at");

-- CreateIndex
CREATE INDEX "dismissal_request_events_school_id_type_created_at_idx" ON "dismissal_request_events"("school_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "dismissal_request_events_actor_user_id_idx" ON "dismissal_request_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "students"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_enrollment_id_school_id_fkey" FOREIGN KEY ("enrollment_id", "school_id") REFERENCES "student_enrollments"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_guardian_id_school_id_fkey" FOREIGN KEY ("guardian_id", "school_id") REFERENCES "guardians"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_requests" ADD CONSTRAINT "dismissal_requests_gate_id_school_id_fkey" FOREIGN KEY ("gate_id", "school_id") REFERENCES "dismissal_gates"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_request_id_school_id_fkey" FOREIGN KEY ("request_id", "school_id") REFERENCES "dismissal_requests"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissal_request_events" ADD CONSTRAINT "dismissal_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
