-- AlterTable
-- Safe: production table has zero rows at time of writing (verified via
-- GET /api/admin/users before authoring this migration). If this is ever
-- replayed against a table with existing rows, add a DEFAULT or backfill
-- first — a NOT NULL column with no default fails on non-empty tables.
ALTER TABLE "User" ADD COLUMN "age" INTEGER NOT NULL;
