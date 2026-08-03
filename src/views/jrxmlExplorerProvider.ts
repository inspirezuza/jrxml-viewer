import * as vscode from 'vscode';
import { parseJrxml } from '../core/parser';
import { validateModel } from '../core/diagnostics';
import type { JrxmlDocumentModel, JrxmlElement } from '../core/types';

type NodeKind = 'file' | 'section' | 'band' | 'element' | 'metadata';

interface ExplorerNode {
  kind: NodeKind;
  label: string;
  uri?: vscode.Uri;
  model?: JrxmlDocumentModel;
  element?: JrxmlElement;
  bandName?: string;
  start?: number;
  end?: number;
  section?: 'bands' | 'fields' | 'parameters' | 'variables' | 'styles' | 'resources';
}

class JrxmlTreeItem extends vscode.TreeItem {
  public constructor(public readonly node: ExplorerNode, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(node.label, collapsibleState);
    this.contextValue = node.kind;
    if (node.kind === 'file' && node.uri) {
      this.resourceUri = node.uri;
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.command = { command: 'jrxmlViewer.openPreview', title: 'Open JRXML Preview', arguments: [node.uri] };
    } else if ((node.kind === 'element' || node.kind === 'metadata') && node.uri && node.start !== undefined && node.end !== undefined) {
      this.iconPath = new vscode.ThemeIcon(node.kind === 'element' ? 'symbol-field' : 'symbol-property');
      this.command = { command: 'jrxmlViewer.revealElement', title: 'Reveal JRXML Element', arguments: [node.uri, node.start, node.end] };
    } else if (node.kind === 'band') {
      this.iconPath = new vscode.ThemeIcon('symbol-structure');
    } else if (node.kind === 'section') {
      this.iconPath = new vscode.ThemeIcon('list-tree');
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-property');
    }
    if (node.kind === 'file' && node.uri) this.tooltip = node.uri.fsPath;
    if (node.element) this.description = `${node.element.x}, ${node.element.y} · ${node.element.width}×${node.element.height}`;
  }
}

export class JrxmlExplorerProvider implements vscode.TreeDataProvider<JrxmlTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<JrxmlTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this.changeEmitter.event;
  public setActiveUri(uri: vscode.Uri): void {
    void uri;
    this.refresh();
  }

  public setSelection(id: string): void {
    void id;
  }

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: JrxmlTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: JrxmlTreeItem): Promise<JrxmlTreeItem[]> {
    if (!element) {
      const files = await vscode.workspace.findFiles('**/*.jrxml', '**/{node_modules,dist,target}/**', 200);
      return files.sort((a, b) => a.fsPath.localeCompare(b.fsPath)).map((uri) => new JrxmlTreeItem({ kind: 'file', label: vscode.workspace.asRelativePath(uri), uri }, vscode.TreeItemCollapsibleState.Collapsed));
    }
    const node = element.node;
    if (node.kind === 'file' && node.uri) {
      const document = await vscode.workspace.openTextDocument(node.uri);
      const parsed = parseJrxml(document.getText());
      parsed.model.diagnostics = validateModel(parsed.model);
      const sections: Array<ExplorerNode> = [
        { kind: 'section', label: `Bands (${parsed.model.bands.length})`, uri: node.uri, model: parsed.model, section: 'bands' },
        { kind: 'section', label: `Fields (${parsed.model.fields.length})`, uri: node.uri, model: parsed.model, section: 'fields' },
        { kind: 'section', label: `Parameters (${parsed.model.parameters.length})`, uri: node.uri, model: parsed.model, section: 'parameters' },
        { kind: 'section', label: `Variables (${parsed.model.variables.length})`, uri: node.uri, model: parsed.model, section: 'variables' },
        { kind: 'section', label: `Styles (${parsed.model.styles.length})`, uri: node.uri, model: parsed.model, section: 'styles' },
        { kind: 'section', label: `Resources (${parsed.model.resources.length})`, uri: node.uri, model: parsed.model, section: 'resources' },
        { kind: 'metadata', label: `Page ${parsed.model.page.width}×${parsed.model.page.height} · ${parsed.model.diagnostics.length} issue(s)`, uri: node.uri, model: parsed.model }
      ];
      return sections.map((item) => new JrxmlTreeItem(item, item.kind === 'metadata' ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed));
    }
    if (node.kind === 'section' && node.model && node.uri && node.section) {
      if (node.section === 'bands') return node.model.bands.map((band) => new JrxmlTreeItem({ kind: 'band', label: `${band.name} (${band.height})`, uri: node.uri, bandName: band.name, model: node.model }, vscode.TreeItemCollapsibleState.Collapsed));
      if (node.section === 'fields') return node.model.fields.map((field) => new JrxmlTreeItem({ kind: 'metadata', label: `${field.name} : ${field.className}`, uri: node.uri, start: field.sourceRange.start, end: field.sourceRange.end }, vscode.TreeItemCollapsibleState.None));
      if (node.section === 'parameters') return node.model.parameters.map((item) => new JrxmlTreeItem({ kind: 'metadata', label: `${item.name} : ${item.className}`, uri: node.uri, start: item.sourceRange.start, end: item.sourceRange.end }, vscode.TreeItemCollapsibleState.None));
      if (node.section === 'variables') return node.model.variables.map((item) => new JrxmlTreeItem({ kind: 'metadata', label: `${item.name} : ${item.className}`, uri: node.uri, start: item.sourceRange.start, end: item.sourceRange.end }, vscode.TreeItemCollapsibleState.None));
      if (node.section === 'styles') return node.model.styles.map((item) => new JrxmlTreeItem({ kind: 'metadata', label: item.name, uri: node.uri, start: item.sourceRange.start, end: item.sourceRange.end }, vscode.TreeItemCollapsibleState.None));
      if (node.section === 'resources') return node.model.resources.map((item) => new JrxmlTreeItem({ kind: 'metadata', label: item, uri: node.uri }, vscode.TreeItemCollapsibleState.None));
    }
    if (node.kind === 'band' && node.model && node.uri && node.bandName) {
      const band = node.model.bands.find((item) => item.name === node.bandName);
      return band?.elements.map((element) => new JrxmlTreeItem({ kind: 'element', label: `${element.kind}: ${element.label}`, uri: node.uri, model: node.model, element, start: element.sourceRange.start, end: element.sourceRange.end }, element.children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)) ?? [];
    }
    if (node.kind === 'element' && node.element && node.uri && node.model) {
      return node.element.children.map((element) => new JrxmlTreeItem({ kind: 'element', label: `${element.kind}: ${element.label}`, uri: node.uri, model: node.model, element, start: element.sourceRange.start, end: element.sourceRange.end }, element.children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
    }
    return [];
  }
}
