import * as vscode from 'vscode';
import { parseJrxml } from './core/parser';
import { validateModel } from './core/diagnostics';
import { JrxmlCustomEditorProvider } from './editor/jrxmlCustomEditorProvider';
import { JrxmlRuntimeService } from './runtime/runtimeService';
import { JrxmlExplorerProvider } from './views/jrxmlExplorerProvider';

function asUri(value: unknown): vscode.Uri | undefined {
  if (value instanceof vscode.Uri) return value;
  if (value && typeof value === 'object' && 'uri' in value && (value as { uri?: unknown }).uri instanceof vscode.Uri) return (value as { uri: vscode.Uri }).uri;
  const active = vscode.window.activeTextEditor?.document;
  return active?.languageId === 'jrxml' || active?.fileName.endsWith('.jrxml') ? active.uri : undefined;
}

function updateDiagnostics(collection: vscode.DiagnosticCollection, document: vscode.TextDocument): void {
  if (!document.fileName.endsWith('.jrxml')) return;
  const parsed = parseJrxml(document.getText());
  const diagnostics = validateModel(parsed.model).map((item) => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(document.positionAt(item.range.start), document.positionAt(item.range.end)),
      item.message,
      item.severity === 'error' ? vscode.DiagnosticSeverity.Error : item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information
    );
    diagnostic.code = item.code;
    diagnostic.source = 'JRXML Viewer';
    return diagnostic;
  });
  collection.set(document.uri, diagnostics);
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('jrxml-viewer');
  const explorer = new JrxmlExplorerProvider();
  const runtime = new JrxmlRuntimeService();
  const editorProvider = new JrxmlCustomEditorProvider(context.extensionUri, explorer, runtime);

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerTreeDataProvider('jrxml.files', explorer),
    vscode.window.registerCustomEditorProvider('jrxml.viewer', editorProvider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => updateDiagnostics(diagnostics, document)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDiagnostics(diagnostics, event.document);
      explorer.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri))
  );

  for (const document of vscode.workspace.textDocuments) updateDiagnostics(diagnostics, document);

  context.subscriptions.push(
    vscode.commands.registerCommand('jrxmlViewer.openPreview', async (value?: unknown) => {
      const uri = asUri(value);
      if (uri) await editorProvider.openPreview(uri);
      else vscode.window.showInformationMessage('Open a JRXML file first.');
    }),
    vscode.commands.registerCommand('jrxmlViewer.openSource', async (value?: unknown) => {
      const uri = asUri(value);
      if (uri) await editorProvider.openSource(uri);
      else vscode.window.showInformationMessage('Open a JRXML file first.');
    }),
    vscode.commands.registerCommand('jrxmlViewer.validate', async (value?: unknown) => {
      const uri = asUri(value);
      if (!uri) {
        vscode.window.showInformationMessage('Open a JRXML file first.');
        return;
      }
      const document = await vscode.workspace.openTextDocument(uri);
      updateDiagnostics(diagnostics, document);
      const issues = validateModel(parseJrxml(document.getText()).model);
      if (issues.some((item) => item.severity === 'error')) await vscode.window.showErrorMessage(`JRXML validation found ${issues.length} issue(s).`);
      else if (issues.length) await vscode.window.showWarningMessage(`JRXML validation found ${issues.length} warning(s).`);
      else await vscode.window.showInformationMessage('JRXML validation passed.');
    }),
    vscode.commands.registerCommand('jrxmlViewer.refreshExplorer', () => explorer.refresh()),
    vscode.commands.registerCommand('jrxmlViewer.revealElement', async (uri: vscode.Uri, start: number, end: number) => editorProvider.revealElement(uri, start, end)),
    vscode.commands.registerCommand('jrxmlViewer.exportSvg', () => editorProvider.requestExport('svg')),
    vscode.commands.registerCommand('jrxmlViewer.exportHtml', () => editorProvider.requestExport('html')),
    vscode.commands.registerCommand('jrxmlViewer.runtimePreview', () => editorProvider.runRuntimePreview())
  );
}

export function deactivate(): void {
  // VS Code disposes registered providers and subscriptions.
}
