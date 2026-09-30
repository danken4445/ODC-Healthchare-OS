import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  getDailyAppointmentQueue,
  getProviderAppointmentSlots,
} from "../src/index.ts";

type QueryResult = {
  data: unknown;
  error: null | { code?: string; message: string };
};
type QueryCall = { method: string; args: unknown[] };

class QueryMock implements PromiseLike<QueryResult> {
  readonly calls: QueryCall[] = [];
  private readonly result: QueryResult;

  constructor(result: QueryResult) {
    this.result = result;
  }

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select(...args: unknown[]): this {
    return this.record("select", args);
  }
  eq(...args: unknown[]): this {
    return this.record("eq", args);
  }
  gte(...args: unknown[]): this {
    return this.record("gte", args);
  }
  lt(...args: unknown[]): this {
    return this.record("lt", args);
  }
  in(...args: unknown[]): this {
    return this.record("in", args);
  }
  order(...args: unknown[]): this {
    return this.record("order", args);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

function hasCall(
  query: QueryMock,
  method: string,
  ...args: unknown[]
): boolean {
  return query.calls.some(
    (call) => call.method === method && isDeepStrictEqual(call.args, args),
  );
}

test("mine scope resolves the active role and filters the slot query", async () => {
  const slotRows = [{ id: "slot-a" }];
  const slots = new QueryMock({ data: slotRows, error: null });
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const fromCalls: string[] = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: "role-a", error: null };
    },
    from: (table: string) => {
      fromCalls.push(table);
      return slots;
    },
  });
  const from = new Date("2099-01-02T03:04:05.000Z");

  const result = await getProviderAppointmentSlots(client, "org-a", {
    scope: "mine",
    from,
  });

  assert.deepEqual(result, { data: slotRows, error: null });
  assert.deepEqual(rpcCalls, [
    {
      name: "get_current_provider_role_id",
      args: { p_organization_id: "org-a" },
    },
  ]);
  assert.deepEqual(fromCalls, ["appointment_slots"]);
  assert.equal(hasCall(slots, "eq", "organization_id", "org-a"), true);
  assert.equal(hasCall(slots, "gte", "start_at", from.toISOString()), true);
  assert.equal(hasCall(slots, "eq", "practitioner_role_id", "role-a"), true);
  assert.equal(hasCall(slots, "order", "start_at", { ascending: true }), true);
});

test("mine scope returns PROVIDER_ROLE_REQUIRED before querying slots", async () => {
  let fromCalled = false;
  const client = asClient({
    rpc: async () => ({ data: null, error: null }),
    from: () => {
      fromCalled = true;
      return new QueryMock({ data: [], error: null });
    },
  });

  const result = await getProviderAppointmentSlots(client, "org-a", {
    scope: "mine",
  });

  assert.equal(fromCalled, false);
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "PROVIDER_ROLE_REQUIRED");
  assert.match(
    result.error?.message ?? "",
    /active doctor or specialist role/i,
  );
});

test("clinic scope queries all organization slots when permission is granted", async () => {
  const slots = new QueryMock({ data: [], error: null });
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: true, error: null };
    },
    from: () => slots,
  });

  const result = await getProviderAppointmentSlots(client, "org-a", {
    scope: "clinic",
    from: new Date("2099-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(result, { data: [], error: null });
  assert.deepEqual(rpcCalls, [
    {
      name: "has_organization_permission",
      args: {
        target_organization_id: "org-a",
        target_permission: "can_manage_appointments",
      },
    },
  ]);
  assert.equal(hasCall(slots, "eq", "organization_id", "org-a"), true);
  assert.equal(
    slots.calls.some(
      (call) => call.method === "eq" && call.args[0] === "practitioner_role_id",
    ),
    false,
  );
});

test("clinic scope returns APPOINTMENT_SCOPE_FORBIDDEN before querying slots", async () => {
  let fromCalled = false;
  const client = asClient({
    rpc: async () => ({ data: false, error: null }),
    from: () => {
      fromCalled = true;
      return new QueryMock({ data: [], error: null });
    },
  });

  const result = await getProviderAppointmentSlots(client, "org-a", {
    scope: "clinic",
  });

  assert.equal(fromCalled, false);
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "APPOINTMENT_SCOPE_FORBIDDEN");
  assert.match(
    result.error?.message ?? "",
    /appointment management permission/i,
  );
});

test("daily queue resolves assigned doctors and preserves rows with missing roles", async () => {
  const tableQueries = new Map<string, QueryMock[]>();
  const appointments = [
    {
      id: "appointment-a",
      organization_id: "org-a",
      patient_id: "patient-a",
      practitioner_role_id: "role-a",
      status: "arrived",
      start_at: "2099-01-01T10:00:00.000Z",
    },
    {
      id: "appointment-missing",
      organization_id: "org-a",
      patient_id: "patient-b",
      practitioner_role_id: "role-missing",
      status: "arrived",
      start_at: "2099-01-01T10:30:00.000Z",
    },
  ];
  const results: Record<string, QueryResult> = {
    appointments: { data: appointments, error: null },
    patients: {
      data: [
        { id: "patient-a", name: { text: "Patient A" } },
        { id: "patient-b", name: { text: "Patient B" } },
      ],
      error: null,
    },
    encounters: { data: [], error: null },
    practitioner_roles: {
      data: [{ id: "role-a", practitioner_id: "practitioner-a" }],
      error: null,
    },
    practitioners: {
      data: [
        {
          id: "practitioner-a",
          name: { given: ["Alex"], family: "Rivera" },
        },
      ],
      error: null,
    },
  };
  const client = asClient({
    from: (table: string) => {
      const query = new QueryMock(results[table] ?? { data: [], error: null });
      tableQueries.set(table, [...(tableQueries.get(table) ?? []), query]);
      return query;
    },
  });

  const result = await getDailyAppointmentQueue(client, "org-a", {
    start: "2099-01-01T00:00:00.000Z",
    end: "2099-01-02T00:00:00.000Z",
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2);
  assert.equal(result.data?.[0]?.assignedDoctorName, "Alex Rivera");
  assert.equal(
    result.data?.[1]?.assignedDoctorName,
    "Assigned doctor unavailable",
  );
  assert.deepEqual(
    result.data?.map((row) => row.id),
    ["appointment-a", "appointment-missing"],
  );
  const roleQuery = tableQueries.get("practitioner_roles")?.[0];
  assert.ok(roleQuery);
  assert.equal(
    hasCall(roleQuery, "in", "id", ["role-a", "role-missing"]),
    true,
  );
});
