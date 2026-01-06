import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface SessionIndicatorProps {
	activeCount: number;
	idleCount: number;
	attentionCount: number;
}

// Grove-style loader frames
const LOADER_FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'];

export function SessionIndicator({
	activeCount,
	idleCount,
	attentionCount,
}: SessionIndicatorProps) {
	const [frameIndex, setFrameIndex] = useState(0);

	// Animate loader if there are active sessions
	useEffect(() => {
		if (activeCount === 0) return;

		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % LOADER_FRAMES.length);
		}, 100); // 100ms per frame for smooth animation

		return () => clearInterval(interval);
	}, [activeCount]);

	if (activeCount === 0 && idleCount === 0 && attentionCount === 0) {
		return null;
	}

	return (
		<Box gap={1}>
			{activeCount > 0 && (
				<Text color="green">
					{LOADER_FRAMES[frameIndex]} {activeCount}
				</Text>
			)}
			{idleCount > 0 && <Text color="gray">· {idleCount}</Text>}
			{attentionCount > 0 && <Text color="yellow">⚠ {attentionCount}</Text>}
		</Box>
	);
}
