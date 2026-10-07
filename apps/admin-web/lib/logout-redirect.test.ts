import assert from "node:assert/strict";
import test from "node:test";
import { signOutAndRedirect } from "./logout-redirect.ts";

test("signOutAndRedirect sends the user to the login route after signing out", async () => {
  const events: string[] = [];

  await signOutAndRedirect(
    async () => { events.push("sign-out"); },
    () => { events.push("redirect"); },
  );

  assert.deepEqual(events, ["sign-out", "redirect"]);
});

test("signOutAndRedirect still sends the user to the login route when sign-out fails", async () => {
  let redirected = false;

  await assert.rejects(
    signOutAndRedirect(
      async () => { throw new Error("offline"); },
      () => { redirected = true; },
    ),
    /offline/,
  );

  assert.equal(redirected, true);
});
