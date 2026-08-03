import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { child } from '../core/xml';
import { createElementXml, deleteRange, findNodeForRange, insertBefore, replaceContent, updateAttributeByRange } from '../core/edits';
import { findElement, parseJrxml, toSerializableModel } from '../core/parser';
import { validateModel } from '../core/diagnostics';
import { JrxmlRuntimeService, RuntimeNotConfiguredError } from '../runtime/runtimeService';
import { getWebviewHtml } from './webviewHtml';
import type { JrxmlDocumentModel } from '../core/types';
import type { WebviewToExtensionMessage } from '../webview/protocol';
import { isWebviewMessage } from '../webview/protocol';
import type { JrxmlExplorerProvider } from '../views/jrxmlExplorerProvider';

function offsetRange(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

export class JrxmlCustomEditorProvider implements vscode.CustomTextEditorProvider {
  private activeUri?: vscode.Uri;
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly explorer: JrxmlExplorerProvider,
    private readonly runtime: JrxmlRuntimeService
  ) {}

  public getActiveUri(): vscode.Uri | undefined {
    return this.activeUri;
  }

  public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    this.activeUri = document.uri;
    this.panels.set(document.uri.toString(), panel);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, vscode.Uri.file(path.dirname(document.uri.fsPath))]
    };
    panel.webview.html = getWebviewHtml(panel.webview, this.extensionUri);
    this.explorer.setActiveUri(document.uri);

    let selectedId: string | undefined;
    const disposables: vscode.Disposable[] = [];
    const resolveImages = async (model: JrxmlDocumentModel, uri: vscode.Uri): Promise<void> => {
      if (!vscode.workspace.getConfiguration('jrxmlViewer').get('resolveLocalResources', true)) return;
      const visit = async (element: JrxmlDocumentModel['bands'][number]['elements'][number]): Promise<void> => {
        if (element.kind === 'image' && element.imageExpression) {
          const literal = /^\s*["'](.+)["']\s*$/.exec(element.imageExpression.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''))?.[1];
          if (literal && !literal.startsWith('data:') && !literal.includes('://')) {
            try {
              const resource = path.resolve(path.dirname(uri.fsPath), literal);
              const data = await readFile(resource);
              const extension = path.extname(resource).toLowerCase();
              const mime = extension === '.svg' ? 'image/svg+xml' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.gif' ? 'image/gif' : 'image/png';
              element.imageData = `data:${mime};base64,${data.toString('base64')}`;
            } catch {
              // Missing local resources are reported by the source diagnostics/runtime.
            }
          }
        }
        for (const child of element.children) await visit(child);
      };
      for (const band of model.bands) for (const element of band.elements) await visit(element);
    };
    const sendModel = async (): Promise<void> => {
      const parsed = parseJrxml(document.getText());
      parsed.model.diagnostics = validateModel(parsed.model);
      await resolveImages(parsed.model, document.uri);
      panel.webview.postMessage({ type: 'model', model: toSerializableModel(parsed.model), selectedId });
      this.explorer.refresh();
    };
    const applyOperation = async (operation: { range: { start: number; end: number }; newText: string }): Promise<void> => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, offsetRange(document, operation.range.start, operation.range.end), operation.newText);
      await vscode.workspace.applyEdit(edit);
    };
    const openSourceAt = async (start: number, end: number): Promise<void> => {
      try {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', vscode.ViewColumn.Active);
      } catch {
        // The regular text editor may already be the active editor.
      }
      const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false, preview: false });
      editor.selection = new vscode.Selection(document.positionAt(start), document.positionAt(end));
      editor.revealRange(offsetRange(document, start, end), vscode.TextEditorRevealType.InCenter);
    };

    const handleMessage = async (message: WebviewToExtensionMessage): Promise<void> => {
      if (message.type === 'ready') {
        await sendModel();
        return;
      }
      if (message.type === 'select') {
        selectedId = message.id;
        this.explorer.setSelection(message.id);
        panel.webview.postMessage({ type: 'selection', id: selectedId });
        return;
      }
      if (message.type === 'revealSource') {
        await openSourceAt(message.start, message.end);
        return;
      }
      if (message.type === 'openSource') {
        await openSourceAt(0, document.getText().length);
        return;
      }
      if (message.type === 'validate') {
        await sendModel();
        const model = parseJrxml(document.getText()).model;
        const issues = validateModel(model);
        if (issues.some((item) => item.severity === 'error')) vscode.window.showErrorMessage(`JRXML validation found ${issues.length} issue(s).`);
        else if (issues.length) vscode.window.showWarningMessage(`JRXML validation found ${issues.length} warning(s).`);
        else vscode.window.showInformationMessage('JRXML validation passed.');
        return;
      }
      if (message.type === 'updateElement') {
        const parsed = parseJrxml(document.getText());
        const element = findElement(parsed.model, message.id);
        const node = element ? findNodeForRange(parsed.root, element.sourceRange) : undefined;
        if (!element || !node) return;
        const reportElement = child(node, 'reportElement');
        const numericProperties = new Set(['x', 'y', 'width', 'height']);
        if (numericProperties.has(message.property) || message.property === 'style') {
          if (reportElement) await applyOperation(updateAttributeByRange(document.getText(), { start: reportElement.start, end: reportElement.startTagEnd + 1 }, message.property, String(message.value)));
        } else {
          const targetNames: Record<string, string> = { text: 'text', expression: node.name === 'image' ? 'imageExpression' : node.name === 'textField' ? 'textFieldExpression' : 'text' };
          const target = child(node, targetNames[message.property]);
          if (target) await applyOperation(replaceContent(document.getText(), target, String(message.value)));
          else panel.webview.postMessage({ type: 'error', message: `Cannot edit ${message.property} because the XML node is not present.` });
        }
        return;
      }
      if (message.type === 'deleteElement') {
        const parsed = parseJrxml(document.getText());
        const element = findElement(parsed.model, message.id);
        if (element) await applyOperation(deleteRange(element));
        selectedId = undefined;
        return;
      }
      if (message.type === 'duplicateElement') {
        const parsed = parseJrxml(document.getText());
        const element = findElement(parsed.model, message.id);
        if (element) {
          const raw = document.getText().slice(element.sourceRange.start, element.sourceRange.end);
          const duplicated = raw.replace(/\b(x|y)\s*=\s*(["'])(-?\d+)\2/g, (_match, name: string, quote: string, value: string) => `${name}=${quote}${Number(value) + 10}${quote}`);
          await applyOperation(insertBefore(document.getText(), { start: element.sourceRange.end, end: element.sourceRange.end }, duplicated));
        }
        return;
      }
      if (message.type === 'addElement') {
        const parsed = parseJrxml(document.getText());
        const root = parsed.root;
        const section = root ? child(root, message.band) : undefined;
        const band = section ? child(section, 'band') : undefined;
        if (band) await applyOperation(insertBefore(document.getText(), { start: band.endTagStart, end: band.endTagStart }, createElementXml(message.kind, { x: 10, y: 10, width: 120, height: 24 })));
        return;
      }
      if (message.type === 'export') {
        if (!message.content) return;
        const defaultName = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
        const extension = message.format === 'svg' ? 'svg' : 'html';
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${defaultName}.${extension}`)), filters: { [extension.toUpperCase()]: [extension] } });
        if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(message.content, 'utf8'));
        return;
      }
      if (message.type === 'runtimePreview') {
        panel.webview.postMessage({ type: 'runtimeStatus', status: 'running', message: 'Running JasperReports runtime...' });
        try {
          const result = await this.runtime.run(document.uri, message.format ?? 'pdf');
          await this.runtime.openResult(result);
          panel.webview.postMessage({ type: 'runtimeStatus', status: 'success', message: `Runtime output opened: ${path.basename(result.outputPath)}`, outputPath: result.outputPath });
        } catch (error) {
          const text = error instanceof RuntimeNotConfiguredError ? error.message : error instanceof Error ? error.message : String(error);
          panel.webview.postMessage({ type: 'runtimeStatus', status: 'error', message: text });
        }
      }
    };

    disposables.push(panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isWebviewMessage(message)) void handleMessage(message).catch((error: unknown) => panel.webview.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
    }));
    disposables.push(vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) void sendModel();
    }));
    disposables.push(panel.onDidDispose(() => {
      disposables.forEach((item) => item.dispose());
      this.panels.delete(document.uri.toString());
      if (this.activeUri?.toString() === document.uri.toString()) this.activeUri = undefined;
    }));
    void sendModel();
  }

  public async revealElement(uri: vscode.Uri, start: number, end: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false, preview: false });
    editor.selection = new vscode.Selection(document.positionAt(start), document.positionAt(end));
    editor.revealRange(offsetRange(document, start, end), vscode.TextEditorRevealType.InCenter);
  }

  public async openPreview(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'jrxml.viewer', vscode.ViewColumn.Active);
  }

  public async openSource(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, preview: false });
  }

  public requestExport(format: 'html' | 'svg'): void {
    const panel = this.activeUri ? this.panels.get(this.activeUri.toString()) : undefined;
    panel?.webview.postMessage({ type: 'exportRequest', format });
  }

  public async runRuntimePreview(): Promise<void> {
    if (!this.activeUri) {
      vscode.window.showInformationMessage('Open a JRXML preview first.');
      return;
    }
    const panel = this.panels.get(this.activeUri.toString());
    panel?.webview.postMessage({ type: 'runtimeStatus', status: 'running', message: 'Running JasperReports runtime...' });
    try {
      const result = await this.runtime.run(this.activeUri, 'pdf');
      await this.runtime.openResult(result);
      panel?.webview.postMessage({ type: 'runtimeStatus', status: 'success', message: `Runtime output opened: ${path.basename(result.outputPath)}`, outputPath: result.outputPath });
    } catch (error) {
      const text = error instanceof RuntimeNotConfiguredError ? error.message : error instanceof Error ? error.message : String(error);
      panel?.webview.postMessage({ type: 'runtimeStatus', status: 'error', message: text });
      vscode.window.showErrorMessage(text);
    }
  }
}
