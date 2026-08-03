# Contributing

Thanks for helping improve JRXML Viewer.

## Development

```bash
npm install
npm run check-types
npm test
npm run compile
```

Use the VS Code Extension Development Host (`F5`) for UI changes. Add or update a fixture when changing parser, diagnostics or source-edit behavior.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Include tests for parser, diagnostics and source-edit changes.
- Do not add report files containing customer data.
- Do not introduce telemetry or remote execution.
- Keep the static viewer usable without Java.

## Commit messages

Use concise imperative messages, for example `Improve report element diagnostics`.
