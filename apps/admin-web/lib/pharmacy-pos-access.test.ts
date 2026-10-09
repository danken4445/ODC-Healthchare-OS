import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowLegacyPharmacyPos } from "./pharmacy-pos-access.ts";

test("keeps the legacy pharmacy POS hidden from encoder-only users", () => {
  assert.equal(
    shouldShowLegacyPharmacyPos(["can_encode_pharmacy_prescriptions"]),
    false,
  );
});

test("keeps the legacy pharmacy POS available to POS managers", () => {
  assert.equal(shouldShowLegacyPharmacyPos(["can_manage_pos"]), true);
});
