# Contributing

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
2. Run tests:
   ```bash
   bun test
   ```
3. Build the package:
   ```bash
   bun run build
   ```

## Development notes

- Keep the normalized repository data shape stable so the module remains compatible with GitDiagram's generation pipeline.
- Add tests for every new parser rule or API edge case.
- Prefer fetch-based integrations and lightweight abstractions unless the project requirements change.
