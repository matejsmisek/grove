import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';

type FieldType = 'apiKey' | 'model' | 'siteUrl' | 'appName' | null;

const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku';
const SUGGESTED_MODELS = [
	'anthropic/claude-3.5-haiku',
	'anthropic/claude-3.5-sonnet',
	'anthropic/claude-3-haiku',
	'anthropic/claude-3-sonnet',
	'openai/gpt-4o',
	'openai/gpt-4o-mini',
];

export function LLMSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const settings = settingsService.readSettings();

	const [fieldIndex, setFieldIndex] = useState(0); // 0 = apiKey, 1 = model, 2 = siteUrl, 3 = appName
	const [editingField, setEditingField] = useState<FieldType>(null);
	const [tempApiKey, setTempApiKey] = useState(settings.openrouterApiKey || '');
	const [tempModel, setTempModel] = useState(settings.llmModel || DEFAULT_MODEL);
	const [tempSiteUrl, setTempSiteUrl] = useState(settings.llmSiteUrl || '');
	const [tempAppName, setTempAppName] = useState(settings.llmAppName || '');
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	// Save API key
	const saveApiKey = () => {
		settingsService.updateSettings({ openrouterApiKey: tempApiKey });
		setEditingField(null);
		setSavedMessage('API key saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Save model
	const saveModel = () => {
		settingsService.updateSettings({ llmModel: tempModel });
		setEditingField(null);
		setSavedMessage('Model saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Save site URL
	const saveSiteUrl = () => {
		settingsService.updateSettings({ llmSiteUrl: tempSiteUrl || undefined });
		setEditingField(null);
		setSavedMessage('Site URL saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Save app name
	const saveAppName = () => {
		settingsService.updateSettings({ llmAppName: tempAppName || undefined });
		setEditingField(null);
		setSavedMessage('App name saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Mask API key for display (show only first 8 and last 4 characters)
	const maskApiKey = (key: string): string => {
		if (key.length <= 12) {
			return key.substring(0, 4) + '...' + key.substring(key.length - 4);
		}
		return key.substring(0, 8) + '...' + key.substring(key.length - 4);
	};

	useInput(
		(input, key) => {
			if (editingField !== null) return;

			if (key.escape && canGoBack) {
				goBack();
			} else if (key.upArrow) {
				setFieldIndex((prev) => (prev > 0 ? prev - 1 : 3));
			} else if (key.downArrow) {
				setFieldIndex((prev) => (prev < 3 ? prev + 1 : 0));
			} else if (key.return) {
				if (fieldIndex === 0) setEditingField('apiKey');
				else if (fieldIndex === 1) setEditingField('model');
				else if (fieldIndex === 2) setEditingField('siteUrl');
				else if (fieldIndex === 3) setEditingField('appName');
			}
		},
		{ isActive: editingField === null }
	);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					LLM Settings (OpenRouter)
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Configure OpenRouter API for AI-powered features</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text color={fieldIndex === 0 ? 'cyan' : undefined}>{fieldIndex === 0 ? '> ' : '  '}</Text>
					<Text bold={fieldIndex === 0}>API Key: </Text>
					{editingField === 'apiKey' ? (
						<TextInput value={tempApiKey} onChange={setTempApiKey} onSubmit={saveApiKey} />
					) : (
						<Text color="cyan">
							{tempApiKey ? maskApiKey(tempApiKey) : <Text dimColor>(not set)</Text>}
						</Text>
					)}
				</Box>
				<Box marginTop={1}>
					<Text color={fieldIndex === 1 ? 'cyan' : undefined}>{fieldIndex === 1 ? '> ' : '  '}</Text>
					<Text bold={fieldIndex === 1}>Model: </Text>
					{editingField === 'model' ? (
						<TextInput value={tempModel} onChange={setTempModel} onSubmit={saveModel} />
					) : (
						<Text color="cyan">{tempModel}</Text>
					)}
				</Box>
				<Box marginTop={1}>
					<Text color={fieldIndex === 2 ? 'cyan' : undefined}>{fieldIndex === 2 ? '> ' : '  '}</Text>
					<Text bold={fieldIndex === 2}>Site URL (optional): </Text>
					{editingField === 'siteUrl' ? (
						<TextInput value={tempSiteUrl} onChange={setTempSiteUrl} onSubmit={saveSiteUrl} />
					) : (
						<Text color="cyan">{tempSiteUrl || <Text dimColor>(not set)</Text>}</Text>
					)}
				</Box>
				<Box marginTop={1}>
					<Text color={fieldIndex === 3 ? 'cyan' : undefined}>{fieldIndex === 3 ? '> ' : '  '}</Text>
					<Text bold={fieldIndex === 3}>App Name (optional): </Text>
					{editingField === 'appName' ? (
						<TextInput value={tempAppName} onChange={setTempAppName} onSubmit={saveAppName} />
					) : (
						<Text color="cyan">{tempAppName || <Text dimColor>(not set)</Text>}</Text>
					)}
				</Box>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Get your API key at: https://openrouter.ai/keys</Text>
				<Text dimColor>Suggested models: {SUGGESTED_MODELS.slice(0, 3).join(', ')}, or custom</Text>
				<Text dimColor>Optional: Site URL and App Name are not sent by default</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Edit
				</Text>
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				)}
			</Box>
		</Box>
	);
}
