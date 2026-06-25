/**
 * Terminal adapters module.
 *
 * A registry of {@link TerminalAdapter}s describing how to drive each supported
 * terminal emulator for both "open a plain terminal" and "launch a Claude
 * session". One unified terminal list (and one `selectedTerminal` setting) backs
 * both features.
 */
export type {
	ClaudeLaunchContext,
	TerminalAdapter,
	TerminalSpawnSpec,
	TerminalTab,
} from './types.js';
export { ALL_TERMINAL_ADAPTERS } from './adapters.js';
export {
	adaptersForPlatform,
	allAdapters,
	commandToTerminalId,
	detectAvailableTerminalIds,
	getAdapter,
	getTerminalDisplayName,
	isAdapterAvailable,
} from './registry.js';
