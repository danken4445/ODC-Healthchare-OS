import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  bookAppointment,
  getAvailableBookingSlots,
  getBookablePractitioners,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const serviceId = "22222222-2222-4222-8222-222222222222";
const practitionerRoleId = "33333333-3333-4333-8333-333333333333";
const slotId = "44444444-4444-4444-8444-444444444444";

test("doctor-first client contract validates privacy-safe practitioner and slot projections", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "bookable_practitioners") {
        return {
          data: [{
            practitioner_role_id: practitionerRoleId,
            display_name: "Dr. Ada Lovelace",
            specialty: "General practice",
            title: "MD",
            photo_url: null,
            total_price: 900,
            currency: "PHP",
          }],
          error: null,
        };
      }
      return {
        data: [{
          id: slotId,
          practitioner_role_id: practitionerRoleId,
          clinic_service_id: serviceId,
          service_type: "Consultation",
          start_at: "2026-10-04T01:00:00.000Z",
          end_at: "2026-10-04T01:30:00.000Z",
          display_name: "Dr. Ada Lovelace",
          specialty: "General practice",
          title: "MD",
          photo_url: null,
        }],
        error: null,
      };
    },
  });

  const practitioners = await getBookablePractitioners(client, serviceId);
  const slots = await getAvailableBookingSlots(client, {
    serviceId,
    practitionerRoleId,
    startsAt: new Date("2026-10-04T00:00:00.000Z"),
    endsAt: new Date("2026-10-05T00:00:00.000Z"),
  });

  assert.equal(practitioners.error, null);
  assert.equal(practitioners.data?.[0]?.total_price, 900);
  assert.equal(slots.error, null);
  assert.equal(slots.data?.[0]?.display_name, "Dr. Ada Lovelace");
  assert.deepEqual(calls, [
    { name: "bookable_practitioners", args: { p_service_id: serviceId } },
    {
      name: "get_available_slots",
      args: {
        p_service_id: serviceId,
        p_practitioner_role_id: practitionerRoleId,
        p_date_range: "[2026-10-04T00:00:00.000Z,2026-10-05T00:00:00.000Z)",
      },
    },
  ]);
});

test("bookAppointment maps the database conflict to the typed slot-taken result", async () => {
  const client = asClient({
    rpc: async () => ({
      data: null,
      error: { code: "PT409", message: "SLOT_TAKEN" },
    }),
  });

  const result = await bookAppointment(client, slotId);
  assert.deepEqual(result, {
    data: null,
    error: {
      code: "SLOT_TAKEN",
      message: "That appointment time was just taken. We refreshed the available times.",
    },
  });
});
