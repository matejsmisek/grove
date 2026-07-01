import React, { useEffect, useRef } from 'react';

import { Box, type DOMElement, useStdin, useStdout } from 'ink';

import { MouseProvider, useMouse, useOnRelease } from '@ink-tools/ink-mouse';

import { ServiceProvider, useService } from '../di/index.js';
import { NavigationProvider } from '../navigation/NavigationContext.js';
import { Router } from '../navigation/Router.js';
import type { Routes } from '../navigation/types.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { getContextDisplayName } from '../services/WorkspaceService.js';
import { SettingsServiceToken, WorkspaceServiceToken } from '../services/tokens.js';
import { AgentSessionsProvider } from './AgentSessionsContext.js';
import { StatusBar } from './StatusBar.js';
import { TextInputActivityProvider, useTextInputActivity } from './TextInputActivityContext.js';
import { UpdateAvailableModal } from './UpdateAvailableModal.js';
import { UpdateStatusProvider, useUpdateStatus } from './UpdateStatusContext.js';

/** ESC byte — what the terminal sends for the Escape key. */
const ESCAPE_SEQUENCE = '\u001B';

function AppContent() {
	const workspaceService = useService(WorkspaceServiceToken);
	const settingsService = useService(SettingsServiceToken);
	// Subscribe to navigation so the status bar re-renders after a context
	// switch (which happens alongside a navigate from the global switcher).
	const { current: navState } = useNavigation();
	const { showNotification } = useUpdateStatus();
	const { internal_eventEmitter } = useStdin();
	const { stdout } = useStdout();
	const { isTracking, enable, disable } = useMouse();
	const { isActive: isTextInputActive } = useTextInputActivity();
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName = getContextDisplayName(workspaceContext);

	// Single source of truth for whether the terminal mouse should be tracking:
	// the global setting says yes AND no text input is focused. We drive the
	// library's enable()/disable() ourselves (the provider starts disabled via
	// autoEnable={false}, so its internal isEnabled flag stays consistent —
	// otherwise disable() is a no-op and mouse sequences leak into text inputs).
	const shouldTrackMouse = settingsService.getMouseControlEnabled() && !isTextInputActive;
	useEffect(() => {
		// Wait for ink-mouse to create its instance (isTracking) before toggling;
		// enable()/disable() no-op against a not-yet-created instance. Re-running
		// when isTracking flips also re-asserts our intent after the provider
		// finishes its own setup, avoiding a mount-order race.
		if (!isTracking) {
			return;
		}
		if (shouldTrackMouse) {
			enable();
		} else {
			disable();
		}
	}, [shouldTrackMouse, isTracking, enable, disable]);

	// Global "back" gesture: a right-click (or the dedicated mouse back button)
	// anywhere behaves exactly like pressing Esc. Rather than guessing what
	// "back" means per screen, we synthesize an Esc keypress into Ink's input
	// stream, so each screen's own Esc handler runs — closing a menu,
	// cancelling an edit, or popping to the previous screen, just like the
	// keyboard would. Attached to the full-screen root so it fires anywhere.
	// Suppressed while a text input is focused so the synthetic Esc can't
	// corrupt what the user is typing (mouse is also disabled then, so this is
	// belt-and-suspenders for the transition tick).
	const rootRef = useRef<DOMElement>(null);
	useOnRelease(rootRef, (event) => {
		if (isTextInputActive) {
			return;
		}
		if (event.button === 'right' || event.button === 'back') {
			internal_eventEmitter.emit('input', ESCAPE_SEQUENCE);
		}
	});

	// Show the "update available" modal in place of the normal screen once the
	// (async) update check resolves — but never over the first-run flows, which
	// are their own startup gates. It intercepts all input until dismissed.
	const inStartupGate = navState.screen === 'setupWizard' || navState.screen === 'direnvTrust';
	const showUpdateModal = showNotification && !inStartupGate;

	// minHeight forces the root to span the full terminal, not just its content,
	// so the right-click→back gesture is hit-tested over the empty space below
	// the content too. (height="100%" resolves to content height on Ink's root.)
	return (
		<Box ref={rootRef} flexDirection="column" minHeight={stdout.rows ?? 24}>
			<StatusBar isProcessing={false} workspaceName={workspaceName} />
			{showUpdateModal ? <UpdateAvailableModal /> : <Router />}
		</Box>
	);
}

/**
 * Wraps the app in a MouseProvider. We deliberately start with tracking OFF
 * (autoEnable={false}) and let AppContent enable it via mouse.enable() based on
 * the global setting and text-input state. ink-mouse's autoEnable turns the
 * terminal mouse on without flipping its internal isEnabled flag, which makes a
 * later disable() a no-op — so we never use it and own the state ourselves.
 */
function MouseControlGate({ children }: { children: React.ReactNode }) {
	return (
		<MouseProvider autoEnable={false}>
			<TextInputActivityProvider>{children}</TextInputActivityProvider>
		</MouseProvider>
	);
}

interface AppProps {
	/** Screen to launch into (e.g. 'home', 'globalHome', 'setupWizard') */
	initialScreen?: keyof Routes;
}

export function App({ initialScreen = 'home' }: AppProps) {
	return (
		<ServiceProvider>
			<UpdateStatusProvider>
				<AgentSessionsProvider>
					<NavigationProvider initialScreen={initialScreen}>
						<MouseControlGate>
							<AppContent />
						</MouseControlGate>
					</NavigationProvider>
				</AgentSessionsProvider>
			</UpdateStatusProvider>
		</ServiceProvider>
	);
}
