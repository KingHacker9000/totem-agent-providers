export type AgentProviderSessionStatus = "active" | "interrupted" | "terminated";

export interface AgentProviderCapabilities {
  streaming: boolean;
  resume: boolean;
  interrupt: boolean;
  workspaces: boolean;
  mcp: boolean;
}

export interface AgentWorkspace {
  path: string;
  access: "read-only" | "read-write";
}

export interface AgentMcpServer {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentSession {
  id: string;
  providerId: string;
  status: AgentProviderSessionStatus;
  workspace?: AgentWorkspace;
  mcpServers: AgentMcpServer[];
}

export interface StartSessionOptions {
  workspace?: AgentWorkspace;
  mcpServers?: AgentMcpServer[];
}

export interface AgentMessageRequest {
  content: string;
  taskId: string;
  correlationId?: string;
}

export interface AgentEventDraft {
  type: string;
  sessionId: string;
  taskId?: string;
  correlationId?: string;
  payload: unknown;
}

export interface AgentProviderStatus {
  id: string;
  available: boolean;
  detail?: string;
}

export interface AgentProvider<TEvent = AgentEventDraft> {
  readonly id: string;
  probeCapabilities(): Promise<AgentProviderCapabilities>;
  getStatus(): Promise<AgentProviderStatus>;
  startSession(options?: StartSessionOptions): Promise<AgentSession>;
  resumeSession(sessionId: string): Promise<AgentSession>;
  sendMessage(sessionId: string, request: AgentMessageRequest): Promise<void>;
  streamEvents(sessionId: string): AsyncIterable<TEvent>;
  interrupt(sessionId: string): Promise<void>;
  terminate(sessionId: string): Promise<void>;
  attachWorkspace(sessionId: string, workspace: AgentWorkspace): Promise<void>;
  registerMcpServers(sessionId: string, servers: AgentMcpServer[]): Promise<void>;
}

export class AgentProviderError extends Error {
  constructor(
    readonly providerId: string,
    readonly code: string,
    message: string,
    readonly sessionId?: string,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}
