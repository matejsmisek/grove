---
name: Grove Orchestration
description: Use when the user asks to "use grove", "create a grove", "orchestrate agents", "launch agents", "multi-agent", "work across repos", "parallel agents", or wants to use Grove CLI to manage worktrees and launch separate Claude agents. Provides workflow for creating groves, adding worktrees, and launching agents via Grove CLI.
version: 1.0.0
---

# Grove Orchestration

This skill orchestrates multi-agent workflows using the Grove CLI. Grove manages collections of git worktrees, and this skill uses them to launch parallel Claude agents working in isolated branches.

## Core Concepts

- **Grove**: A collection of git worktrees grouped for a task. Represents a user story or feature — the top-level unit of work.
- **Worktree**: A lightweight git checkout within a grove. Each gets its own branch. Represents a dev subtask — one focused piece of work (e.g., a single API endpoint, a single UI screen, a database migration).
- **Repository format**: `reponame` for full repo, `reponame.projectfolder` for monorepo projects.
- **Same repo, multiple worktrees**: A grove can contain multiple worktrees from the same repository. Each worktree gets its own isolated branch. This is the typical pattern — break a user story into subtasks, each subtask gets its own worktree even if they all target the same repo.
- **Orchestration**: Create a grove (the user story), add worktrees (the subtasks), then launch Claude agents (via the Task tool) in each worktree directory.

## Workflow

### Step 1: Discover What's Available

List existing groves and understand what repositories are registered.

```bash
# List existing groves (machine-readable)
grove list --json

# List existing groves (human-readable)
grove list
```

If the user references a repository that may not be registered yet, they'll need to register it first:

```bash
cd /path/to/repository
grove --register
```

### Step 2: Plan the Subtasks

Before creating the grove, break the user story into subtasks. Each subtask becomes a worktree with its own agent.

**Example**: User story "Add user authentication"

- Subtask 1: "auth-api-login" — POST /auth/login endpoint (backend repo)
- Subtask 2: "auth-api-register" — POST /auth/register endpoint (backend repo)
- Subtask 3: "auth-middleware" — JWT middleware (backend repo)
- Subtask 4: "auth-login-screen" — Login form UI (frontend repo)
- Subtask 5: "auth-register-screen" — Registration form UI (frontend repo)

Note: backend repo appears 3 times, frontend repo appears 2 times — each subtask gets its own worktree and branch even within the same repository.

### Step 3: Create the Grove

Based on the user's task, create a grove. Choose between two strategies:

**Single-worktree grove** (one subtask, simplest case):

```bash
grove create "<story-name>" <reponame>
```

This returns the grove ID, path, and creates the initial worktree.

**Multi-worktree grove** (multiple subtasks — the typical case):

```bash
# Create empty grove first (the user story)
grove create "<story-name>" --empty

# Add a worktree for each subtask
grove add-worktree <grove-id> "<subtask-name>" <reponame>
grove add-worktree <grove-id> "<subtask-name>" <reponame>
grove add-worktree <grove-id> "<subtask-name>" <other-repo>
```

**Naming conventions**:

- Grove name should describe the user story (e.g., "add-auth-flow", "fix-billing-bug")
- Worktree names should describe the specific subtask (e.g., "auth-api-login", "login-screen", "jwt-middleware")

### Step 4: Get Grove Details

After creation, retrieve the full grove structure to get worktree paths:

```bash
grove list --json
```

Parse the JSON output to extract each worktree's `projectPath` (the working directory for agents).

### Step 5: Launch Agents

Use the **Task tool** to launch Claude agents in each worktree. Each agent works in its own isolated git branch.

**IMPORTANT**: Use `subagent_type: "Bash"` or `subagent_type: "general-purpose"` for the agents. Set the working directory by having the agent `cd` into the worktree path before doing work.

**For each worktree, launch a Task agent with a prompt like:**

```
You are working in the git worktree at: <projectPath>

Your task: <specific subtask description>

IMPORTANT:
- cd to <projectPath> before doing any work
- You are on an isolated branch, make commits freely
- Run the project's quality checks before committing (lint, typecheck, tests)
- Commit your changes when done with a descriptive message

Context about the overall user story: <brief description of the full story>
```

**Launch agents in parallel** when their subtasks are independent:

- Use multiple Task tool calls in a single message
- Each agent gets its own worktree path and specific subtask description
- Agents can work simultaneously without conflicts (separate branches)

**Launch agents sequentially** when subtasks depend on prior results:

- Wait for one agent to complete before launching the next
- Pass results from the first agent's output into the next agent's prompt

### Step 6: Monitor and Coordinate

After launching agents:

1. **Collect results** from each Task agent's response
2. **Verify success** — check that each agent committed its changes
3. **Report summary** to the user with:
   - What each agent accomplished per subtask
   - The grove ID and worktree paths
   - Next steps (review, merge, test integration)

### Step 7: Open in IDE or Terminal (Optional)

If the user wants to review or continue work:

```bash
# Open Claude session for a worktree
grove claude <grove-id>
```

## Example: Full Orchestration Flow

User story: "Implement widget management with API and UI"

```bash
# 1. Create grove (the user story)
grove create "widget-management" --empty

# 2. Add worktrees (one per subtask, same repo can appear multiple times)
grove add-worktree <grove-id> "widget-api-crud" backend-repo
grove add-worktree <grove-id> "widget-api-search" backend-repo
grove add-worktree <grove-id> "widget-list-screen" frontend-repo
grove add-worktree <grove-id> "widget-edit-form" frontend-repo

# 3. Get worktree paths
grove list --json
```

Then launch four Task agents in parallel:

- **Agent 1** (widget-api-crud worktree): "Implement CRUD endpoints for /api/widgets..."
- **Agent 2** (widget-api-search worktree): "Implement search/filter endpoint GET /api/widgets/search..."
- **Agent 3** (widget-list-screen worktree): "Create widget list page with table component..."
- **Agent 4** (widget-edit-form worktree): "Create widget edit form with validation..."

## Error Handling

**Repository not registered:**
Tell the user to register it: `cd /path/to/repo && grove --register`

**Grove creation fails:**
Check the error message. Common causes: repository not found, invalid name.

**Agent fails in worktree:**
The worktree still exists. The user can manually `cd` into it and fix issues, or launch another agent.

## Tips

- Always use `--json` flag when parsing grove output programmatically
- Worktree paths from `grove list --json` are absolute paths ready to use
- Each worktree gets a branch like `grove/<grove-name>-<hash>` — agents don't need to create branches
- The same repository can be added multiple times as different worktrees — this is the standard pattern for breaking stories into subtasks
- For monorepos, use `reponame.projectfolder` format to target specific projects
- Keep agent prompts specific and scoped — one clear subtask per agent
- Include project-specific quality check commands in agent prompts (lint, test, build)
