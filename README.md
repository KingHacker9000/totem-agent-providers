# Totem Agent Providers

Adapters that connect Totem to external agent runtimes.

Totem does not require a general-purpose LLM to run locally. Instead, the core talks to implementations of the shared `AgentProvider` contract implemented in `KingHacker9000/totem/packages/agents`.

## Implemented providers

- `CodexCliProvider` (`codex`) — launches Codex CLI turns, consumes JSONL output, records the native thread/session id for resume, applies read-only/workspace-write policy, and injects explicitly registered MCP servers.
- `ClaudeCodeCliProvider` (`claude-code`) — launches Claude Code in headless `stream-json` mode, records the native session id for resume, maps read-only workspaces to plan mode, and injects explicitly registered MCP configuration.
- `mock` — the deterministic Phase 1 reference behavior remains in the main `totem` monorepo so core/simulator CI does not depend on an external CLI.

The process launcher is injected. Tests therefore exercise invocation construction, streaming normalization, native-session capture/resume, workspace policy, and MCP configuration using deterministic fake processes without credentials or installed CLIs.

## Provider v0 responsibilities

Adapters implement the provider-neutral lifecycle:

```text
probeCapabilities()
getStatus()
startSession(options)
resumeSession(sessionId)
sendMessage(sessionId, request)
streamEvents(sessionId)
interrupt(sessionId)
terminate(sessionId)
attachWorkspace(sessionId, workspace)
registerMcpServers(sessionId, servers)
```

They are also responsible for capability probing, session lifecycle, task-associated messages, normalized streaming drafts, cancellation, explicit workspace attachment, MCP registration, provider-native error translation, and health/status reporting.

## Event boundary

Provider-native CLI/SDK events must never become core semantics directly. Adapters emit provider-neutral `AgentEventDraft` values. The Totem broker/composition layer turns those drafts into validated `totem.event/v0` envelopes using `@totem/protocol`.

## Workspace and MCP policy

A Totem session can attach a workspace as either `read-only` or `read-write`. The adapters translate that declared policy to the strictest available CLI mode and use the workspace path as the child process working directory. MCP servers are injected only from the session's explicit declarations.

## Development

```bash
npm install
npm run check
```

`npm run check` type-checks, runs deterministic tests, builds declarations/JavaScript, and validates the public build surface. Hosted CI runs the same check on Windows and Ubuntu with Node 22.20 and Node 24.18.

### Deterministic distribution evidence

After `npm run build`, run `npm run distribution:integrity`. The command fails closed unless `dist/` is a real in-repository directory containing exactly `index.js` and `index.d.ts` as regular files, and unless package identity/exports still point at those artifacts. It emits a path-independent `totem.agent-provider-distribution/v1` JSON inventory containing each file's byte length and SHA-256 plus an aggregate SHA-256 over the canonical inventory. No timestamps or checkout paths are included, so repeated builds of the same source can be compared byte-for-byte by comparing the emitted inventory.

Final Totem release evidence should pin both the exact provider source revision and the emitted aggregate digest. Symlinks, missing outputs, extra outputs, changed package identity, or exports/types drift are rejected rather than silently entering the distribution surface.

Real CLI smoke validation is intentionally separate from deterministic CI because it depends on local installation/authentication.

## Source of truth

- provider-neutral interface and registry: `KingHacker9000/totem/packages/agents`
- normalized event contract: `KingHacker9000/totem/packages/protocol` and `docs/PROTOCOL.md`
- architecture/semantics: `KingHacker9000/totem/docs/AGENTS.md`
- concrete external-runtime adapters: this repository

The local `src/contracts.ts` types intentionally mirror the structural provider-neutral v0 interface until cross-repository package publication/linkage is finalized.

## Non-goals

- duplicating Totem core task persistence;
- embedding service-specific integrations;
- granting unrestricted host/root access by default;
- silently broadening workspace or MCP permissions;
- making the rest of Totem depend on provider-specific output formats.
