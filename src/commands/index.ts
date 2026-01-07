export { registerRepository } from './register.js';
export { initWorkspace } from './workspace.js';
export {
	handleSessionAttention,
	handleSessionEnd,
	handleSessionHook,
	handleSessionIdle,
	handleSessionStart,
} from './sessions.js';
export { setupAgentHooks, verifyAgentHooks } from './setupHooks.js';
export type { RegisterResult, WorkspaceInitResult } from './types.js';
export type { SessionCommandResult } from './sessions.js';
export type { SetupHooksResult } from './setupHooks.js';
