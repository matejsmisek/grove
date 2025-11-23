# Grove Navigation System

A React Router-like navigation system for the Grove CLI application.

## Overview

The navigation system provides a type-safe way to navigate between different screens in Grove, similar to how React Router works in web applications.

## Architecture

```
navigation/
├── types.ts              # Route definitions and types
├── NavigationContext.tsx # Context provider and state management
├── useNavigation.ts      # Hook for accessing navigation
└── Router.tsx            # Component that renders current screen
```

## Usage

### 1. Define Routes

Routes are defined in `types.ts`:

```typescript
export type Routes = {
	home: Record<string, never>; // No params
	chat: Record<string, never>; // No params
	settings: { section?: string }; // Optional param
	'git-log': { branch: string; limit?: number }; // Required + optional param
};
```

### 2. Navigate Between Screens

Use the `useNavigation` hook in any component:

```typescript
import { useNavigation } from '../navigation/useNavigation';

function MyComponent() {
	const { navigate, goBack, canGoBack } = useNavigation();

	// Navigate to home (no params)
	navigate('home', {});

	// Navigate to chat (no params)
	navigate('chat', {});

	// Navigate to settings with optional param
	navigate('settings', { section: 'git' });

	// Navigate with required params - TypeScript ensures you pass them!
	navigate('git-log', { branch: 'main', limit: 10 });

	// Go back to previous screen
	if (canGoBack) {
		goBack();
	}
}
```

### 3. Create a Screen Component

```typescript
// src/screens/MyScreen.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../navigation/useNavigation';

interface MyScreenProps {
  branch: string;
  limit?: number;
}

export function MyScreen({ branch, limit = 20 }: MyScreenProps) {
  const { navigate } = useNavigation();

  return (
    <Box flexDirection="column">
      <Text>Branch: {branch}</Text>
      <Text>Limit: {limit}</Text>
    </Box>
  );
}
```

### 4. Register Screen in Router

Add your screen to the Router switch statement:

```typescript
// src/navigation/Router.tsx
import { MyScreen } from '../screens/MyScreen';

export function Router() {
  const { current } = useNavigation();

  switch (current.screen) {
    case 'home':
      return <HomeScreen />;
    case 'my-screen':
      return <MyScreen
        branch={'branch' in current.params ? current.params.branch : ''}
        limit={'limit' in current.params ? current.params.limit : undefined}
      />;
    // ... other cases
  }
}
```

## Key Features

### Type Safety ✨

TypeScript ensures you pass the correct parameters when navigating:

```typescript
// ✅ Correct
navigate('settings', { section: 'git' });

// ❌ TypeScript error - missing required param
navigate('git-log', {});

// ❌ TypeScript error - wrong param type
navigate('settings', { section: 123 });
```

### Navigation History

The system automatically maintains navigation history:

```typescript
const { history, canGoBack, goBack } = useNavigation();

// Check if user can go back
if (canGoBack) {
	goBack(); // Returns to previous screen
}

// Access full history
console.log(history.length); // Number of screens in history
```

### Current Screen State

Access the current screen and its params anywhere:

```typescript
const { current } = useNavigation();

console.log(current.screen); // e.g., 'settings'
console.log(current.params); // e.g., { section: 'git' }
```

## Examples

### Example 1: Simple Navigation

```typescript
function HomeScreen() {
  const { navigate } = useNavigation();

  return (
    <Box>
      <Text>Press 'c' to open chat</Text>
      {/* In a real app, you'd handle keyboard input */}
      <Button onPress={() => navigate('chat', {})}>
        Go to Chat
      </Button>
    </Box>
  );
}
```

### Example 2: Navigation with Parameters

```typescript
function GitStatusScreen() {
  const { navigate } = useNavigation();

  const viewLog = (branch: string) => {
    navigate('git-log', { branch, limit: 50 });
  };

  return (
    <Box>
      <Text>Current branch: main</Text>
      <Button onPress={() => viewLog('main')}>
        View Log
      </Button>
    </Box>
  );
}
```

### Example 3: Back Navigation

```typescript
function SettingsScreen() {
  const { goBack, canGoBack } = useNavigation();

  return (
    <Box>
      <Text>Settings</Text>
      {canGoBack && (
        <Button onPress={goBack}>
          Back
        </Button>
      )}
    </Box>
  );
}
```

## Adding a New Route

1. **Add route type** in `types.ts`:

   ```typescript
   export type Routes = {
   	// ... existing routes
   	'my-new-screen': { id: string; mode?: 'view' | 'edit' };
   };
   ```

2. **Create screen component** in `src/screens/`:

   ```typescript
   export function MyNewScreen({ id, mode = 'view' }: { id: string; mode?: 'view' | 'edit' }) {
   	// Component implementation
   }
   ```

3. **Register in Router** (`navigation/Router.tsx`):

   ```typescript
   case 'my-new-screen':
     return <MyNewScreen
       id={'id' in current.params ? current.params.id : ''}
       mode={'mode' in current.params ? current.params.mode : undefined}
     />;
   ```

4. **Navigate to it** from anywhere:
   ```typescript
   navigate('my-new-screen', { id: '123', mode: 'edit' });
   ```

## Best Practices

1. **Keep routes flat** - Avoid deeply nested route structures
2. **Use meaningful names** - Route names should describe what the screen does
3. **Limit parameters** - If you need many params, consider state management instead
4. **Type required params** - Don't make everything optional
5. **Handle missing params** - Always provide defaults or handle undefined cases
6. **Clean up history** - Consider max history length for memory-constrained environments

## Future Enhancements

Potential improvements to consider:

- **Route Guards**: Middleware to prevent navigation based on conditions
- **Deep Linking**: Parse CLI args to initial route
- **Screen Transitions**: Fade effects between screens
- **Nested Routes**: Parent/child route relationships
- **Query Parameters**: Additional metadata without route redefinition
- **History Limits**: Maximum history length configuration
- **State Preservation**: Preserve screen state when navigating

## Troubleshooting

### Error: "useNavigation must be used within a NavigationProvider"

Make sure your App component is wrapped with `NavigationProvider`:

```typescript
function App() {
  return (
    <NavigationProvider initialScreen="home">
      <Router />
    </NavigationProvider>
  );
}
```

### TypeScript Error: Property doesn't exist on params

Use type narrowing in the Router:

```typescript
case 'settings':
  return <SettingsScreen
    section={'section' in current.params ? current.params.section : undefined}
  />;
```

### Screen not rendering

Check that:

1. Route is defined in `types.ts`
2. Screen is imported in `Router.tsx`
3. Case exists in Router's switch statement
4. Component is exported from screen file
