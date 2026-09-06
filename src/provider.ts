import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { AgentEventDraft, AgentMessageRequest, AgentMcpServer, AgentProvider, AgentProviderCapabilities, AgentProviderStatus, AgentSession, AgentWorkspace, StartSessionOptions } from "./contracts.js";
import { AgentProviderError } from "./contracts.js";

export interface SpawnSpec { command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }
export interface RunningProcess { stdout: AsyncIterable<string>; stderr: AsyncIterable<string>; exit: Promise<number | null>; interrupt(): void; terminate(): void }
export type ProcessRunner = (spec: SpawnSpec) => RunningProcess;

async function* lines(stream: Readable): AsyncIterable<string> {
  let pending = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    pending += String(chunk);
    let index = pending.indexOf("\n");
    while (index >= 0) {
      yield pending.slice(0, index).replace(/\r$/, "");
      pending = pending.slice(index + 1);
      index = pending.indexOf("\n");
    }
  }
  if (pending) yield pending;
}

export const nodeProcessRunner: ProcessRunner = (spec) => {
  const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
  return {
    stdout: lines(child.stdout),
    stderr: lines(child.stderr),
    exit: new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }),
    interrupt: () => child.kill("SIGINT"),
    terminate: () => child.kill("SIGTERM"),
  };
};

interface State { session: AgentSession; nativeSessionId?: string; queue: AgentEventDraft[]; waiters: Array<() => void>; process?: RunningProcess }

export abstract class CliAgentProvider implements AgentProvider<AgentEventDraft> {
  readonly #sessions = new Map<string, State>();
  protected constructor(readonly id: string, protected readonly runner: ProcessRunner = nodeProcessRunner) {}
  protected abstract command(): string;
  protected abstract buildInvocation(state: State, request: AgentMessageRequest): SpawnSpec;
  protected abstract parseLine(state: State, line: string, request: AgentMessageRequest): AgentEventDraft[];
  protected abstract probeArgs(): string[];
  protected abstract capabilities(): AgentProviderCapabilities;

  async probeCapabilities() { return this.capabilities(); }
  async getStatus(): Promise<AgentProviderStatus> {
    try { const p = this.runner({ command: this.command(), args: this.probeArgs() }); const code = await p.exit; return { id: this.id, available: code === 0, detail: code === 0 ? "CLI available" : `CLI probe exited ${code}` }; }
    catch (error) { return { id: this.id, available: false, detail: error instanceof Error ? error.message : String(error) }; }
  }
  async startSession(options: StartSessionOptions = {}): Promise<AgentSession> {
    const session: AgentSession = { id: `${this.id}-${randomUUID()}`, providerId: this.id, status: "active", workspace: options.workspace, mcpServers: [...(options.mcpServers ?? [])] };
    this.#sessions.set(session.id, { session, queue: [], waiters: [] }); return structuredClone(session);
  }
  async resumeSession(sessionId: string): Promise<AgentSession> { const s = this.state(sessionId); s.session.status = "active"; return structuredClone(s.session); }
  async attachWorkspace(sessionId: string, workspace: AgentWorkspace) { this.state(sessionId).session.workspace = workspace; }
  async registerMcpServers(sessionId: string, servers: AgentMcpServer[]) { this.state(sessionId).session.mcpServers = structuredClone(servers); }
  async sendMessage(sessionId: string, request: AgentMessageRequest) {
    const state = this.state(sessionId); if (state.process) throw new AgentProviderError(this.id, "provider_busy", "Session already has an active turn", sessionId);
    const proc = this.runner(this.buildInvocation(state, request)); state.process = proc; this.push(state, { type: "agent.started", sessionId, taskId: request.taskId, correlationId: request.correlationId, payload: { providerId: this.id } });
    void this.consume(state, proc, request);
  }
  async *streamEvents(sessionId: string): AsyncIterable<AgentEventDraft> {
    const state = this.state(sessionId);
    while (state.session.status !== "terminated" || state.queue.length) {
      if (!state.queue.length) await new Promise<void>((resolve) => state.waiters.push(resolve));
      while (state.queue.length) yield state.queue.shift()!;
      if (!state.process && state.session.status !== "active") break;
    }
  }
  async interrupt(sessionId: string) { const state = this.state(sessionId); state.process?.interrupt(); state.session.status = "interrupted"; this.push(state, { type: "agent.interrupted", sessionId, payload: { providerId: this.id } }); }
  async terminate(sessionId: string) { const state = this.state(sessionId); state.process?.terminate(); state.process = undefined; state.session.status = "terminated"; this.push(state, { type: "agent.terminated", sessionId, payload: { providerId: this.id } }); }
  protected setNativeSessionId(state: State, id: string) { state.nativeSessionId = id; }
  protected getNativeSessionId(state: State) { return state.nativeSessionId; }

  private state(id: string) { const state = this.#sessions.get(id); if (!state) throw new AgentProviderError(this.id, "session_not_found", `Unknown session '${id}'`, id); return state; }
  private push(state: State, event: AgentEventDraft) { state.queue.push(event); state.waiters.splice(0).forEach((wake) => wake()); }
  private async consume(state: State, proc: RunningProcess, request: AgentMessageRequest) {
    try {
      for await (const line of proc.stdout) for (const event of this.parseLine(state, line, request)) this.push(state, event);
      const code = await proc.exit;
      if (state.session.status === "active") this.push(state, { type: code === 0 ? "agent.completed" : "agent.error", sessionId: state.session.id, taskId: request.taskId, correlationId: request.correlationId, payload: code === 0 ? { providerId: this.id } : { providerId: this.id, code: "provider_process_exit", exitCode: code } });
    } catch (error) { this.push(state, { type: "agent.error", sessionId: state.session.id, taskId: request.taskId, payload: { providerId: this.id, code: "provider_process_error", message: error instanceof Error ? error.message : String(error) } }); }
    finally { state.process = undefined; state.waiters.splice(0).forEach((wake) => wake()); }
  }
}
