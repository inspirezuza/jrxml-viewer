import type { SerializedElement, SerializedModel } from '../core/types';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './protocol';

declare function acquireVsCodeApi(): { postMessage(message: WebviewToExtensionMessage): void };

const vscode = acquireVsCodeApi();
let currentModel: SerializedModel | undefined;
let selectedId: string | undefined;
let zoom = 1;
let showGrid = true;

const appElement = document.getElementById('app');
if (!appElement) throw new Error('JRXML viewer root element was not found.');
const app: HTMLElement = appElement;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const escapeAttr = (value: string): string => escapeHtml(value).replace(/`/g, '&#96;');
const safeColor = (value: string | undefined, fallback: string): string => value && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value) ? value : fallback;

function allElements(): SerializedElement[] {
  const result: SerializedElement[] = [];
  const visit = (element: SerializedElement): void => {
    result.push(element);
    element.children.forEach(visit);
  };
  currentModel?.bands.forEach((band) => band.elements.forEach(visit));
  return result;
}

function selectedElement(): SerializedElement | undefined {
  return allElements().find((element) => element.id === selectedId);
}

function elementText(element: SerializedElement): string {
  if (element.text) return element.text;
  if (element.expression) return element.expression;
  if (element.imageExpression) return element.imageExpression;
  return element.kind;
}

function renderElement(element: SerializedElement, bandOffset: number): string {
  const selected = element.id === selectedId ? ' selected' : '';
  const label = escapeHtml(elementText(element));
  const id = escapeAttr(element.id);
  const fill = safeColor(element.attributes.backcolor, 'rgba(91, 155, 213, .10)');
  const stroke = safeColor(element.attributes.forecolor, 'rgba(47, 119, 177, .52)');
  const base = `<rect class="element-box${selected}" x="0" y="0" width="${element.width}" height="${element.height}" rx="1" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" data-element-id="${id}"/>`;
  let body = base;
  if (element.kind === 'staticText' || element.kind === 'textField') {
    body += `<text class="element-text" x="4" y="${Math.min(Math.max(14, element.height - 5), 20)}" data-element-id="${id}">${label}</text>`;
  } else if (element.kind === 'line') {
    body += `<line class="element-line" x1="0" y1="0" x2="${Math.max(0, element.width)}" y2="${Math.max(0, element.height)}" data-element-id="${id}"/>`;
  } else if (element.kind === 'ellipse') {
    body += `<ellipse class="element-shape" cx="${element.width / 2}" cy="${element.height / 2}" rx="${Math.max(1, element.width / 2 - 1)}" ry="${Math.max(1, element.height / 2 - 1)}" data-element-id="${id}"/>`;
  } else if (element.kind === 'image') {
    if (element.imageData) body += `<image href="${escapeAttr(element.imageData)}" x="1" y="1" width="${Math.max(0, element.width - 2)}" height="${Math.max(0, element.height - 2)}" preserveAspectRatio="xMidYMid meet" data-element-id="${id}"/>`;
    else body += `<text class="element-icon" x="${Math.max(4, element.width / 2 - 9)}" y="${Math.max(18, element.height / 2)}" data-element-id="${id}">▧</text>`;
    body += `<text class="element-caption" x="4" y="${Math.max(16, element.height - 5)}" data-element-id="${id}">${label}</text>`;
  } else if (element.kind === 'rectangle' || element.kind === 'frame') {
    body += `<rect class="element-shape" x="1" y="1" width="${Math.max(0, element.width - 2)}" height="${Math.max(0, element.height - 2)}" data-element-id="${id}"/>`;
  } else {
    body += `<text class="element-caption" x="4" y="${Math.min(Math.max(14, element.height - 5), 18)}" data-element-id="${id}">${escapeHtml(element.kind)}: ${label}</text>`;
  }
  const children = element.children.map((child) => renderElement(child, 0)).join('');
  return `<g class="element-group${selected}" transform="translate(${element.x},${element.y + bandOffset})" data-element-id="${id}">${body}${children}</g>`;
}

function renderPage(): string {
  if (!currentModel) return '<div class="empty-state">Open a .jrxml file to start viewing it.</div>';
  const { page } = currentModel;
  let bandY = 0;
  const bands = currentModel.bands.map((band) => {
    const output = `<g class="band-group"><rect class="band-box" x="0" y="${bandY}" width="${page.width}" height="${band.height}"/><text class="band-label" x="4" y="${bandY + 12}">${escapeHtml(band.name)} (${band.height})</text>${band.elements.map((element) => renderElement(element, bandY)).join('')}</g>`;
    bandY += band.height;
    return output;
  }).join('');
  const grid = showGrid ? `<defs><pattern id="grid" width="${Math.max(1, Math.round(Number((document.getElementById('grid-size') as HTMLInputElement | null)?.value ?? 5)))}" height="${Math.max(1, Math.round(Number((document.getElementById('grid-size') as HTMLInputElement | null)?.value ?? 5)))}" patternUnits="userSpaceOnUse"><path d="M ${Math.max(1, Math.round(Number((document.getElementById('grid-size') as HTMLInputElement | null)?.value ?? 5)))} 0 L 0 0 0 ${Math.max(1, Math.round(Number((document.getElementById('grid-size') as HTMLInputElement | null)?.value ?? 5)))}" fill="none" stroke="currentColor" stroke-opacity=".10" stroke-width=".5"/></pattern></defs><rect class="grid" width="${page.width}" height="${page.height}" fill="url(#grid)"/>` : '';
  return `<div class="page-wrap" style="width:${page.width * zoom}px; min-height:${page.height * zoom}px"><svg id="report-svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width * zoom}" height="${page.height * zoom}" role="img" aria-label="JRXML report preview">${grid}<rect class="page-background" width="${page.width}" height="${page.height}"/>${bands}</svg></div>`;
}

function renderInspector(): string {
  const element = selectedElement();
  if (!element) {
    return `<div class="inspector-empty"><strong>${escapeHtml(currentModel?.name ?? 'JRXML Viewer')}</strong><span>Select an element to inspect and edit its properties.</span><dl><dt>Page</dt><dd>${currentModel?.page.width ?? '-'} × ${currentModel?.page.height ?? '-'} pt</dd><dt>Bands</dt><dd>${currentModel?.bands.length ?? 0}</dd><dt>Fields</dt><dd>${currentModel?.fields.length ?? 0}</dd><dt>Parameters</dt><dd>${currentModel?.parameters.length ?? 0}</dd></dl></div>`;
  }
  const input = (property: string, label: string, value: string | number, type = 'text'): string => `<label>${label}<input data-property="${property}" type="${type}" value="${escapeAttr(String(value))}" /></label>`;
  return `<div class="inspector-title"><span class="kind-pill">${escapeHtml(element.kind)}</span><button id="reveal-source" title="Reveal source">$(code)</button></div>
    ${input('x', 'X', element.x, 'number')}${input('y', 'Y', element.y, 'number')}${input('width', 'Width', element.width, 'number')}${input('height', 'Height', element.height, 'number')}
    ${element.text !== undefined ? input('text', 'Text', element.text) : ''}
    ${element.expression !== undefined ? `<label>Expression<textarea data-property="expression">${escapeHtml(element.expression)}</textarea></label>` : ''}
    ${input('style', 'Style', element.style ?? '')}
    <div class="inspector-actions"><button id="duplicate">Duplicate</button><button id="delete" class="danger">Delete</button></div>`;
}

function renderDiagnostics(): string {
  const diagnostics = currentModel?.diagnostics ?? [];
  if (!diagnostics.length) return '<div class="diagnostic-ok">✓ No structural issues detected</div>';
  return `<div class="diagnostics">${diagnostics.map((item) => `<div class="diagnostic ${item.severity}"><span>${item.severity === 'error' ? '×' : item.severity === 'warning' ? '!' : 'i'}</span><div>${escapeHtml(item.message)}<small>${item.code ? escapeHtml(item.code) : ''}</small></div></div>`).join('')}</div>`;
}

function render(): void {
  const selected = selectedElement();
  const bands = currentModel?.bands ?? [];
  const activeBand = bands.find((band) => band.elements.some((element) => element.id === selectedId))?.name ?? bands[0]?.name ?? 'detail';
  app.innerHTML = `<div class="jrxml-app">
    <header class="toolbar">
      <div class="brand"><span class="brand-mark">JR</span><strong>${escapeHtml(currentModel?.name ?? 'JRXML Viewer')}</strong></div>
      <div class="toolbar-group"><button data-action="zoom-out" title="Zoom out">−</button><span class="zoom-value">${Math.round(zoom * 100)}%</span><button data-action="zoom-in" title="Zoom in">+</button><button data-action="fit" title="Fit page">Fit</button><button data-action="grid" class="${showGrid ? 'active' : ''}" title="Toggle grid">Grid</button></div>
      <div class="toolbar-group"><button data-action="open-source">Source</button><button data-action="validate">Validate</button><button data-action="export-svg">Export SVG</button><button data-action="export-html">Export HTML</button><select id="runtime-format" title="Runtime output format"><option value="pdf">PDF</option><option value="html">HTML</option><option value="xlsx">XLSX</option><option value="csv">CSV</option></select><button data-action="runtime">Runtime Preview</button></div>
    </header>
    <main class="workspace">
      <section class="canvas-panel"><div class="canvas-toolbar"><span>${selected ? `${escapeHtml(selected.kind)} selected` : 'Design preview'}</span><span class="canvas-hint">Click an element to inspect • Double-click to reveal source</span></div><div id="canvas" class="canvas">${renderPage()}</div></section>
      <aside class="side-panel"><div class="panel-section"><div class="panel-heading">Add element</div><div class="add-grid">${['staticText', 'textField', 'image', 'line', 'rectangle', 'frame'].map((kind) => `<button data-add-kind="${kind}">${kind}</button>`).join('')}</div><label class="band-select">Target band<select id="band-select">${bands.map((band) => `<option value="${escapeAttr(band.name)}" ${band.name === activeBand ? 'selected' : ''}>${escapeHtml(band.name)}</option>`).join('')}</select></label></div><div class="panel-section inspector"><div class="panel-heading">Properties</div>${renderInspector()}</div><div class="panel-section"><div class="panel-heading">Diagnostics</div>${renderDiagnostics()}</div></aside>
    </main>
    <footer class="statusbar"><span>${currentModel ? `${currentModel.bands.length} bands · ${allElements().length} elements · ${currentModel.fields.length} fields` : 'Ready'}</span><span>JRXML Viewer</span></footer>
    <input id="grid-size" type="hidden" value="5" />
  </div>`;
  bindEvents();
}

function send(message: WebviewToExtensionMessage): void {
  vscode.postMessage(message);
}

function sendExport(format: 'html' | 'svg'): void {
  const svg = document.querySelector<SVGElement>('#report-svg')?.outerHTML;
  if (!svg) return;
  const content = format === 'svg' ? svg : `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(currentModel?.name ?? 'JRXML Report')}</title><style>body{margin:24px;background:#f3f5f7}svg{background:white;max-width:100%;height:auto;box-shadow:0 3px 12px #0003}</style></head><body>${svg}</body></html>`;
  send({ type: 'export', format, content });
}

function bindEvents(): void {
  app.querySelectorAll<HTMLElement>('[data-element-id]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedId = element.dataset.elementId;
      send({ type: 'select', id: selectedId ?? '' });
      render();
    });
    element.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      const selected = selectedElement();
      if (selected) send({ type: 'revealSource', start: selected.sourceStart, end: selected.sourceEnd });
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'zoom-in') zoom = Math.min(4, zoom + 0.1);
    if (action === 'zoom-out') zoom = Math.max(0.25, zoom - 0.1);
    if (action === 'fit') zoom = 1;
    if (action === 'grid') { showGrid = !showGrid; send({ type: 'setGrid', enabled: showGrid }); }
    if (action === 'validate') send({ type: 'validate' });
    if (action === 'open-source') send({ type: 'openSource' });
    if (action === 'export-svg') sendExport('svg');
    if (action === 'export-html') sendExport('html');
    if (action === 'runtime') send({ type: 'runtimePreview', format: (app.querySelector<HTMLSelectElement>('#runtime-format')?.value as 'pdf' | 'html' | 'xlsx' | 'csv' | undefined) ?? 'pdf' });
    render();
  }));
  app.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-property]').forEach((input) => input.addEventListener('change', () => {
    if (!selectedId) return;
    const property = input.dataset.property as 'x' | 'y' | 'width' | 'height' | 'text' | 'expression' | 'style';
    const value = input instanceof HTMLInputElement && input.type === 'number' ? Number(input.value) : input.value;
    send({ type: 'updateElement', id: selectedId, property, value });
  }));
  app.querySelector<HTMLButtonElement>('#delete')?.addEventListener('click', () => { if (selectedId) send({ type: 'deleteElement', id: selectedId }); });
  app.querySelector<HTMLButtonElement>('#duplicate')?.addEventListener('click', () => { if (selectedId) send({ type: 'duplicateElement', id: selectedId }); });
  app.querySelector<HTMLButtonElement>('#reveal-source')?.addEventListener('click', () => { const selected = selectedElement(); if (selected) send({ type: 'revealSource', start: selected.sourceStart, end: selected.sourceEnd }); });
  app.querySelectorAll<HTMLButtonElement>('[data-add-kind]').forEach((button) => button.addEventListener('click', () => {
    const band = app.querySelector<HTMLSelectElement>('#band-select')?.value ?? 'detail';
    send({ type: 'addElement', band, kind: button.dataset.addKind ?? 'staticText' });
  }));
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'model') {
    currentModel = message.model;
    selectedId = message.selectedId ?? selectedId;
    render();
  } else if (message.type === 'selection') {
    selectedId = message.id;
    render();
  } else if (message.type === 'error') {
    window.alert(message.message);
  } else if (message.type === 'runtimeStatus') {
    const status = message.status === 'error' ? 'error' : 'info';
    const text = document.querySelector('.statusbar span');
    if (text) text.textContent = `${message.message}`;
    if (status === 'error') window.alert(message.message);
  } else if (message.type === 'exportRequest') {
    sendExport(message.format);
  }
});

render();
send({ type: 'ready' });
