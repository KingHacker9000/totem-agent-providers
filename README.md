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

They are also responsible for:

- capability probing;
- session start/resume/termination;
- message submission associated with Totem task IDs;
- normalized streaming event drafts;
- interruption/cancellation reporting;
- explicit workspace attachment;
- MCP server registration/injection where supported;
- provider-native error translation;
- health/status reporting.

## Event boundary

Provider-native CLI/SDK events must never become core semantics directly.

Adapters emit provider-neutral `AgentEventDraft` values. The Totem broker/composition layer turns those drafts into validated `totem.event/v0` envelopes using `@totem/protocol`. Native event kinds and session references may appear only as diagnostic payload fields; core lifecycle decisions must use the normalized `agent.*` event type.

Do not make core behavior depend on undocumented Codex/Claude event fields.

## Workspace and MCP policy

A Totem session can attach a workspace as either `read-only` or `read-write`. The adapters translate that declared policy to the strictest available CLI mode and use the workspace path as the child process working directory. MCP servers are injected only from the session's explicit `registerMcpServers`/start-session declarations; adapters do not discover or silently inherit arbitrary servers on Totem's behalf.

The concrete provider process inherits the Totem service environment today. Secret ownership/redaction remains a core/runtime responsibility; callers should pass only provider-required environment to Totem and must not encode secrets in prompts or status payloads.

## Development

```bash
npm install
npm run check
```

`npm run check` type-checks, runs the deterministic Vitest suite, and builds declarations/JavaScript. Hosted CI runs the same check on Windows and Ubuntu with the project-supported Node 22.20 and Node 24.18 lines.

Real CLI smoke validation is intentionally separate from deterministic CI because it depends on local installation/authentication. `getStatus()` uses `<cli> --version` for capability visibility, while product integration may present an unavailable state without crashing Totem.

## Source of truth

- provider-neutral interface and registry: `KingHacker9000/totem/packages/agents`
- normalized event contract: `KingHacker9000/totem/packages/protocol` and `docs/PROTOCOL.md`
- architecture/semantics: `KingHacker9000/totem/docs/AGENTS.md`
- concrete external-runtime adapters: this repository

The local `src/contracts.ts` types intentionally mirror the structural provider-neutral v0 interface until cross-repository package publication/linkage is finalized. They do not add provider-specific semantics to the core contract.

## Non-goals

- duplicating Totem core task persistence;
- embedding service-specific integrations;
- granting unrestricted host/root access by default;
- silently broadening workspace or MCP permissions;
- making the rest of Totem depend on provider-specific output formats.
