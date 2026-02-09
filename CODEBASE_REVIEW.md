# Codebase Review: Grove

## Executive Summary

Grove is a well-structured ~8,200-line TypeScript CLI application with solid fundamentals: strict TypeScript, dependency injection, good test coverage for services, and clear separation of concerns. However, there are significant opportunities to reduce complexity, eliminate duplication, and better align with established patterns. The issues fall into 7 major categories.

---

## 1. Dual Storage APIs: The Biggest Source of Bloat

**Problem**: Every storage entity has *three* implementations of identical logic:
- Standalone functions (`storage.ts`, `repositories.ts`, `groves.ts`, `groveConfig.ts`)
- Service classes (`SettingsService.ts`, `RepositoryService.ts`, `GrovesService.ts`, `GroveConfigService.ts`)
- Interfaces in `interfaces.ts` that mirror both

For example, `repositories.ts` and `RepositoryService.ts` contain character-for-character identical logic for `readRepositories`, `writeRepositories`, `addRepository`, `removeRepository`, `getAllRepositories`, `updateRepository`. The only difference is one uses `getStorageConfig()` directly and the other uses `this.settingsService.getStorageConfig()`.

Similarly, `storage.ts:getStorageConfig()` and `SettingsService.getStorageConfig()` duplicate the same path construction logic. `groves.ts` and `GrovesService.ts` are the same story.

**Impact**: ~600+ lines of pure duplication across the storage layer. Both APIs must be maintained in sync. Bugs fixed in one may not be fixed in the other.

**Recommendation**: Delete the standalone functional files (`storage.ts`, `repositories.ts`, `groves.ts`, `groveConfig.ts`). Keep only the service classes. The standalone functions exist because they predate the DI system, but now that DI is in place, they serve no purpose. Update the few call sites that still use them (e.g., `GrovePanel.tsx:32` calls `readGroveMetadata` directly from the functional module, and `CreateGroveScreen.tsx:14-15` calls `addRecentSelections`/`getRecentSelections` directly). The `recentSelections.ts` standalone functions should be migrated into a `RecentSelectionsService` or folded into `GrovesService`.

---

## 2. Extract a Generic JSON Storage Base Class

**Problem**: Every storage service repeats the same pattern:

```typescript
readXxx(): XxxData {
    const config = this.settingsService.getStorageConfig();
    try {
        if (!fs.existsSync(config.xxxPath)) {
            const defaults = this.getDefaultXxx();
            this.writeXxx(defaults);
            return defaults;
        }
        const data = fs.readFileSync(config.xxxPath, 'utf-8');
        return JSON.parse(data) as XxxData;
    } catch (error) {
        console.error('Error reading xxx:', error);
        return this.getDefaultXxx();
    }
}

writeXxx(data: XxxData): void {
    const config = this.settingsService.getStorageConfig();
    try {
        if (!fs.existsSync(config.groveFolder)) {
            fs.mkdirSync(config.groveFolder, { recursive: true });
        }
        fs.writeFileSync(config.xxxPath, JSON.stringify(data, null, '\t'), 'utf-8');
    } catch (error) {
        console.error('Error writing xxx:', error);
        throw error;
    }
}
```

This read/write/default trio is repeated in `SettingsService`, `RepositoryService`, `GrovesService`, `SessionsService`, and `recentSelections.ts`.

**Recommendation**: Create a generic `JsonStore<T>` base class:

```typescript
class JsonStore<T> {
    constructor(
        private getFilePath: () => string,
        private getParentDir: () => string,
        private defaults: () => T
    ) {}

    read(): T { /* single implementation */ }
    write(data: T): void { /* single implementation */ }
    update(mutator: (data: T) => T): T {
        const data = this.read();
        const updated = mutator(data);
        this.write(updated);
        return updated;
    }
}
```

Each service instantiates a `JsonStore` with its specific paths and defaults. This eliminates ~200 lines of boilerplate and makes the pattern consistent.

---

## 3. Monolithic `interfaces.ts` (950 lines) Needs Splitting

**Problem**: `src/services/interfaces.ts` is a 950-line file containing:
- 14 service interfaces
- 8 result/data types (`GitCommandResult`, `WorktreeInfo`, `FileChangeStats`, etc.)
- Type aliases (`BranchUpstreamStatus`)
- Mixed storage and service concerns

This makes the file hard to navigate and violates the principle of co-locating interfaces with implementations.

**Recommendation**: Co-locate each interface with its implementation:

```
src/services/GitService.ts      -> export interface IGitService { ... }
src/services/GroveService.ts    -> export interface IGroveService { ... }
src/storage/SettingsService.ts  -> export interface ISettingsService { ... }
```

Shared result types (`GitCommandResult`, `FileChangeStats`, etc.) can live in `src/services/types.ts`, which already exists but is underused.

---

## 4. Router Type Safety is Broken

**Problem**: The `Router.tsx` component uses unsafe runtime type checks instead of leveraging TypeScript's type system:

```typescript
case 'groveDetail':
    return <GroveDetailScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
```

This `'groveId' in current.params` pattern is repeated 12 times across the router, each time with an empty string fallback that would silently produce broken behavior. The navigation types in `types.ts` define `ScreenParams` but the router doesn't use discriminated unions properly.

**Recommendation**: Define a proper route map type and use a type-safe routing approach:

```typescript
type RouteMap = {
    home: {};
    groveDetail: { groveId: string };
    closeGrove: { groveId: string };
    closeWorktree: { groveId: string; worktreePath: string };
    // ...
};
```

Then use a typed `useNavigation<ScreenName>()` hook that returns properly typed params, eliminating all the `'x' in params` guards. Alternatively, use a `getParam` utility that throws instead of silently returning empty strings.

---

## 5. Screen Components are Too Large and Contain Business Logic

**Problem**: Screen components like `GroveDetailScreen.tsx` (712 lines) and `CreateGroveScreen.tsx` (707 lines) contain:
- Data fetching logic
- Business logic (building selections, IDE resolution)
- Complex state machines (8+ `useState` hooks)
- Multiple sub-views rendered conditionally
- Inline service instantiation (`const groveConfigService = new GroveConfigService()` at `GroveDetailScreen.tsx:43`, bypassing DI entirely)

This makes screens hard to test, reason about, and maintain.

**Recommendations**:

a) **Extract custom hooks for data fetching**: `useGroveDetails(groveId)` could encapsulate the 50+ lines of `useEffect` data loading in `GroveDetailScreen`.

b) **Use a reducer for complex state machines**: `CreateGroveScreen` has 8 steps with 10+ state variables. A `useReducer` with a proper state machine would make transitions explicit and testable.

c) **Never bypass DI**: The `new GroveConfigService()` on line 43 of `GroveDetailScreen.tsx` bypasses the DI container. Use `useService(GroveConfigServiceToken)` instead.

d) **Extract sub-views into components**: The init log viewer, action menu, and worktree list in `GroveDetailScreen` could each be separate components, bringing the main component under 200 lines.

---

## 6. Entry Point (`index.tsx`) is a 200-line Procedural Script

**Problem**: `src/index.tsx` is a top-level script that:
- Manually instantiates services outside the DI container
- Has a 15-branch `if/else if` chain for CLI argument parsing
- Duplicates DI setup logic (creates `WorkspaceService` and `SettingsService` manually, then also registers them in the container)
- Contains inline async IIFEs for each command

**Recommendations**:

a) **Use a proper CLI framework** or at minimum a command registry pattern. The current argument parsing doesn't support `--help`, subcommand validation, or consistent error messages.

b) **Consolidate DI initialization**: The entry point creates `WorkspaceService` and `SettingsService` manually before DI initialization, then re-creates them inside the DI container. Instead, bootstrap the DI container first and resolve everything from it:

```typescript
const container = bootstrapContainer(process.cwd());
const settingsService = container.resolve(SettingsServiceToken);
```

c) **Use a command map** instead of if/else:

```typescript
const commands: Record<string, (args: string[]) => Promise<void>> = {
    create: handleCreate,
    'add-worktree': handleAddWorktree,
    claude: handleClaude,
    // ...
};
```

---

## 7. Additional Issues

### 7a. `getStorageConfig()` Constructs Paths on Every Call

`SettingsService.getStorageConfig()` and `storage.ts:getStorageConfig()` both construct all 6 paths using `path.join` on every invocation. Since the paths never change after initialization, compute them once in the constructor and cache the result.

### 7b. `GrovePanel.tsx` Performs Synchronous I/O During Render

`GrovePanel.tsx:32-48` calls `readGroveMetadata()` (which does `fs.readFileSync`) directly inside the component render function. This blocks the UI thread on every re-render. This data should be loaded asynchronously via `useEffect` or passed as props from the parent.

### 7c. Console Output for Error Handling

Throughout the storage layer, `console.error()` is used for error reporting (e.g., `SettingsService.ts:110`, `RepositoryService.ts:44`, `GrovesService.ts:45`). In a TUI app built with Ink, console output interferes with the rendered UI. Errors should either be thrown (and caught at the UI boundary) or routed through a logging service.

### 7d. `recentSelections.ts` Has No Service Class

Every other storage entity (`settings`, `repositories`, `groves`, `sessions`, `groveConfig`) has a service class, but `recentSelections` is still purely functional. This inconsistency means it uses the hardcoded global `getStorageConfig()` instead of workspace-aware paths, so recent selections don't work correctly in workspace mode.

### 7e. Unused/Dead Code

- `storage.ts` standalone functions are fully superseded by `SettingsService`
- `repositories.ts` standalone functions are fully superseded by `RepositoryService`
- `groves.ts` standalone functions are fully superseded by `GrovesService`
- `groveConfig.ts` standalone functions are fully superseded by `GroveConfigService`
- The `Message` type in `components/types.ts` appears to only be used by `MessageList.tsx`, which itself is only used in `ChatScreen.tsx` - a screen that's described as "placeholder, not connected to LLM"

### 7f. Test Helpers Could Be More Ergonomic

The `createMockFs()` helper requires every test to manually set up `vi.mock('fs', ...)`. A shared test setup module that does this once would reduce boilerplate across all 10 test files.

### 7g. The Plugin and Agent Systems Are Premature Abstractions

`src/plugins/` (PluginRegistry, AsanaPlugin) and `src/agents/` (AdapterRegistry, ClaudeAdapter) are registered in the DI container and instantiated on every app startup, but they're effectively stubs. The AsanaPlugin appears to be the only plugin, and ClaudeAdapter is the only adapter. Until there are 2+ plugins/adapters, these registries add indirection without benefit.

---

## Prioritized Refactoring Plan

| Priority | Effort | Item | Impact |
|----------|--------|------|--------|
| **High** | Medium | Delete dual storage APIs (standalone functions) | Eliminates ~600 lines of duplication |
| **High** | Low | Fix DI bypass in `GroveDetailScreen` | Correctness issue |
| **High** | Low | Fix sync I/O in `GrovePanel` render | UI performance issue |
| **High** | Low | Replace `console.error` with thrown errors | Fixes TUI corruption |
| **Medium** | Medium | Extract `JsonStore<T>` base class | Eliminates ~200 lines of boilerplate |
| **Medium** | Medium | Split `interfaces.ts` into per-service files | Better code organization |
| **Medium** | Medium | Type-safe router | Eliminates 12 unsafe runtime checks |
| **Medium** | High | Extract hooks/reducers from large screens | Testability, maintainability |
| **Medium** | Medium | Refactor `index.tsx` with command registry | Better CLI architecture |
| **Low** | Low | Create `RecentSelectionsService` | Workspace mode correctness |
| **Low** | Low | Cache `getStorageConfig()` result | Minor performance |
| **Low** | Low | Simplify plugin/agent registries | Reduce premature abstraction |
