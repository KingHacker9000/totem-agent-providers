import type { AgentEventDraft, AgentMessageRequest, AgentProviderCapabilities } from "./contracts.js";
import { CliAgentProvider, type ProcessRunner, type SpawnSpec } from "./provider.js";

type InternalState = any;

export class ClaudeCodeCliProvider extends CliAgentProvider {
  constructor(runner?: ProcessRunner, private readonly binary = "claude") { super("claude-code", runner); }
  protected command() { return this.binary; }
  protected probeArgs() { return ["--version"]; }
  protected capabilities(): AgentProviderCapabilities { return { streaming: true, resume: true, interrupt: true, workspaces: true, mcp: true }; }
  protected buildInvocation(state: InternalState, request: AgentMessageRequest): SpawnSpec {
    const args = ["-p", request.content, "--output-format", "stream-json", "--verbose"];
    const nativeId = this.getNativeSessionId(state);
    if (nativeId) args.push("--resume", nativeId);
    if (state.session.workspace?.access === "read-only") args.push("--permission-mode", "plan");
    else args.push("--permission-mode", "acceptEdits");
    if (state.session.mcpServers.length) {
      const mcpServers = Object.fromEntries(state.session.mcpServers.map((server: any) => [server.id, { command: server.command, args: server.args ?? [], env: server.env ?? {} }]));
      args.push("--mcp-config", JSON.stringify({ mcpServers }));
    }
    return { command: this.command(), args, cwd: state.session.workspace?.path };
  }
  protected parseLine(state: InternalState, line: string, request: AgentMessageRequest): AgentEventDraft[] {
    let value: Record<string, any>;
    try { value = JSON.parse(line) as Record<string, any>; } catch { return [{ type: "agent.progress", sessionId: state.session.id, taskId: request.taskId, correlationId: request.correlationId, payload: { providerId: this.id, text: line } }]; }
    const nativeSessionId = typeof value.session_id === "string" ? value.session_id : undefined;
    if (nativeSessionId) this.setNativeSessionId(state, nativeSessionId);
    const kind = typeof value.type === "string" ? value.type : "event";
    const result = typeof value.result === "string" ? value.result : undefined;
    const text = result ?? (typeof value.message?.content === "string" ? value.message.content : undefined);
    return [{ type: /error/i.test(kind) || value.is_error === true ? "agent.error" : kind === "result" || text ? "agent.message" : "agent.progress", sessionId: state.session.id, taskId: request.taskId, correlationId: request.correlationId, payload: { providerId: this.id, nativeType: kind, ...(text ? { text } : {}), nativeSessionId } }];
  }
}
