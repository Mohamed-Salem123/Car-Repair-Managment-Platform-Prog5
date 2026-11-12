-- Make plate numbers unique across the whole database.
-- Existing duplicate plates (if any) are renamed by appending the record id,
-- keeping the oldest record per plate, so the unique index can be created safely.

UPDATE "vehicles"
SET "plateNumber" = "plateNumber" || '-' || "id"
WHERE "id" NOT IN (
  SELECT MIN("id") FROM "vehicles" GROUP BY "plateNumber"
);

CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");
