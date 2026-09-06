import { describe, expect, it } from "vitest";
import { ClaudeCodeCliProvider } from "./claude.js";
import { CodexCliProvider } from "./codex.js";
import type { AgentEventDraft } from "./contracts.js";
import type { ProcessRunner, SpawnSpec } from "./provider.js";

function fakeRunner(lines: string[], seen: SpawnSpec[]): ProcessRunner {
  return (spec) => {
    seen.push(spec);
    return {
      stdout: (async function* () { for (const line of lines) yield line; })(),
      stderr: (async function* () {})(),
      exit: Promise.resolve(0),
      interrupt() {},
      terminate() {},
    };
  };
}

async function take(stream: AsyncIterable<AgentEventDraft>, count: number) {
  const result: AgentEventDraft[] = [];
  for await (const event of stream) {
    result.push(event);
    if (result.length === count) break;
  }
  return result;
}

describe("CodexCliProvider", () => {
  it("builds a least-privilege invocation and normalizes JSONL", async () => {
    const seen: SpawnSpec[] = [];
    const provider = new CodexCliProvider(fakeRunner([
      JSON.stringify({ type: "thread.started", thread_id: "codex-native-1" }),
      JSON.stringify({ type: "message.completed", message: "done" }),
    ], seen));
    const session = await provider.startSession({ workspace: { path: "/repo", access: "read-only" } });
    await provider.sendMessage(session.id, { taskId: "T1", content: "inspect" });
    const events = await take(provider.streamEvents(session.id), 4);
    expect(seen[0]?.args).toContain("read-only");
    expect(seen[0]?.cwd).toBe("/repo");
    expect(events.map((event) => event.type)).toEqual(["agent.started", "agent.progress", "agent.message", "agent.completed"]);
    await provider.sendMessage(session.id, { taskId: "T2", content: "continue" });
    expect(seen[1]?.args.slice(0, 3)).toEqual(["exec", "resume", "codex-native-1"]);
  });
});

describe("ClaudeCodeCliProvider", () => {
  it("uses stream-json, plan mode for read-only workspaces, MCP config, and resume", async () => {
    const seen: SpawnSpec[] = [];
    const provider = new ClaudeCodeCliProvider(fakeRunner([
      JSON.stringify({ type: "system", session_id: "claude-native-1" }),
      JSON.stringify({ type: "result", result: "done", session_id: "claude-native-1" }),
    ], seen));
    const session = await provider.startSession({
      workspace: { path: "/repo", access: "read-only" },
      mcpServers: [{ id: "tools", command: "node", args: ["server.js"] }],
    });
    await provider.sendMessage(session.id, { taskId: "T1", content: "inspect" });
    const events = await take(provider.streamEvents(session.id), 4);
    expect(seen[0]?.args).toContain("stream-json");
    expect(seen[0]?.args).toContain("plan");
    expect(seen[0]?.args).toContain("--mcp-config");
    expect(events.at(-2)?.type).toBe("agent.message");
    await provider.sendMessage(session.id, { taskId: "T2", content: "continue" });
    expect(seen[1]?.args).toContain("--resume");
    expect(seen[1]?.args).toContain("claude-native-1");
  });
});
