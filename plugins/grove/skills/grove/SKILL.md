---
name: Grove Orchestration
description: Use when the user asks to "use grove", "create a grove", "add a worktree", "orchestrate agents", "launch agents", "multi-agent", "work across repos", "parallel agents", set up a Grove workspace, register a repo with Grove, launch Claude on a worktree, or work with the GitLab/Asana Grove plugins. Explains the Grove CLI (for agents), scopes (repo vs workspace), plugins, and launching Claude sessions per worktree.
version: 2.0.0
---

# Grove

Grove manages collections of git worktrees called **groves**. A grove groups the
worktrees for one task/user story; each worktree is one isolated branch (a
subtask). Grove can also launch Claude sessions per worktree and integrates with
GitLab and Asana.

## Two ways to drive Grove

- **Humans** use the interactive terminal UI: run `grove` with no arguments.
- **Agents (you)** use the **CLI**, which exposes most of what the UI can do for
  groves and worktrees in a scriptable, `--json`-friendly way.

**ALWAYS run `grove --help` first** to get the authoritative command set for the
installed version — commands and flags evolve, and `--help` is the source of
truth. The reference below explains intent and workflow; `--help` gives exact
current syntax.

## Scopes — where Grove operates

Grove resolves its scope from the current directory. Pick the simplest one that
fits before creating anything.

### 1. Repo mode (simplest — start here)

Just `cd` into a git repository and run Grove. **No registration, no workspace
setup.** Grove operates as a single-repo grove factory: its data lives in
`<repo>/.grove`, and every grove/worktree is created from that one repo. The repo
is auto-provided on first run under its folder name.

```bash
cd /path/to/my-repo
grove create "fix-login-bug" my-repo   # reponame = the repo's folder name
```

This is the right default when all the work is in one repository.

### 2. Workspace mode (cross-repo)

A **workspace** scopes all work in a directory (and its subdirectories) to a
shared context with its own settings and its own set of registered repositories.
Use it when a grove needs worktrees from **multiple repos** at once.

```bash
cd /path/to/workspace-root
grove workspace init                          # creates .grove.workspace.json (prompts for name + groves folder)
grove workspace add-repository /path/to/repo-a
grove workspace add-repository /path/to/repo-b
```

Once initialized, any Grove command run from inside that tree uses the workspace,
and `create`/`add-worktree` can reference any repo registered to it by name.

### 3. Global mode

Running Grove outside any git repo and outside a workspace is read-only — a
switcher across known locations. You **cannot create groves** there; Grove will
tell you to `cd` into a repo or run `grove workspace init`.

## CLI command reference

Repository format is `reponame` (whole repo) or `reponame.projectfolder`
(a project inside a monorepo).

### Discover

```bash
grove list --json     # all groves + worktrees, machine-readable (use this to get paths/ids)
grove list            # human-readable
grove status --json   # grove/worktree info for the current directory
```

`grove list --json` is the key command for orchestration: each worktree entry
has `id`, `name`, `branch`, `worktreePath`, and `projectPath` (the absolute
working directory for an agent — already includes the monorepo subfolder).

### Create groves and worktrees

```bash
# Single-worktree grove (one subtask)
grove create "<grove-name>" <reponame>

# Empty grove (then add worktrees) — the typical multi-subtask pattern
grove create "<grove-name>" --empty

# Add a worktree (repeat the same repo as many times as needed — one branch each)
grove add-worktree <grove-id> "<worktree-name>" <reponame>

# Fork a worktree: same repo, branch off an existing worktree's branch
grove add-worktree <grove-id> "<worktree-name>" --fork <worktree-id> [repo]

# Name a worktree from an Asana task (requires the Asana plugin)
grove add-worktree <grove-id> --asana <task-url> <reponame>

# Adopt an existing git worktree (created outside Grove) into a grove
grove adopt-worktree <grove-id> <path> [name]
```

`create` prints the grove id; capture it for the `add-worktree` calls. The same
repository can appear in many worktrees — that is the normal way to split a story
into parallel subtasks.

### Close

```bash
grove close <grove> [--force]              # close a grove and remove all its worktrees
grove close-worktree <worktree-id> [--force]   # close one worktree (ids are globally unique)
```

Closing removes worktrees from disk. Omit `--force` so Grove's safety checks
(uncommitted/unpushed work) run first.

### Naming conventions

- Grove name → the user story (`add-auth-flow`, `fix-billing-bug`).
- Worktree name → the specific subtask (`auth-api-login`, `login-screen`).
- Branches are generated automatically (e.g. `grove/<name>-<hash>`) — agents
  don't create branches.

## Plugins

Grove has two optional plugins. Each is enabled in the UI (Settings → Plugins,
which validates the token) or via the `plugins` array in settings, and each reads
its credential from an environment variable that takes priority over stored
settings.

### GitLab plugin

- **What it does:** surfaces the merge-request status for each worktree's branch
  in the UI (open / draft / in review / changes requested / merged / closed, plus
  approvals). It matches the branch against MRs on the configured GitLab instance.
- **Required:** a personal access token with API scope.
  - `GROVE_GITLAB_TOKEN` — the access token (or set `accessToken` in plugin settings).
  - `GROVE_GITLAB_URL` — instance base URL, optional; defaults to `https://gitlab.com`.
- **Setup:**
  ```bash
  export GROVE_GITLAB_TOKEN=glpat-xxxxxxxx
  export GROVE_GITLAB_URL=https://gitlab.mycompany.com   # only for self-hosted
  ```
  Then enable the GitLab plugin in the UI; it validates the token against the
  instance. MR status only appears for worktrees whose `origin` remote host
  matches the configured instance.

### Asana plugin

- **What it does:** lets you name a worktree from an Asana task and seed a Claude
  prompt from the task's name and description. Powers `add-worktree --asana` and
  `grove claude-asana`.
- **Required:** an Asana personal access token.
  - `ASANA_TOKEN` — the access token (or set `accessToken` in plugin settings).
- **Setup:**
  ```bash
  export ASANA_TOKEN=1/xxxxxxxxxxxx
  ```
  Then enable the Asana plugin in the UI; enabling validates the token via the
  Asana API. Task URLs look like `https://app.asana.com/0/<project>/<task-gid>`.
- **Prompt template:** the text handed to Claude is built from a template with the
  variables `{task_name}`, `{task_description}`, `{task_gid}`, `{task_url}`,
  `{task_assignee}` (configurable in the Asana plugin settings; a sensible default
  is used otherwise).

## Launching Claude for a worktree

Grove can launch a Claude session scoped to a worktree's working directory. Three
flavors:

1. **Interactive session** — opens Claude in the configured terminal for the
   worktree:

   ```bash
   grove claude [grove-id]     # detects the grove/worktree from cwd when id is omitted
   ```

   In the UI this is the "Open in Claude" action. If a grove has multiple
   worktrees, either run from inside the target worktree or pass identifying info.

2. **Background instant session** — in the UI, the "Instant Claude" worktree
   action opens `$EDITOR` for a prompt, then dispatches a silent background
   session (`claude --bg`). Grove tracks the session id on the worktree, so the
   action becomes "Attach to Running Claude" afterward.

3. **Background from an Asana task** (Asana plugin) — no editor; builds the prompt
   from the linked task and dispatches straight to a background session:
   ```bash
   grove claude-asana [worktree-id] [--asana <task-url>]
   ```
   The worktree is detected from cwd when the id is omitted; `--asana` overrides
   (or supplies) the task. If the worktree was created with `add-worktree --asana`,
   the task link is already stored and no `--asana` is needed. In the UI, enabling
   the Asana plugin adds "launch Claude with instructions from the linked Asana
   task" options to the worktree menu.

## Orchestration workflow (agent-driven)

When the user wants parallel agents across subtasks:

1. **Discover** — `grove list --json`; register/init scope if needed (see Scopes).
2. **Plan** — break the story into subtasks; each becomes one worktree.
3. **Create** — `grove create "<story>" --empty`, then one
   `grove add-worktree <grove-id> "<subtask>" <repo>` per subtask (same repo may
   repeat).
4. **Get paths** — `grove list --json`, read each worktree's `projectPath`.
5. **Launch agents** — use the **Task tool** to run a Claude agent per worktree.
   Give each agent its `projectPath` and a scoped subtask. Prompt template:

   ```
   You are working in the git worktree at: <projectPath>

   Your task: <specific subtask>

   - cd to <projectPath> before doing any work
   - You are on an isolated branch; commit freely
   - Run the project's quality checks (lint, typecheck, tests) before committing
   - Commit when done with a descriptive message

   Overall story context: <brief description>
   ```

   Launch in parallel (multiple Task calls in one message) when subtasks are
   independent; sequentially when one depends on another's output.

6. **Coordinate** — collect results, verify each agent committed, and report the
   grove id, worktree paths, and next steps (review, merge, integration test).

## Error handling & tips

- **Can't create a grove ("Run grove inside a git repository or a workspace"):**
  you're in global mode — `cd` into a repo or run `grove workspace init`.
- **"Repository '<x>' not found":** in workspace mode, register it with
  `grove workspace add-repository <path>`; the name is the repo's folder name.
- **Plugin action fails with a token error:** export the env var
  (`GROVE_GITLAB_TOKEN` / `ASANA_TOKEN`) or set it in plugin settings, then
  re-enable the plugin so it re-validates.
- **An agent fails in a worktree:** the worktree persists — fix it manually or
  relaunch an agent there. Nothing else is affected (separate branches).
- Always use `--json` when parsing output; paths returned are absolute and
  ready to use.
- Keep agent prompts narrow — one clear subtask per agent — and include the
  project's real quality-check commands.
