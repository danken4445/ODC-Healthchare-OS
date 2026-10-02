import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  getWaitingRoomQueue,
  roomAssignmentInputSchema,
  saveRoomAssignment,
  subscribeToWaitingRoomQueue,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "22222222-2222-4222-8222-222222222222";
const practitionerRoleId = "33333333-3333-4333-8333-333333333333";
const roomId = "44444444-4444-4444-8444-444444444444";

test("room assignment input keeps date/time and UUID validation at the client boundary", () => {
  assert.equal(
    roomAssignmentInputSchema.safeParse({
      organizationId,
      practitionerRoleId,
      roomId,
      date: "2026-10-02",
      shiftStart: "08:00",
      shiftEnd: "17:00",
    }).success,
    true,
  );
  assert.equal(
    roomAssignmentInputSchema.safeParse({
      organizationId,
      practitionerRoleId,
      roomId,
      date: "02/10/2026",
      shiftStart: "8am",
      shiftEnd: "17:00",
    }).success,
    false,
  );
});

test("saveRoomAssignment removes the prior doctor-day assignment before inserting the replacement", async () => {
  const calls: Array<{ method: string; args?: unknown }> = [];
  const deleteQuery = {
    eq: (column: string, value: unknown) => {
      calls.push({ method: `delete.eq.${column}`, args: value });
      return column === "date" ? { data: null, error: null } : deleteQuery;
    },
  };
  const insertQuery = {
    select: () => insertQuery,
    single: async () => ({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: organizationId,
        practitioner_role_id: practitionerRoleId,
        room_id: roomId,
        date: "2026-10-02",
        shift_start: "08:00:00",
        shift_end: "17:00:00",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
      },
      error: null,
    }),
  };
  const client = asClient({
    from: (table: string) => {
      calls.push({ method: `from.${table}` });
      return table === "room_assignments"
        ? {
            delete: () => deleteQuery,
            insert: (row: unknown) => {
              calls.push({ method: "insert", args: row });
              return insertQuery;
            },
          }
        : undefined;
    },
  });

  const result = await saveRoomAssignment(client, {
    organizationId,
    practitionerRoleId,
    roomId,
    date: "2026-10-02",
    shiftStart: "08:00",
    shiftEnd: "17:00",
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.room_id, roomId);
  assert.deepEqual(calls.slice(0, 4), [
    { method: "from.room_assignments" },
    { method: "delete.eq.organization_id", args: organizationId },
    { method: "delete.eq.practitioner_role_id", args: practitionerRoleId },
    { method: "delete.eq.date", args: "2026-10-02" },
  ]);
});

test("queue projection exposes doctor and room metadata while keeping appointment_id as the row key", async () => {
  let selected = "";
  const queue = [{
    appointment_id: "66666666-6666-4666-8666-666666666666",
    organization_id: organizationId,
    queue_date: "2026-10-02",
    queue_number: 1,
    queue_label: "A-001",
    practitioner_display_name: "Dr. Queue",
    room_label: "Room 1",
    service_name: "Consultation",
    scheduled_at: "2026-10-02T01:00:00Z",
    stage: "waiting",
  }];
  const query = {
    select: (columns: string) => {
      selected = columns;
      return query;
    },
    eq: () => query,
    order: async () => ({ data: queue, error: null }),
  };
  const client = asClient({ from: () => query });
  const result = await getWaitingRoomQueue(client, organizationId, new Date("2026-10-02T00:00:00Z"));
  assert.equal(result.error, null);
  assert.equal(result.data?.[0]?.appointment_id, queue[0].appointment_id);
  assert.equal(result.data?.[0]?.room_label, "Room 1");
  assert.match(selected, /practitioner_display_name/);
  assert.match(selected, /room_label/);
});

test("waiting-room Realtime subscription remains organization-scoped", () => {
  let filter = "";
  let removed = false;
  const channel = {
    on: (_event: string, config: { filter: string }) => {
      filter = config.filter;
      return channel;
    },
    subscribe: () => channel,
  };
  const client = asClient({
    channel: () => channel,
    removeChannel: async () => {
      removed = true;
    },
  });
  const unsubscribe = subscribeToWaitingRoomQueue(client, organizationId, () => undefined);
  unsubscribe();
  assert.equal(filter, `organization_id=eq.${organizationId}`);
  return new Promise<void>((resolve) => {
    setImmediate(() => {
      assert.equal(removed, true);
      resolve();
    });
  });
});
