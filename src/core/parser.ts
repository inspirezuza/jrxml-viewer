import { XMLValidator } from 'fast-xml-parser';
import { attr, attrObject, child, children, descendant, scanXml, textValue, xmlLocalName } from './xml';
import type { JrxmlBand, JrxmlDocumentModel, JrxmlElement, JrxmlField, JrxmlParameter, JrxmlStyle, JrxmlVariable, ParseResult, XmlNode } from './types';

const SUPPORTED_ELEMENTS = new Set([
  'staticText', 'textField', 'image', 'line', 'rectangle', 'ellipse', 'frame', 'break', 'subreport',
  'componentElement', 'genericElement', 'chart', 'crosstab', 'table', 'list', 'barcode'
]);

const BAND_NAMES = [
  'background', 'title', 'pageHeader', 'columnHeader', 'groupHeader', 'detail', 'groupFooter',
  'columnFooter', 'pageFooter', 'lastPageFooter', 'summary', 'noData'
];

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstDefined = (...values: Array<string | undefined>): string | undefined => values.find((value) => value !== undefined && value !== '');

function directElementNodes(band: XmlNode): XmlNode[] {
  return band.children.filter((node) => node.name !== 'band' && child(node, 'reportElement'));
}

function elementLabel(node: XmlNode, expression?: string, text?: string): string {
  const kind = xmlLocalName(node.name);
  if (text) return text.replace(/\s+/g, ' ').slice(0, 60);
  if (expression) return expression.replace(/\s+/g, ' ').slice(0, 60);
  return kind;
}

function parseElement(node: XmlNode): JrxmlElement {
  const reportElement = child(node, 'reportElement');
  const textNode = firstDefined(textValue(child(node, 'text')), textValue(descendant(node, 'text')));
  const expressionNode = firstDefined(
    textValue(child(node, 'textFieldExpression')),
    textValue(child(node, 'imageExpression')),
    textValue(child(node, 'subreportExpression')),
    textValue(descendant(node, 'textFieldExpression')),
    textValue(descendant(node, 'imageExpression')),
    textValue(descendant(node, 'subreportExpression'))
  );
  const imageExpression = textValue(child(node, 'imageExpression')) ?? textValue(descendant(node, 'imageExpression'));
  const printWhenExpression = textValue(child(node, 'printWhenExpression')) ?? textValue(descendant(node, 'printWhenExpression'));
  const kind = xmlLocalName(node.name);
  const attributes = { ...attrObject(reportElement), ...attrObject(node) };
  const childrenElements = node.children
    .filter((item) => item !== reportElement && child(item, 'reportElement'))
    .map(parseElement);
  return {
    id: `${kind}:${node.start}`,
    kind,
    label: elementLabel(node, expressionNode, textNode),
    x: toNumber(attr(reportElement, 'x'), 0),
    y: toNumber(attr(reportElement, 'y'), 0),
    width: toNumber(attr(reportElement, 'width'), 0),
    height: toNumber(attr(reportElement, 'height'), 0),
    rotation: attr(reportElement, 'rotation'),
    style: firstDefined(attr(reportElement, 'style'), attr(node, 'style')),
    text: textNode,
    expression: expressionNode,
    imageExpression,
    printWhenExpression,
    attributes,
    sourceRange: { start: node.start, end: node.end },
    reportElementRange: reportElement ? { start: reportElement.start, end: reportElement.end } : undefined,
    children: childrenElements,
    unsupported: !SUPPORTED_ELEMENTS.has(kind)
  };
}

function parseBand(name: string, section: XmlNode): JrxmlBand | undefined {
  const band = child(section, 'band');
  if (!band) return undefined;
  return {
    name,
    height: toNumber(attr(band, 'height'), 0),
    splitType: attr(band, 'splitType'),
    sourceRange: { start: section.start, end: section.end },
    elements: directElementNodes(band).map(parseElement)
  };
}

function parseFields(root: XmlNode): JrxmlField[] {
  return children(root, 'field').map((node) => ({
    name: attr(node, 'name') ?? '(unnamed)',
    className: attr(node, 'class') ?? 'java.lang.Object',
    description: textValue(child(node, 'fieldDescription')),
    sourceRange: { start: node.start, end: node.end }
  }));
}

function parseParameters(root: XmlNode): JrxmlParameter[] {
  return children(root, 'parameter').map((node) => ({
    name: attr(node, 'name') ?? '(unnamed)',
    className: attr(node, 'class') ?? 'java.lang.Object',
    isForPrompting: attr(node, 'isForPrompting') !== 'false',
    defaultValueExpression: textValue(child(node, 'defaultValueExpression')),
    sourceRange: { start: node.start, end: node.end }
  }));
}

function parseVariables(root: XmlNode): JrxmlVariable[] {
  return children(root, 'variable').map((node) => ({
    name: attr(node, 'name') ?? '(unnamed)',
    className: attr(node, 'class') ?? 'java.lang.Object',
    calculation: attr(node, 'calculation'),
    expression: textValue(child(node, 'variableExpression')),
    sourceRange: { start: node.start, end: node.end }
  }));
}

function parseStyles(root: XmlNode): JrxmlStyle[] {
  return children(root, 'style').map((node) => ({
    name: attr(node, 'name') ?? '(unnamed)',
    parentStyle: attr(node, 'style'),
    attributes: attrObject(node),
    sourceRange: { start: node.start, end: node.end }
  }));
}

function collectResources(root: XmlNode): string[] {
  const values: string[] = [];
  const visit = (node: XmlNode): void => {
    const name = xmlLocalName(node.name);
    if (name.endsWith('Expression') && /image|subreport|template|style|font/i.test(name)) {
      const value = textValue(node);
      if (value) values.push(value);
    }
    node.children.forEach(visit);
  };
  visit(root);
  return [...new Set(values)];
}

function pageFromRoot(root: XmlNode): JrxmlDocumentModel['page'] {
  const width = toNumber(attr(root, 'pageWidth'), 595);
  const height = toNumber(attr(root, 'pageHeight'), 842);
  const orientation = attr(root, 'orientation') ?? (width > height ? 'Landscape' : 'Portrait');
  return {
    width,
    height,
    orientation,
    columnWidth: toNumber(attr(root, 'columnWidth'), Math.max(1, width - 40)),
    columnCount: toNumber(attr(root, 'columnCount'), 1),
    columnSpacing: toNumber(attr(root, 'columnSpacing'), 0),
    leftMargin: toNumber(attr(root, 'leftMargin'), 20),
    rightMargin: toNumber(attr(root, 'rightMargin'), 20),
    topMargin: toNumber(attr(root, 'topMargin'), 20),
    bottomMargin: toNumber(attr(root, 'bottomMargin'), 20)
  };
}

export function parseJrxml(source: string): ParseResult {
  const scan = scanXml(source);
  const diagnostics = [] as JrxmlDocumentModel['diagnostics'];
  if (scan.error) diagnostics.push({ message: scan.error.message, severity: 'error', range: { start: scan.error.offset, end: Math.min(source.length, scan.error.offset + 1) }, code: 'xml-scan' });

  const validation = XMLValidator.validate(source, { allowBooleanAttributes: true });
  if (validation !== true) {
    const error = validation.err as { msg?: string; line?: number; col?: number };
    const lines = source.split(/\r?\n/);
    const line = Math.max(0, (error.line ?? 1) - 1);
    const offset = lines.slice(0, line).reduce((total, item) => total + item.length + 1, 0) + Math.max(0, (error.col ?? 1) - 1);
    diagnostics.push({ message: error.msg ?? 'Invalid XML.', severity: 'error', range: { start: offset, end: Math.min(source.length, offset + 1) }, code: 'xml-validation' });
  }

  const root = scan.root;
  const rootName = root ? xmlLocalName(root.name) : '';
  const attributes = attrObject(root);
  if (!root) diagnostics.push({ message: 'JRXML root element <jasperReport> was not found.', severity: 'error', range: { start: 0, end: Math.min(1, source.length) }, code: 'missing-root' });
  else if (rootName !== 'jasperReport') diagnostics.push({ message: `Expected <jasperReport> but found <${root.name}>.`, severity: 'error', range: { start: root.start, end: root.startTagEnd + 1 }, code: 'invalid-root' });
  if (root && !attr(root, 'name')) diagnostics.push({ message: 'The report name attribute is required.', severity: 'warning', range: { start: root.start, end: root.startTagEnd + 1 }, code: 'missing-report-name' });

  const page = root ? pageFromRoot(root) : pageFromRoot({} as XmlNode);
  const bands = root ? BAND_NAMES.map((name) => parseBand(name, child(root, name) ?? ({ children: [] } as unknown as XmlNode))).filter((band): band is JrxmlBand => Boolean(band)) : [];
  const model: JrxmlDocumentModel = {
    rootName,
    name: attr(root, 'name') ?? 'Unnamed JRXML report',
    language: attr(root, 'language') ?? 'java',
    page,
    attributes,
    bands,
    fields: root ? parseFields(root) : [],
    parameters: root ? parseParameters(root) : [],
    variables: root ? parseVariables(root) : [],
    styles: root ? parseStyles(root) : [],
    resources: root ? collectResources(root) : [],
    diagnostics,
    sourceLength: source.length,
    valid: diagnostics.every((item) => item.severity !== 'error')
  };
  return { model, root };
}

export function flattenElements(model: JrxmlDocumentModel): JrxmlElement[] {
  const result: JrxmlElement[] = [];
  const visit = (element: JrxmlElement): void => {
    result.push(element);
    element.children.forEach(visit);
  };
  model.bands.forEach((band) => band.elements.forEach(visit));
  return result;
}

export function findElement(model: JrxmlDocumentModel, id: string): JrxmlElement | undefined {
  return flattenElements(model).find((element) => element.id === id);
}

export function toSerializableModel(model: JrxmlDocumentModel): import('./types').SerializedModel {
  const serializeElement = (element: JrxmlElement): import('./types').SerializedElement => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text,
    expression: element.expression,
    imageExpression: element.imageExpression,
    imageData: element.imageData,
    style: element.style,
    attributes: element.attributes,
    sourceStart: element.sourceRange.start,
    sourceEnd: element.sourceRange.end,
    reportElementStart: element.reportElementRange?.start,
    reportElementEnd: element.reportElementRange?.end,
    children: element.children.map(serializeElement),
    unsupported: element.unsupported
  });
  return {
    rootName: model.rootName,
    name: model.name,
    page: model.page,
    bands: model.bands.map((band) => ({ name: band.name, height: band.height, elements: band.elements.map(serializeElement) })),
    fields: model.fields,
    parameters: model.parameters,
    variables: model.variables,
    styles: model.styles,
    resources: model.resources,
    diagnostics: model.diagnostics
  };
}
