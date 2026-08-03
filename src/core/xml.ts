import type { SourcePosition, SourceRange, XmlAttribute, XmlNode } from './types';

const localName = (name: string): string => name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;

export function xmlLocalName(name: string): string {
  return localName(name);
}

function findTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return source.length - 1;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseTag(source: string, start: number, end: number): { name: string; attributes: Record<string, XmlAttribute>; selfClosing: boolean } {
  const contentStart = start + 1;
  const contentEnd = end;
  const raw = source.slice(contentStart, contentEnd);
  const selfClosing = /\/\s*$/.test(raw);
  const withoutMarker = raw.replace(/\/\s*$/, '');
  const nameMatch = /^\s*([^\s/>]+)/.exec(withoutMarker);
  const name = nameMatch?.[1] ?? '';
  const attributes: Record<string, XmlAttribute> = {};
  const attrStart = contentStart + (nameMatch?.[0].length ?? 0);
  const attrSource = source.slice(attrStart, contentEnd);
  const attrPattern = /([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(attrSource)) !== null) {
    const nameOffset = attrStart + match.index;
    const valueToken = match[2];
    const valueOffset = nameOffset + match[0].indexOf(valueToken) + 1;
    const fullEnd = nameOffset + match[0].length;
    attributes[match[1]] = {
      name: match[1],
      value: decodeXml(valueToken.slice(1, -1)),
      valueRange: { start: valueOffset, end: valueOffset + valueToken.length - 2 },
      fullRange: { start: nameOffset, end: fullEnd }
    };
  }
  return { name, attributes, selfClosing };
}

function appendText(node: XmlNode | undefined, value: string, start: number): void {
  if (!node || value.length === 0) return;
  node.text += value;
  if (node.contentRange.start === node.startTagEnd + 1) node.contentRange.start = start;
  node.contentRange.end = start + value.length;
}

export interface XmlScanResult {
  root?: XmlNode;
  nodes: XmlNode[];
  error?: { message: string; offset: number };
}

export function scanXml(source: string): XmlScanResult {
  const stack: XmlNode[] = [];
  const nodes: XmlNode[] = [];
  let root: XmlNode | undefined;
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) {
      appendText(stack.at(-1), source.slice(index), index);
      break;
    }
    if (open > index) appendText(stack.at(-1), source.slice(index, open), index);

    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end === -1) return { root, nodes, error: { message: 'Unclosed XML comment.', offset: open } };
      index = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      if (end === -1) return { root, nodes, error: { message: 'Unclosed CDATA section.', offset: open } };
      appendText(stack.at(-1), source.slice(open + 9, end), open + 9);
      index = end + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open + 2);
      if (end === -1) return { root, nodes, error: { message: 'Unclosed XML processing instruction.', offset: open } };
      index = end + 2;
      continue;
    }
    if (source.startsWith('<!', open)) {
      const end = findTagEnd(source, open);
      index = end + 1;
      continue;
    }

    const end = findTagEnd(source, open);
    const isClosing = source[open + 1] === '/';
    if (isClosing) {
      const closeName = source.slice(open + 2, end).trim().split(/\s+/)[0];
      const node = stack.pop();
      if (!node || node.name !== closeName) {
        return { root, nodes, error: { message: `Unexpected closing tag </${closeName}>.`, offset: open } };
      }
      node.endTagStart = open;
      node.end = end + 1;
      node.contentRange.end = open;
      index = end + 1;
      continue;
    }

    const parsed = parseTag(source, open, end);
    if (!parsed.name) return { root, nodes, error: { message: 'XML element name is missing.', offset: open } };
    const node: XmlNode = {
      name: parsed.name,
      start: open,
      startTagEnd: end,
      end: parsed.selfClosing ? end + 1 : source.length,
      endTagStart: parsed.selfClosing ? end : source.length,
      selfClosing: parsed.selfClosing,
      attributes: parsed.attributes,
      children: [],
      text: '',
      contentRange: { start: end + 1, end: end + 1 },
      parent: stack.at(-1)
    };
    stack.at(-1)?.children.push(node);
    nodes.push(node);
    if (!root) root = node;
    if (!parsed.selfClosing) stack.push(node);
    index = end + 1;
  }

  if (stack.length > 0) {
    const node = stack.at(-1);
    return { root, nodes, error: { message: `Unclosed XML element <${node?.name ?? 'unknown'}>.`, offset: node?.start ?? source.length } };
  }
  return { root, nodes };
}

export function attr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const direct = node.attributes[name];
  if (direct) return direct.value;
  const found = Object.values(node.attributes).find((item) => localName(item.name) === localName(name));
  return found?.value;
}

export function attrObject(node: XmlNode | undefined): Record<string, string> {
  if (!node) return {};
  return Object.fromEntries(Object.values(node.attributes).map((item) => [item.name, item.value]));
}

export function children(node: XmlNode | undefined, name?: string): XmlNode[] {
  const items = node?.children ?? [];
  return name ? items.filter((item) => localName(item.name) === localName(name)) : items;
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return children(node, name)[0];
}

export function descendant(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const item of node.children) {
    if (localName(item.name) === localName(name)) return item;
    const found = descendant(item, name);
    if (found) return found;
  }
  return undefined;
}

export function textValue(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const direct = node.text.trim();
  if (direct) return direct.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  const textNodes = node.children.map((item) => textValue(item)).filter(Boolean);
  return textNodes.length ? textNodes.join('') : undefined;
}

export function positionAt(source: string, offset: number): SourcePosition {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  const before = source.slice(0, safeOffset);
  const lines = before.split(/\r?\n/);
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

export function rangeToLineColumn(source: string, range: SourceRange): { start: SourcePosition; end: SourcePosition } {
  return { start: positionAt(source, range.start), end: positionAt(source, range.end) };
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
