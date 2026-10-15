# eve MCP Events template

One Next.js app with web chat and an eve agent, integrated through `withEve` in [`next.config.ts`](next.config.ts). Bird events can resume the conversation that created a watch.

This project uses `eve@0.80.0` and `@vercel/connect@2.5.2`. Its existing web sign-in, Slack channel, Bird connector (`bird/cyan-pocket`), and model configuration are retained.

## Run locally

Use Node.js 24, pnpm, and Docker for the default local sandbox.

```sh
pnpm install
pnpm exec eve link --non-interactive --project eve-mcp-events-template --team allenzhou
vercel env pull .env.local --scope allenzhou --yes
pnpm dev
```

Open <http://localhost:3000>. `withEve` starts the agent alongside Next.js and routes `/eve/v1/*` to it. The browser uses the same origin for chat and agent requests.

Local development skips browser sign-in. It is useful for UI and ordinary chat testing, but that fallback does not supply the end-user identity needed by the user-scoped Bird connection. Use the signed-in production app for the complete Bird flow. Model calls use AI Gateway through the linked project's fresh OIDC token, or an `AI_GATEWAY_API_KEY` in `.env.local`.

## Test Bird events

The Vercel project already has web auth configured and the Bird connector attached. For another project, provision web sign-in with `eve add channel/web` and create/attach your own Bird connector, then update the UID in [`agent/connections/cyan-pocket-bird.ts`](agent/connections/cyan-pocket-bird.ts).

After this version is deployed to production:

1. Sign in to web chat with Vercel.
2. Ask **“Show my Bird mailboxes.”** Complete Bird authorization if prompted, then approve the remote tool call.
3. Ask **“Watch [mailbox] for 10 minutes and summarize new email here.”** The agent discovers the server's event schemas and subscribes using `ttlMs: 600000`. Verify it reports an active subscription; pending is not active.
4. Send a test email to that mailbox using your own email client. Its event should produce a new turn in the same chat. Reload the `/s/[sessionId]` URL to verify the update remains visible.
5. Ask **“Stop watching that mailbox.”** Verify the unsubscribe result.

Use production for subscriptions. The current Connect backend rejects preview/development subscription identity. The team also needs MCP Events enabled, the Bird account must expose event support, and deployment protection must allow Connect callbacks to reach the receiver. If a step fails, inspect the returned error rather than assuming the subscription is running.

A successful subscription response is only part of the test. The full milestone is a real event arriving in the conversation, followed by a successful stop.

## What the connection does

`experimental_events` defines three callbacks; adding it does not subscribe automatically:

- `onEvent` queues the event name, data, and delivery ID into the originating session.
- `onGap` asks the agent to tell the user about missed events and reconcile with the source.
- `onTerminated` tells the session that the watch ended and asks before starting another.

Each callback uses `origin.sessionId` and `auth` supplied by eve from the saved watch. Event payloads do not choose the session or execution identity. `turnPolicy: "queue"` avoids interrupting an active turn. The same callback supports each event discovered from Bird; email is the example above.

Connect manages the upstream subscription and forwards deliveries. eve owns the receiver at `/eve/v1/hooks/cyan-pocket-bird`, verifies the delivery, resolves its watch, and dispatches the callback. `attachSession` attaches to an existing conversation; it does not create one. A watch can outlive its originating session, so stop the watch when finished testing.

Bird's remote tools use `always()` approval. The agent can draft a reply in chat, but sending it requires approval. Incoming email and provider errors are treated as untrusted data.

Callbacks can repeat or arrive out of order. Including `deliveryId` gives the agent context; it is not durable deduplication. Add idempotency before introducing automatic external writes.

Read [eve's MCP docs](https://eve.dev/docs/connections/mcp) and the [MCP Triggers and Events working group](https://modelcontextprotocol.io/community/working-groups/triggers-events) for protocol context.

## Validate and deploy

```sh
pnpm typecheck
pnpm test
pnpm build:eve
pnpm build
pnpm exec eve deploy --non-interactive --yes
```

Production builds need the existing `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and trusted deployment hostname configuration. Vercel supplies these for this project. CI uses compile-only values and does not contact Bird. Do not commit environment files or tokens.

The tests exercise callback routing with the saved identity, different event names, gap/termination notifications, and propagation of failed session sends. They do not replace a live delivery test.
