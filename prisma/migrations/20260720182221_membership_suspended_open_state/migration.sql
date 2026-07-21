-- MembershipStatus.SUSPENDED represents an open but access-disabled
-- membership lifecycle state. Prisma cannot express this CHECK constraint.

ALTER TABLE "memberships"
    DROP CONSTRAINT "memberships_ended_at_required_when_inactive_check";

ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_ended_at_required_when_inactive_check"
    CHECK (
        "status" IN ('ACTIVE', 'SUSPENDED')
        OR "ended_at" IS NOT NULL
    );
