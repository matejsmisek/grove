import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useTasks } from '../hooks/useTasks.js';
import { useNavigation } from '../navigation/useNavigation.js';
import type { Task, TaskStatus } from '../services/TaskService.js';
import { TaskServiceToken } from '../services/tokens.js';

const STATUS_ICON: Record<TaskStatus, string> = {
	pending: '◌',
	running: '●',
	succeeded: '✓',
	failed: '✗',
	cancelled: '⊘',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
	pending: 'gray',
	running: 'yellow',
	succeeded: 'green',
	failed: 'red',
	cancelled: 'gray',
};

/** Extract a groveId a finished task points at, for navigation */
function groveIdFor(task: Task): string | undefined {
	const result = task.result as { id?: string } | undefined;
	if (result?.id) {
		return result.id;
	}
	const metaGroveId = task.meta.groveId;
	return typeof metaGroveId === 'string' ? metaGroveId : undefined;
}

/**
 * Background tasks ("activity") screen. Lists running and recent tasks, shows
 * the selected task's live log, and lets the user jump to a finished task's
 * grove or dismiss completed tasks.
 */
export function ActivityScreen() {
	const { goBack, navigate } = useNavigation();
	const taskService = useService(TaskServiceToken);
	const tasks = useTasks();
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Keep the selection within bounds as tasks are added/removed.
	useEffect(() => {
		if (selectedIndex > tasks.length - 1) {
			setSelectedIndex(Math.max(0, tasks.length - 1));
		}
	}, [tasks.length, selectedIndex]);

	const selectedTask = tasks[selectedIndex];

	useInput((input, key) => {
		if (key.escape) {
			goBack();
			return;
		}

		if (tasks.length === 0) {
			return;
		}

		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : tasks.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < tasks.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			if (!selectedTask) return;
			const groveId = groveIdFor(selectedTask);
			if (groveId && selectedTask.status === 'succeeded') {
				navigate('groveDetail', { groveId });
			}
		} else if (input === 'd') {
			// Dismiss a finished task (no-op for running ones)
			if (selectedTask) {
				taskService.remove(selectedTask.id);
			}
		}
	});

	if (tasks.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Background Tasks
					</Text>
				</Box>
				<Text dimColor>No background tasks.</Text>
				<Box marginTop={1}>
					<Text dimColor>Press Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					Background Tasks
				</Text>
			</Box>

			{/* Task list */}
			<Box flexDirection="column">
				{tasks.map((task, index) => {
					const isCursorSelected = index === selectedIndex;
					return (
						<Box key={task.id}>
							<Text color={isCursorSelected ? 'cyan' : undefined} bold={isCursorSelected}>
								{isCursorSelected ? '❯ ' : '  '}
								<Text color={STATUS_COLOR[task.status]}>{STATUS_ICON[task.status]}</Text> {task.title}
							</Text>
						</Box>
					);
				})}
			</Box>

			{/* Selected task detail: status + recent log */}
			{selectedTask && (
				<Box flexDirection="column" marginTop={1}>
					<Text>
						Status: <Text color={STATUS_COLOR[selectedTask.status]}>{selectedTask.status}</Text>
					</Text>
					{selectedTask.error && <Text color="red">Error: {selectedTask.error.message}</Text>}
					{selectedTask.log.length > 0 && (
						<Box
							flexDirection="column"
							borderStyle="single"
							borderColor="gray"
							paddingX={1}
							marginTop={1}
						>
							{selectedTask.log.slice(-12).map((line, index) => (
								<Text key={index} dimColor>
									{line.text}
								</Text>
							))}
						</Box>
					)}
				</Box>
			)}

			{/* Help text */}
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>• Use ↑/↓ to navigate</Text>
				<Text dimColor>• Enter to open grove (finished tasks)</Text>
				<Text dimColor>• d to dismiss a finished task</Text>
				<Text dimColor>• Esc to go back</Text>
			</Box>
		</Box>
	);
}
