import assert from "node:assert/strict";
import { test } from "node:test";
import bird from "../agent/connections/cyan-pocket-bird.ts";

function context(send = async () => {}) {
  const calls = [];
  const auth = { principalType: "user", principalId: "signed-in-user" };
  return {
    calls,
    input: {
      auth,
      origin: { sessionId: "originating-chat" },
      attachSession(sessionId) {
        return {
          async send(message, options) {
            calls.push({ sessionId, message, options });
            await send();
          },
        };
      },
    },
  };
}

test("incoming mail queues in the saved session with the saved user's auth", async () => {
  const { input, calls } = context();
  const event = {
    name: "email_mailbox.message_received",
    data: { subject: "Hello", sessionId: "payload-is-not-routing" },
  };
  await bird.experimental_events.onEvent({ ...input, event, deliveryId: "delivery-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, "originating-chat");
  assert.deepEqual(calls[0].options, { auth: input.auth, turnPolicy: "queue" });
  assert.match(calls[0].message, /untrusted data/);
  assert.match(calls[0].message, /"deliveryId":"delivery-1"/);
  assert.match(calls[0].message, /"subject":"Hello"/);
});

test("other discovered Bird events use the same callback", async () => {
  const { input, calls } = context();
  await bird.experimental_events.onEvent({
    ...input,
    event: { name: "another.discovered.event", data: {} },
    deliveryId: "delivery-2",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /another.discovered.event/);
});

test("gaps and termination notify the original chat using queued turns", async () => {
  const { input, calls } = context();
  await bird.experimental_events.onGap(input);
  await bird.experimental_events.onTerminated({ ...input, error: { message: "Lease ended" } });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.sessionId, "originating-chat");
    assert.deepEqual(call.options, { auth: input.auth, turnPolicy: "queue" });
  }
  assert.match(calls[0].message, /re-check the watched source/);
  assert.match(calls[1].message, /ask before starting another/);
  assert.match(calls[1].message, /Lease ended/);
});

test("a failed send is surfaced to eve instead of silently dropping the event", async () => {
  const { input } = context(async () => { throw new Error("Session unavailable"); });
  await assert.rejects(
    bird.experimental_events.onEvent({
      ...input,
      event: { name: "email_mailbox.message_received", data: {} },
      deliveryId: "delivery-3",
    }),
    /Session unavailable/,
  );
});
