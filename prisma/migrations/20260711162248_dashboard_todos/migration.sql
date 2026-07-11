-- CreateEnum
CREATE TYPE "dashboard_todo_status" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "dashboard_todo_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateTable
CREATE TABLE "dashboard_todos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "notes" VARCHAR(1000),
    "status" "dashboard_todo_status" NOT NULL DEFAULT 'PENDING',
    "priority" "dashboard_todo_priority" NOT NULL DEFAULT 'NORMAL',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dashboard_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_todos_school_id_owner_user_id_date_deleted_at_idx" ON "dashboard_todos"("school_id", "owner_user_id", "date", "deleted_at");

-- CreateIndex
CREATE INDEX "dashboard_todos_school_id_owner_user_id_status_deleted_at_idx" ON "dashboard_todos"("school_id", "owner_user_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "dashboard_todos_owner_user_id_idx" ON "dashboard_todos"("owner_user_id");

-- AddForeignKey
ALTER TABLE "dashboard_todos" ADD CONSTRAINT "dashboard_todos_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_todos" ADD CONSTRAINT "dashboard_todos_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
