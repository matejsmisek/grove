import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import { DirenvWhitelistPrompt } from '../components/DirenvWhitelistPrompt.js';
import TextInput from '../components/GroveTextInput.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	ALL_IDE_TYPES,
	detectAvailableIDEs,
	detectAvailableTerminals,
	getDefaultIDEConfig,
	getIDEDisplayName,
	isCommandAvailable,
} from '../services/index.js';
import { SettingsServiceToken } from '../services/tokens.js';
import type { Settings, TerminalConfig } from '../storage/types.js';

type WizardStep = 'folder' | 'terminal' | 'ide';

const STEP_ORDER: WizardStep[] = ['folder', 'terminal', 'ide'];

/**
 * Compute the default groves folder: one directory up from the current working
 * directory, in a "groves" folder. e.g. /home/me/projects/grove -> /home/me/projects/groves
 */
function getDefaultGrovesFolder(): string {
	return path.join(path.dirname(process.cwd()), 'groves');
}

/**
 * First-run setup wizard. Guides the user through choosing where groves live,
 * which terminal to launch, and which IDE to open. Shown only when no
 * settings.json exists yet. ESC skips the wizard, saving the current selections.
 */
export function SetupWizardScreen() {
	const { replace } = useNavigation();
	const settingsService = useService(SettingsServiceToken);

	const [step, setStep] = useState<WizardStep>('folder');

	// Step 1: groves folder. The folder step has two phases: entering the path,
	// then (when direnv is installed) offering to trust the folder in direnv.
	const [workingFolder, setWorkingFolder] = useState(getDefaultGrovesFolder);
	const [folderPhase, setFolderPhase] = useState<'input' | 'direnv'>('input');

	// Step 2: terminal
	const [terminals, setTerminals] = useState<TerminalConfig[] | null>(null);
	const [terminalIndex, setTerminalIndex] = useState(0);

	// Step 3: IDE - default to jetbrains-auto
	const [ideIndex, setIdeIndex] = useState(() => {
		const jetbrains = ALL_IDE_TYPES.indexOf('jetbrains-auto');
		return jetbrains >= 0 ? jetbrains : 0;
	});
	// Detected availability per IDE type (probed async on mount). Undefined until
	// known, so the "(not detected)" marker only appears once the probe completes.
	const [ideAvailability, setIdeAvailability] = useState<Partial<Record<string, boolean>>>({});

	// Detect installed terminals once on mount
	useEffect(() => {
		let cancelled = false;
		detectAvailableTerminals().then((found) => {
			if (!cancelled) {
				setTerminals(found);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// Detect installed IDEs once on mount (async, non-blocking)
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const jetbrainsAvailable = (await detectAvailableIDEs()).includes('jetbrains-auto');
			const entries = await Promise.all(
				ALL_IDE_TYPES.map(async (ideType): Promise<[string, boolean]> => {
					if (ideType === 'jetbrains-auto') {
						return [ideType, jetbrainsAvailable];
					}
					return [ideType, await isCommandAvailable(getDefaultIDEConfig(ideType).command)];
				})
			);
			if (!cancelled) {
				setIdeAvailability(Object.fromEntries(entries));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const finish = () => {
		const updates: Partial<Settings> = {
			workingFolder: workingFolder.trim() || getDefaultGrovesFolder(),
			selectedIDE: ALL_IDE_TYPES[ideIndex],
		};
		const selectedTerminal = terminals?.[terminalIndex];
		if (selectedTerminal) {
			updates.terminal = selectedTerminal;
		}
		settingsService.updateSettings(updates);
		replace('home', {});
	};

	const goToNextStep = () => {
		const currentIndex = STEP_ORDER.indexOf(step);
		if (currentIndex >= STEP_ORDER.length - 1) {
			finish();
		} else {
			setStep(STEP_ORDER[currentIndex + 1]);
		}
	};

	const goToPrevStep = () => {
		const currentIndex = STEP_ORDER.indexOf(step);
		if (currentIndex > 0) {
			setStep(STEP_ORDER[currentIndex - 1]);
		}
	};

	// Submitting the folder path moves into the direnv sub-phase; the prompt
	// advances to the next step itself once resolved (or immediately when there
	// is nothing to offer).
	const handleFolderSubmit = () => {
		setFolderPhase('direnv');
	};

	const handleDirenvComplete = () => {
		setFolderPhase('input');
		goToNextStep();
	};

	useInput((_input, key) => {
		// During the direnv sub-phase the prompt owns all keys (incl. Escape, which
		// means "skip whitelist" there rather than "skip the wizard").
		if (step === 'folder' && folderPhase === 'direnv') {
			return;
		}

		// ESC skips the wizard from any step, saving current selections.
		if (key.escape) {
			finish();
			return;
		}

		if (step === 'folder') {
			// Folder input is handled by TextInput (Enter submits).
			return;
		}

		if (key.leftArrow) {
			goToPrevStep();
			return;
		}

		if (step === 'terminal') {
			const count = terminals?.length ?? 0;
			if (key.upArrow && count > 0) {
				setTerminalIndex((prev) => (prev > 0 ? prev - 1 : count - 1));
			} else if (key.downArrow && count > 0) {
				setTerminalIndex((prev) => (prev < count - 1 ? prev + 1 : 0));
			} else if (key.return) {
				goToNextStep();
			}
		} else if (step === 'ide') {
			if (key.upArrow) {
				setIdeIndex((prev) => (prev > 0 ? prev - 1 : ALL_IDE_TYPES.length - 1));
			} else if (key.downArrow) {
				setIdeIndex((prev) => (prev < ALL_IDE_TYPES.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				goToNextStep();
			}
		}
	});

	const stepNumber = STEP_ORDER.indexOf(step) + 1;

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1} flexDirection="column">
				<Text bold color="green">
					🌳 Welcome to Grove
				</Text>
				<Text dimColor>
					Let's set up a few things. Step {stepNumber} of {STEP_ORDER.length}.
				</Text>
			</Box>

			{step === 'folder' && folderPhase === 'input' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text bold color="yellow">
							📁 Where should groves live?
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>Grove creates and manages git worktrees inside this folder.</Text>
					</Box>
					<Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={1}>
						<Text color="blue" bold>
							→{' '}
						</Text>
						<TextInput
							value={workingFolder}
							onChange={setWorkingFolder}
							onSubmit={handleFolderSubmit}
							placeholder="Enter groves folder path..."
						/>
					</Box>
				</Box>
			)}

			{step === 'folder' && folderPhase === 'direnv' && (
				<DirenvWhitelistPrompt folder={workingFolder} onComplete={handleDirenvComplete} />
			)}

			{step === 'terminal' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text bold color="yellow">
							🖥️ Default terminal
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>Used when opening a worktree in a terminal window.</Text>
					</Box>
					{terminals === null ? (
						<Text dimColor>Detecting installed terminals...</Text>
					) : terminals.length === 0 ? (
						<Text color="red">
							No supported terminal detected. You can configure one later in Settings.
						</Text>
					) : (
						terminals.map((terminal, index) => {
							const isSelected = index === terminalIndex;
							return (
								<Box key={terminal.command}>
									<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
										{isSelected ? '> ' : '  '}
										{terminal.command}
										{index === 0 && <Text color="green"> (detected default)</Text>}
									</Text>
								</Box>
							);
						})
					)}
				</Box>
			)}

			{step === 'ide' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text bold color="yellow">
							💻 Default IDE
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>Used when opening a worktree in an editor.</Text>
					</Box>
					{ALL_IDE_TYPES.map((ideType, index) => {
						const isSelected = index === ideIndex;
						// Availability is probed asynchronously; default to available until
						// known so the "(not detected)" marker appears rather than flashing off.
						const isAvailable = ideAvailability[ideType] ?? true;
						return (
							<Box key={ideType}>
								<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
									{isSelected ? '> ' : '  '}
									{getIDEDisplayName(ideType)}
									{ideType === 'jetbrains-auto' && <Text color="green"> (recommended)</Text>}
									{!isAvailable && <Text dimColor> (not detected)</Text>}
								</Text>
							</Box>
						);
					})}
				</Box>
			)}

			{!(step === 'folder' && folderPhase === 'direnv') && (
				<Box marginTop={2} flexDirection="column">
					{step === 'folder' ? (
						<Text dimColor>
							Press <Text color="cyan">Enter</Text> to continue
						</Text>
					) : (
						<Text dimColor>
							<Text color="cyan">Up/Down</Text> Select - <Text color="cyan">Enter</Text>{' '}
							{step === 'ide' ? 'Finish' : 'Continue'} - <Text color="cyan">Left</Text> Back
						</Text>
					)}
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to skip setup with these defaults
					</Text>
				</Box>
			)}
		</Box>
	);
}
