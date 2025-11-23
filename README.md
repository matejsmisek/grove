# Grove

A CLI app using Ink and React to manage Git.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
npm install
```

### Scripts

- `npm run build` - Build the TypeScript project
- `npm run dev` - Build in watch mode
- `npm run lint` - Lint the codebase
- `npm run lint:fix` - Lint and auto-fix issues
- `npm run typecheck` - Type check without emitting files

### Project Structure

```
grove/
├── src/           # Source files
│   └── index.ts   # Entry point
├── dist/          # Compiled output
├── eslint.config.js  # ESLint configuration
├── tsconfig.json  # TypeScript configuration
└── package.json   # Project metadata
```

## Technology Stack

- **TypeScript** - Type-safe JavaScript
- **React** - UI library
- **Ink** - React for CLI applications
- **ESLint** - Code linting with typescript-eslint
