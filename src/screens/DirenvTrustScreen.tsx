import React, { useState } from 'react';

import { Box, Text } from 'ink';

import { DirenvWhitelistPrompt } from '../components/DirenvWhitelistPrompt.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';

/**
 * One-time startup gate that offers to add the auto-derived groves folder to
 * direnv's whitelist. Shown in repo/workspace mode (where the setup wizard never
 * runs and the groves folder is derived from the context) when direnv is
 * installed and the folder is not yet trusted. Records the folder it asked about
 * so the prompt is not shown again on the next launch, then continues to home.
 */
export function DirenvTrustScreen() {
	const { replace } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const [folder] = useState(() => settingsService.readSettings().workingFolder);

	const handleComplete = () => {
		// Remember we asked about this folder so a decline doesn't re-prompt next launch.
		settingsService.updateSettings({ direnvWhitelistPromptedFolder: folder });
		replace('home', {});
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Grove
				</Text>
			</Box>
			<DirenvWhitelistPrompt folder={folder} onComplete={handleComplete} />
		</Box>
	);
}
