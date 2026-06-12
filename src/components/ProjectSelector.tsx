import React from 'react';

import { Box, Text, useInput } from 'ink';

interface ProjectSelectorProps {
	/** Green bold header line. */
	title: string;
	/** Repository whose projects are being listed (shown in the instruction). */
	repoName: string;
	projects: string[];
	/** Cursor position, owned by the parent. The trailing index is "Entire repository". */
	cursor: number;
	onCursorChange: (index: number) => void;
	onPickProject: (projectPath: string) => void;
	onPickEntireRepo: () => void;
	onCancel: () => void;
}

/**
 * Single-select project step for the add-worktree / fork flows: lists a single
 * repository's project folders plus a trailing "Entire repository" option.
 */
export function ProjectSelector({
	title,
	repoName,
	projects,
	cursor,
	onCursorChange,
	onPickProject,
	onPickEntireRepo,
	onCancel,
}: ProjectSelectorProps) {
	useInput((input, key) => {
		if (key.upArrow) {
			onCursorChange(cursor > 0 ? cursor - 1 : projects.length);
		} else if (key.downArrow) {
			onCursorChange(cursor < projects.length ? cursor + 1 : 0);
		} else if (input === ' ' || key.return) {
			if (cursor === projects.length) {
				onPickEntireRepo();
			} else {
				onPickProject(projects[cursor]);
			}
		} else if (key.escape) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					{title}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					Select a project from <Text color="yellow">{repoName}</Text>:
				</Text>
			</Box>

			<Box flexDirection="column" marginLeft={2}>
				{projects.map((projectPath, index) => {
					const isCursor = index === cursor;

					return (
						<Box key={projectPath}>
							<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
								{isCursor ? '❯ ' : '  '}
								{projectPath}
							</Text>
						</Box>
					);
				})}
				{/* Option to select entire repository */}
				<Box marginTop={1}>
					<Text
						color={cursor === projects.length ? 'cyan' : undefined}
						bold={cursor === projects.length}
					>
						{cursor === projects.length ? '❯ ' : '  '}
						<Text dimColor>(Entire repository)</Text>
					</Text>
				</Box>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>• Use ↑/↓ to navigate</Text>
				<Text dimColor>• Enter or Space to select</Text>
				<Text dimColor>• Esc to go back</Text>
			</Box>
		</Box>
	);
}
