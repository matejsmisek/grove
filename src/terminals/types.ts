import type { TerminalId, TerminalSettings } from '../storage/types.js';

/**
 * A single tab/pane to open in a Claude session. The command is the full,
 * already-resolved shell command to run (e.g. a direnv-wrapped `claude` or
 * `bash`); adapters are responsible only for arranging it in their terminal.
 */
export interface TerminalTab {
	/** Tab/window title shown by the terminal */
	title: string;
	/** Full shell command to run in the tab */
	command: string;
}

/**
 * How an adapter wants the caller to spawn it.
 * - `command` + `args` are passed to child_process.spawn.
 * - `sessionFile`, when present, must be written to disk before spawning and
 *   removed afterwards (used by file-based terminals like konsole/kitty).
 * - `shell` mirrors spawn's shell option (needed on Windows for cmd/start).
 */
export interface TerminalSpawnSpec {
	command: string;
	args: string[];
	sessionFile?: { path: string; content: string };
	shell?: boolean;
}

/**
 * Context handed to an adapter when building a Claude session launch.
 */
export interface ClaudeLaunchContext {
	/** Working directory the session should start in */
	workingDir: string;
	/** Resolved tabs to open (already direnv-wrapped). The first tab is Claude. */
	tabs: TerminalTab[];
	/**
	 * For adapters with an editable session template (konsole/kitty), the template
	 * content with all placeholders already substituted. Undefined for adapters
	 * that compose the launch from `tabs` directly.
	 */
	renderedTemplate?: string;
	/** Directory where temporary session files may be written. */
	tmpDir: string;
	/** Unique token to disambiguate temp session file names. */
	sessionToken: string;
	/** Custom command/args, only meaningful for the `custom` adapter. */
	custom?: TerminalSettings;
}

/**
 * Adapter describing how to drive one terminal emulator for both "open a plain
 * terminal here" and "launch a Claude session here". Adapters are registered in
 * the {@link ./registry} and resolved by their {@link TerminalId}.
 */
export interface TerminalAdapter {
	readonly id: TerminalId;
	/** Human-readable name shown in settings/pickers (e.g. "KDE Konsole"). */
	readonly displayName: string;
	/** Platforms this terminal exists on (os.platform() values). */
	readonly platforms: NodeJS.Platform[];
	/**
	 * Command probed via `commandExists` to decide availability. When undefined the
	 * terminal is app-based (no CLI on PATH) and is treated as available on any
	 * matching platform unless {@link isAvailable} narrows it further.
	 */
	readonly detectCommand?: string;
	/**
	 * Optional custom availability probe, overriding the default platform +
	 * detectCommand check (e.g. macOS app-bundle detection for iTerm2).
	 */
	isAvailable?(): Promise<boolean>;
	/**
	 * Whether a Claude launch opens multiple tabs (claude + shell). When false the
	 * adapter opens a single window running Claude.
	 */
	readonly multiTab: boolean;
	/**
	 * Whether this terminal exposes a hand-editable session template (file-based
	 * terminals). When true the configure UI offers template editing and
	 * {@link ClaudeLaunchContext.renderedTemplate} is provided at launch.
	 */
	readonly editableTemplate: boolean;
	/** Default session template (native syntax). Only set when editableTemplate. */
	readonly defaultTemplate?: string;

	/** Build the spawn spec for opening a plain terminal in `path`. */
	openTerminal(path: string, custom?: TerminalSettings): TerminalSpawnSpec;
	/** Build the spawn spec for launching a Claude session. */
	launchClaude(ctx: ClaudeLaunchContext): TerminalSpawnSpec;
}
