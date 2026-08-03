import { escapeXml } from './xml';
import type { JrxmlElement, SourceRange, XmlNode } from './types';

export interface TextEditOperation {
  range: SourceRange;
  newText: string;
}

function findAttributeRange(source: string, nodeRange: SourceRange, name: string): SourceRange | undefined {
  const sourceTag = source.slice(nodeRange.start, nodeRange.end);
  const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=\\s*(["'])(.*?)\\1`);
  const match = pattern.exec(sourceTag);
  if (!match || match.index === undefined) return undefined;
  const valueStart = nodeRange.start + match.index + match[0].indexOf(match[2]);
  return { start: valueStart, end: valueStart + match[2].length };
}

export function updateAttribute(source: string, node: XmlNode, name: string, value: string): TextEditOperation {
  const existing = node.attributes[name];
  if (existing) return { range: existing.valueRange, newText: escapeXml(value) };
  const tag = source.slice(node.start, node.startTagEnd + 1);
  const insertAt = tag.lastIndexOf('/>') >= 0 ? node.startTagEnd - 1 : node.startTagEnd;
  return { range: { start: insertAt, end: insertAt }, newText: ` ${name}="${escapeXml(value)}"` };
}

export function updateAttributeByRange(source: string, range: SourceRange, name: string, value: string): TextEditOperation {
  const existing = findAttributeRange(source, range, name);
  if (existing) return { range: existing, newText: escapeXml(value) };
  const tag = source.slice(range.start, range.end);
  const insertAt = tag.lastIndexOf('/>') >= 0 ? range.end - 2 : range.end - 1;
  return { range: { start: insertAt, end: insertAt }, newText: ` ${name}="${escapeXml(value)}"` };
}

export function replaceContent(_source: string, node: XmlNode, value: string): TextEditOperation {
  const encoded = value.includes('<![CDATA[') ? value : `<![CDATA[${value}]]>`;
  return { range: node.contentRange, newText: encoded };
}

export function deleteRange(element: JrxmlElement): TextEditOperation {
  return { range: element.sourceRange, newText: '' };
}

export function insertBefore(source: string, range: SourceRange, value: string): TextEditOperation {
  const lineStart = source.lastIndexOf('\n', range.start - 1) + 1;
  const indentation = source.slice(lineStart, range.start).match(/^\s*/)?.[0] ?? '  ';
  return { range: { start: range.start, end: range.start }, newText: `\n${indentation}${value.replace(/\n/g, `\n${indentation}`)}` };
}

export function applyOperations(source: string, operations: TextEditOperation[]): string {
  return [...operations]
    .sort((a, b) => b.range.start - a.range.start)
    .reduce((result, operation) => result.slice(0, operation.range.start) + operation.newText + result.slice(operation.range.end), source);
}

export function findNodeForRange(root: XmlNode | undefined, range: SourceRange): XmlNode | undefined {
  if (!root) return undefined;
  if (root.start === range.start && root.end === range.end) return root;
  for (const child of root.children) {
    const found = findNodeForRange(child, range);
    if (found) return found;
  }
  return undefined;
}

export function createElementXml(kind: string, properties: Partial<JrxmlElement>): string {
  const x = properties.x ?? 0;
  const y = properties.y ?? 0;
  const width = properties.width ?? 100;
  const height = properties.height ?? 20;
  const reportElement = `<reportElement x="${x}" y="${y}" width="${width}" height="${height}"/>`;
  if (kind === 'staticText') return `<staticText>${reportElement}<text><![CDATA[Text]]></text></staticText>`;
  if (kind === 'textField') return `<textField>${reportElement}<textFieldExpression><![CDATA[$F{field}]]></textFieldExpression></textField>`;
  if (kind === 'image') return `<image>${reportElement}<imageExpression><![CDATA["image.png"]]></imageExpression></image>`;
  if (kind === 'line') return `<line>${reportElement}</line>`;
  if (kind === 'rectangle') return `<rectangle>${reportElement}</rectangle>`;
  return `<${kind}>${reportElement}</${kind}>`;
}
