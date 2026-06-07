import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';
import { hasExternalEditor, openExternalEditor } from '../utils/externalEditor.js';
import { PROMPT_PLACEHOLDER } from '../utils/promptTemplate.js';

// Starter content shown when editing an empty template.
const STARTER_TEMPLATE = `${PROMPT_PLACEHOLDER}\n`;

export function PromptTemplateSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);

	const [template, setTemplate] = useState<string | undefined>(
		() => settingsService.readSettings().promptTemplate
	);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const editorAvailable = hasExternalEditor();

	const handleEdit = () => {
		const edited = openExternalEditor(template && template.trim() ? template : STARTER_TEMPLATE, {
			extension: '.md',
			prefix: 'grove-prompt-template-',
		});

		if (edited === null) {
			return;
		}

		const cleaned = edited.trim();
		if (cleaned) {
			settingsService.updateSettings({ promptTemplate: cleaned });
			setTemplate(cleaned);
			setSavedMessage('Prompt template saved');
		} else {
			settingsService.updateSettings({ promptTemplate: undefined });
			setTemplate(undefined);
			setSavedMessage('Prompt template cleared');
		}
		setTimeout(() => setSavedMessage(null), 2000);
	};

	const handleClear = () => {
		settingsService.updateSettings({ promptTemplate: undefined });
		setTemplate(undefined);
		setSavedMessage('Prompt template cleared');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	useInput((input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (input === 'e' && editorAvailable) {
			handleEdit();
		} else if (input === 'r') {
			handleClear();
		}
	});

	const hasTemplate = !!(template && template.trim());
	const previewLines = hasTemplate ? template!.split('\n').slice(0, 8) : [];
	const truncated = hasTemplate && template!.split('\n').length > previewLines.length;

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Claude Prompt Template
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box flexDirection="column" marginBottom={1}>
				<Text dimColor>
					Used by the &quot;Instant Claude&quot; worktree action to prefill the prompt for a background
					session. The template opens in your editor before dispatching so you can edit it.
				</Text>
				<Text dimColor>
					Use <Text color="cyan">{PROMPT_PLACEHOLDER}</Text> to mark where the caret should be placed (it
					is removed before launching).
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Current template:</Text>
				{hasTemplate ? (
					<Box flexDirection="column" borderStyle="single" paddingX={1}>
						{previewLines.map((line, index) => (
							<Text key={index}>{line || ' '}</Text>
						))}
						{truncated && <Text dimColor>…</Text>}
					</Box>
				) : (
					<Text dimColor>(not set)</Text>
				)}
			</Box>

			{!editorAvailable && (
				<Box marginBottom={1}>
					<Text color="yellow">No editor found. Set the $EDITOR environment variable to edit.</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					{editorAvailable && (
						<>
							<Text color="cyan">e</Text> Edit template - {''}
						</>
					)}
					<Text color="cyan">r</Text> Clear template
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
