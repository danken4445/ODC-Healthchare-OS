import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAdminDestination, getAdminRouteRule } from "./admin-access.ts";

test("encoder-only staff can access the pharmacy POS route", () => {
  const rule = getAdminRouteRule("/pos");

  assert.ok(rule);
  assert.equal(canAccessAdminDestination(rule, ["can_encode_pharmacy_prescriptions"], false), true);
  assert.equal(canAccessAdminDestination(rule, ["can_view_inventory"], false), false);
});
