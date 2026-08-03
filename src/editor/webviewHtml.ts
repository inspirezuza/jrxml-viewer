import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
  <title>JRXML Viewer</title>
  <style>
    :root { color-scheme: light dark; --border: color-mix(in srgb, var(--vscode-panel-border) 75%, transparent); --muted: var(--vscode-descriptionForeground); --surface: var(--vscode-editorWidget-background); --canvas: color-mix(in srgb, var(--vscode-editor-background) 92%, #7b8794); }
    * { box-sizing: border-box; }
    html, body, #app { margin: 0; height: 100%; overflow: hidden; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    button, input, textarea, select { font: inherit; color: inherit; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: 3px; }
    button { padding: 4px 8px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .jrxml-app { display: flex; flex-direction: column; height: 100%; }
    .toolbar { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 8px; margin-right: auto; min-width: 160px; }
    .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; border-radius: 5px; color: white; background: #4f8cc9; font-weight: 700; font-size: 11px; }
    .toolbar-group { display: flex; align-items: center; gap: 4px; }
    .zoom-value { min-width: 44px; text-align: center; color: var(--muted); }
    .workspace { display: flex; flex: 1; min-height: 0; }
    .canvas-panel { display: flex; flex: 1; min-width: 0; flex-direction: column; }
    .canvas-toolbar { display: flex; justify-content: space-between; gap: 12px; padding: 6px 12px; border-bottom: 1px solid var(--border); color: var(--muted); }
    .canvas-hint { font-size: 11px; }
    .canvas { flex: 1; overflow: auto; padding: 28px; background: var(--canvas); }
    .page-wrap { margin: 0 auto; position: relative; filter: drop-shadow(0 5px 12px rgba(0,0,0,.28)); transition: width .12s ease; }
    #report-svg { display: block; background: white; color: #52606d; }
    .page-background { fill: #fff; }
    .grid { pointer-events: none; color: #52606d; }
    .band-box { fill: rgba(63, 130, 170, .035); stroke: rgba(63, 130, 170, .27); stroke-width: .75; stroke-dasharray: 4 3; }
    .band-label { fill: rgba(63, 130, 170, .75); font-size: 8px; pointer-events: none; }
    .element-group { cursor: pointer; }
    .element-box { fill: rgba(91, 155, 213, .10); stroke: rgba(47, 119, 177, .52); stroke-width: .75; }
    .element-group:hover .element-box, .element-box.selected { fill: rgba(255, 193, 7, .22); stroke: #d99200; stroke-width: 1.6; }
    .element-text { fill: #202124; font-size: 9px; pointer-events: none; dominant-baseline: alphabetic; }
    .element-caption { fill: #52606d; font-size: 8px; pointer-events: none; }
    .element-icon { fill: #4f8cc9; font-size: 20px; pointer-events: none; }
    .element-line { stroke: #52606d; stroke-width: 1; pointer-events: none; }
    .element-shape { fill: none; stroke: #52606d; stroke-width: 1; pointer-events: none; }
    .side-panel { width: 310px; min-width: 260px; overflow: auto; border-left: 1px solid var(--border); background: var(--surface); }
    .panel-section { padding: 12px; border-bottom: 1px solid var(--border); }
    .panel-heading { margin-bottom: 9px; color: var(--muted); text-transform: uppercase; font-size: 10px; letter-spacing: .08em; font-weight: 700; }
    .add-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
    .add-grid button { text-align: left; font-size: 11px; }
    .band-select, .inspector label { display: flex; flex-direction: column; gap: 4px; margin-top: 9px; color: var(--muted); font-size: 11px; }
    .band-select select, .inspector input, .inspector textarea { padding: 5px 6px; color: var(--vscode-input-foreground); }
    .inspector textarea { min-height: 60px; resize: vertical; font-family: var(--vscode-editor-font-family); }
    .inspector-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
    .kind-pill { border-radius: 10px; padding: 3px 7px; background: rgba(79, 140, 201, .2); color: #70b5ed; font-size: 11px; }
    .inspector-empty { display: flex; flex-direction: column; gap: 8px; color: var(--muted); }
    .inspector-empty strong { color: var(--vscode-foreground); font-size: 14px; }
    .inspector-empty dl { display: grid; grid-template-columns: 1fr auto; gap: 5px; margin: 7px 0 0; font-size: 11px; }
    .inspector-empty dt, .inspector-empty dd { margin: 0; }
    .inspector-empty dd { color: var(--vscode-foreground); }
    .inspector-actions { display: flex; gap: 6px; margin-top: 12px; }
    .danger { background: var(--vscode-inputValidation-errorBackground); }
    .diagnostic-ok { color: var(--vscode-testing-iconPassed); font-size: 12px; }
    .diagnostics { display: flex; flex-direction: column; gap: 7px; }
    .diagnostic { display: flex; gap: 7px; align-items: flex-start; font-size: 11px; }
    .diagnostic > span { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
    .diagnostic.error > span { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }
    .diagnostic.info > span { background: var(--vscode-textLink-activeForeground); color: var(--vscode-editor-background); }
    .diagnostic small { display: block; margin-top: 2px; color: var(--muted); }
    .statusbar { display: flex; justify-content: space-between; padding: 3px 10px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; }
    .empty-state { display: grid; place-items: center; height: 100%; color: var(--muted); }
    @media (max-width: 800px) { .side-panel { width: 250px; min-width: 220px; } .canvas { padding: 14px; } .canvas-hint { display: none; } }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
