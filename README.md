# Totem Agent Providers

Adapters that connect Totem to external agent runtimes.

Totem does not require a general-purpose LLM to run locally. Instead, the core talks to implementations of the shared `AgentProvider` contract implemented in `KingHacker9000/totem/packages/agents`.

## Initial providers

- `codex` — Codex CLI integration
- `claude-code` — Claude Code CLI integration
- `mock` — the deterministic Phase 1 reference behavior currently lives in the main `totem` monorepo so it can be exercised by core/simulator CI without cross-repository package publishing

Real Codex/Claude adapters should be added here only after the provider-neutral v0 seam has been exercised. The mock may later move/share fixtures here when packaging boundaries stabilize.

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

- capability probing
- session start/resume/termination
- message submission associated with Totem task IDs
- normalized streaming events through Totem's injected event factory
- interruption/cancellation reporting
- explicit workspace attachment
- MCP server registration/injection where supported
- provider-native error translation
- health/status reporting

## Event boundary

Provider-native CLI/SDK events must never become core semantics directly.

Adapters emit provider-neutral semantic event drafts. The Totem broker/composition layer turns those drafts into validated `totem.event/v0` envelopes using `@totem/protocol`. This keeps the adapters independent of core serialization details while still allowing Totem to reject invalid provider emissions.

Do not make core behavior depend on undocumented Codex/Claude event fields.

## Non-goals

- duplicating Totem core task persistence
- embedding service-specific integrations
- granting unrestricted host/root access by default
- silently broadening workspace or MCP permissions
- making the rest of Totem depend on provider-specific output formats

## Source of truth

During Phase 1:

- provider interface + registry + deterministic mock: `KingHacker9000/totem/packages/agents`
- normalized event contract: `KingHacker9000/totem/packages/protocol` and `docs/PROTOCOL.md`
- architecture/semantics: `KingHacker9000/totem/docs/AGENTS.md`

This repository owns concrete external-runtime adapters, not the generic Totem core task model.
