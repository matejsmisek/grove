import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from '../components/GroveTextInput.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SessionTemplateServiceToken, SettingsServiceToken } from '../services/tokens.js';
import type { TerminalId, TerminalSettings } from '../storage/types.js';
import { adaptersForPlatform, getAdapter, isAdapterAvailable } from '../terminals/index.js';
import { openExternalEditor } from '../utils/externalEditor.js';

type ViewMode = 'select' | 'configureCustom';

/**
 * Unified terminal settings. Selects the single default terminal used for both
 * "Open terminal" and "Open/Attach Claude", and nests each terminal's Claude
 * session template (and the custom command for the `custom` id) as sub-settings.
 */
export function TerminalSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const sessionTemplateService = useService(SessionTemplateServiceToken);
	const settings = settingsService.readSettings();

	const terminals = adaptersForPlatform();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);
	const [availability, setAvailability] = useState<Partial<Record<TerminalId, boolean>>>({});
	const [viewMode, setViewMode] = useState<ViewMode>('select');

	// Custom-command editing state.
	const [customFieldIndex, setCustomFieldIndex] = useState(0); // 0 = command, 1 = args
	const [editingField, setEditingField] = useState<'command' | 'args' | null>(null);
	const [tempCommand, setTempCommand] = useState('');
	const [tempArgs, setTempArgs] = useState('');

	// Detect installed terminals once on mount (async, non-blocking).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const entries = await Promise.all(
				terminals.map(async (a): Promise<[TerminalId, boolean]> => [a.id, await isAdapterAvailable(a)])
			);
			if (!cancelled) {
				setAvailability(Object.fromEntries(entries) as Partial<Record<TerminalId, boolean>>);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [terminals]);

	const flash = (message: string) => {
		setSavedMessage(message);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	const handleSelectTerminal = (id: TerminalId) => {
		settingsService.updateSettings({ selectedTerminal: id });
		flash(`Selected ${getAdapter(id)?.displayName ?? id} as default terminal`);
	};

	const setTemplate = (id: TerminalId, template: string | undefined) => {
		const current = settings.terminalConfigs ?? {};
		const entry: TerminalSettings = { ...current[id] };
		if (template) {
			entry.claudeSessionTemplate = template;
		} else {
			delete entry.claudeSessionTemplate;
		}
		const next = { ...current, [id]: entry };
		if (Object.keys(entry).length === 0) {
			delete next[id];
		}
		settingsService.updateSettings({
			terminalConfigs: Object.keys(next).length > 0 ? next : undefined,
		});
	};

	const handleEditTemplate = (id: TerminalId) => {
		const adapter = getAdapter(id);
		if (!adapter?.editableTemplate) {
			flash(`${adapter?.displayName ?? id} has no editable session template`);
			return;
		}
		const header = `# ${adapter.displayName} Claude session template
# Available variables:
#   \${WORKING_DIR}   - Working directory path
#   \${AGENT_COMMAND} - Claude command (claude or claude --resume <id>)
#
# Save and close to apply. Leave empty to reset to default.
# Lines starting with # are comments and will be removed.

`;
		const edited = openExternalEditor(header + sessionTemplateService.getEffectiveTemplate(id), {
			extension: '.txt',
			prefix: `grove-${id}-template-`,
		});
		if (edited === null) {
			return;
		}
		const cleaned = edited
			.split('\n')
			.filter((line) => !line.startsWith('#'))
			.join('\n')
			.trim();
		setTemplate(id, cleaned || undefined);
		flash(cleaned ? 'Template saved' : 'Template reset to default');
	};

	const handleResetTemplate = (id: TerminalId) => {
		setTemplate(id, undefined);
		flash(`Reset ${getAdapter(id)?.displayName ?? id} template to default`);
	};

	const startConfigureCustom = () => {
		const custom = settings.terminalConfigs?.custom;
		setTempCommand(custom?.customCommand ?? '');
		setTempArgs((custom?.customArgs ?? ['{path}']).join(' '));
		setCustomFieldIndex(0);
		setEditingField(null);
		setViewMode('configureCustom');
	};

	const saveCustom = () => {
		const current = settings.terminalConfigs ?? {};
		const entry: TerminalSettings = {
			...current.custom,
			customCommand: tempCommand,
			customArgs: tempArgs.split(' ').filter((a) => a.length > 0),
		};
		settingsService.updateSettings({ terminalConfigs: { ...current, custom: entry } });
		flash('Saved');
	};

	useInput(
		(input, key) => {
			if (viewMode === 'select') {
				if (key.escape && canGoBack) {
					goBack();
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : terminals.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < terminals.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					handleSelectTerminal(terminals[selectedIndex].id);
				} else if (input === 'e') {
					handleEditTemplate(terminals[selectedIndex].id);
				} else if (input === 'r') {
					handleResetTemplate(terminals[selectedIndex].id);
				} else if (input === 'c' && terminals[selectedIndex].id === 'custom') {
					startConfigureCustom();
				}
			} else if (viewMode === 'configureCustom' && editingField === null) {
				if (key.escape) {
					setViewMode('select');
				} else if (key.upArrow) {
					setCustomFieldIndex((prev) => (prev > 0 ? prev - 1 : 1));
				} else if (key.downArrow) {
					setCustomFieldIndex((prev) => (prev < 1 ? prev + 1 : 0));
				} else if (key.return) {
					setEditingField(customFieldIndex === 0 ? 'command' : 'args');
				}
			}
		},
		{ isActive: editingField === null }
	);

	if (viewMode === 'configureCustom') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Configure Custom Terminal
					</Text>
				</Box>
				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}
				<Box flexDirection="column" marginBottom={1}>
					<Box>
						<Text color={customFieldIndex === 0 ? 'cyan' : undefined}>
							{customFieldIndex === 0 ? '> ' : '  '}
						</Text>
						<Text bold={customFieldIndex === 0}>Command: </Text>
						{editingField === 'command' ? (
							<TextInput
								value={tempCommand}
								onChange={setTempCommand}
								onSubmit={() => {
									setEditingField(null);
									saveCustom();
								}}
							/>
						) : (
							<Text color="cyan">{tempCommand || '(none)'}</Text>
						)}
					</Box>
					<Box marginTop={1}>
						<Text color={customFieldIndex === 1 ? 'cyan' : undefined}>
							{customFieldIndex === 1 ? '> ' : '  '}
						</Text>
						<Text bold={customFieldIndex === 1}>Arguments: </Text>
						{editingField === 'args' ? (
							<TextInput
								value={tempArgs}
								onChange={setTempArgs}
								onSubmit={() => {
									setEditingField(null);
									saveCustom();
								}}
							/>
						) : (
							<Text color="cyan">{tempArgs || '(none)'}</Text>
						)}
					</Box>
				</Box>
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						Use <Text color="cyan">{'{path}'}</Text> as placeholder for the directory path
					</Text>
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Edit -{' '}
						<Text color="cyan">ESC</Text> Back
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Terminal Settings
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select your default terminal (used for Open Terminal and Open Claude):</Text>
			</Box>

			{terminals.map((adapter, index) => {
				const isSelected = index === selectedIndex;
				const isCurrent = settings.selectedTerminal === adapter.id;
				const isAvailable = availability[adapter.id] ?? true;
				const hasCustomTemplate =
					settings.terminalConfigs?.[adapter.id]?.claudeSessionTemplate !== undefined;

				return (
					<Box key={adapter.id}>
						<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
							{isSelected ? '> ' : '  '}
							{adapter.displayName}
							{isCurrent && <Text color="green"> (current)</Text>}
							{hasCustomTemplate && <Text color="yellow"> (custom template)</Text>}
							{!adapter.multiTab && adapter.id !== 'custom' && <Text dimColor> (single window)</Text>}
							{!isAvailable && <Text dimColor> (not detected)</Text>}
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Enter</Text> Select default - <Text color="cyan">e</Text> Edit template
					{' - '}
					<Text color="cyan">r</Text> Reset template - <Text color="cyan">c</Text> Configure custom
				</Text>
				{canGoBack && (
					<Text dimColor>
						<Text color="cyan">ESC</Text> Go back
					</Text>
				)}
			</Box>
		</Box>
	);
}
