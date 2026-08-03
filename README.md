# JRXML Viewer

An open-source Visual Studio Code extension for viewing, inspecting, validating and editing JasperReports `.jrxml` report designs.

## What it does

- Opens JRXML files in a source-backed visual editor.
- Renders JasperReports pages, bands and common elements as an interactive SVG canvas.
- Provides zoom, pan, grid, rulers, band labels, element selection and an editable properties inspector.
- Keeps preview, source ranges and the JRXML Explorer synchronized.
- Supports static text, text fields, images, lines, rectangles, ellipses, frames, subreports, tables, crosstabs, lists, charts, barcodes and generic components with safe fallback rendering for custom elements.
- Shows XML and JRXML structural diagnostics in the VS Code Problems panel.
- Adds JRXML syntax highlighting, expression highlighting and snippets.
- Exports the current design as SVG or standalone HTML.
- Includes an optional local JasperReports runtime hook for compile/fill/real output preview.

## Install for development

Requirements:

- VS Code 1.85 or newer
- Node.js 20 or newer

```bash
npm install
npm run compile
```

Open this folder in VS Code and press `F5`. Open any `.jrxml` file in the Extension Development Host.

## Build a VSIX

```bash
npm run check-types
npm test
npm run package
```

Then install the generated `.vsix` from **Extensions → … → Install from VSIX**.

## Optional JasperReports runtime

The static viewer does not require Java. To enable real compile/fill/export preview, build the local runner:

```bash
cd runtime
mvn package
```

Configure the extension settings:

```json
{
  "jrxmlViewer.runtime.command": "java",
  "jrxmlViewer.runtime.args": [
    "-jar",
    "C:/path/to/jrxml-viewer-runtime.jar",
    "--input", "{input}",
    "--output", "{output}",
    "--format", "{format}"
  ]
}
```

The runner is local-only. The extension never uploads report templates, data or generated output.

## Architecture

```text
TextDocument
   │
   ├── position-aware XML scanner + JRXML model
   │       ├── diagnostics → VS Code Problems
   │       ├── explorer → bands, elements, fields and resources
   │       └── webview model → SVG preview + property editing
   │
   └── minimal WorkspaceEdit patches → source XML
```

The source file remains the document of record. Visual changes use targeted XML edits so comments, namespaces and unrelated formatting are not needlessly rewritten.

## Privacy and security

- No telemetry.
- No network requests are needed for the static viewer.
- Webview scripts are bundled locally and protected by a content security policy.
- Runtime execution is opt-in and runs only a command configured by the user.
- Images and subreports are resolved from local workspace paths by default.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the issue templates before opening a pull request.

## License

The extension code is released under the MIT License. See [LICENSE](LICENSE).
