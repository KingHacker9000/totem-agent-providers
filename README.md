# Totem Agent Providers

Adapters that connect Totem to external agent runtimes.

Totem does not require a general-purpose LLM to run locally. Instead, the core talks to implementations of a shared `AgentProvider` contract.

## Initial providers

- `codex` — Codex CLI integration
- `claude-code` — Claude Code CLI integration
- `mock` — deterministic provider for automated tests and simulator development

## Provider responsibilities

- capability probing
- session start/resume/termination
- message submission
- normalized streaming events
- interruption/cancellation
- workspace attachment
- MCP server registration/injection where supported
- provider-native error translation
- health/status reporting

## Non-goals

- duplicating Totem core task persistence
- embedding service-specific integrations
- granting unrestricted host/root access by default
- making the rest of Totem depend on provider-specific output formats

The concrete `AgentProvider` interface will be finalized alongside Phase 1/4 work in the main Totem repository.
