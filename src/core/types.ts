export interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceRange {
  start: number;
  end: number;
}

export type JrxmlDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface JrxmlDiagnostic {
  message: string;
  severity: JrxmlDiagnosticSeverity;
  range: SourceRange;
  code?: string;
}

export interface XmlAttribute {
  name: string;
  value: string;
  valueRange: SourceRange;
  fullRange: SourceRange;
}

export interface XmlNode {
  name: string;
  start: number;
  startTagEnd: number;
  end: number;
  endTagStart: number;
  selfClosing: boolean;
  attributes: Record<string, XmlAttribute>;
  children: XmlNode[];
  text: string;
  contentRange: SourceRange;
  parent?: XmlNode;
}

export interface JrxmlField {
  name: string;
  className: string;
  description?: string;
  sourceRange: SourceRange;
}

export interface JrxmlParameter {
  name: string;
  className: string;
  isForPrompting: boolean;
  defaultValueExpression?: string;
  sourceRange: SourceRange;
}

export interface JrxmlVariable {
  name: string;
  className: string;
  calculation?: string;
  expression?: string;
  sourceRange: SourceRange;
}

export interface JrxmlStyle {
  name: string;
  parentStyle?: string;
  attributes: Record<string, string>;
  sourceRange: SourceRange;
}

export interface JrxmlElement {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: string;
  style?: string;
  text?: string;
  expression?: string;
  imageExpression?: string;
  imageData?: string;
  printWhenExpression?: string;
  attributes: Record<string, string>;
  sourceRange: SourceRange;
  reportElementRange?: SourceRange;
  children: JrxmlElement[];
  unsupported?: boolean;
}

export interface JrxmlBand {
  name: string;
  height: number;
  splitType?: string;
  sourceRange: SourceRange;
  elements: JrxmlElement[];
}

export interface JrxmlReportPage {
  width: number;
  height: number;
  orientation: string;
  columnWidth: number;
  columnCount: number;
  columnSpacing: number;
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  bottomMargin: number;
}

export interface JrxmlDocumentModel {
  rootName: string;
  name: string;
  language: string;
  page: JrxmlReportPage;
  attributes: Record<string, string>;
  bands: JrxmlBand[];
  fields: JrxmlField[];
  parameters: JrxmlParameter[];
  variables: JrxmlVariable[];
  styles: JrxmlStyle[];
  resources: string[];
  diagnostics: JrxmlDiagnostic[];
  sourceLength: number;
  valid: boolean;
}

export interface ParseResult {
  model: JrxmlDocumentModel;
  root?: XmlNode;
}

export interface SerializedElement {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  expression?: string;
  imageExpression?: string;
  imageData?: string;
  attributes: Record<string, string>;
  style?: string;
  sourceStart: number;
  sourceEnd: number;
  reportElementStart?: number;
  reportElementEnd?: number;
  children: SerializedElement[];
  unsupported?: boolean;
}

export interface SerializedModel {
  rootName: string;
  name: string;
  page: JrxmlReportPage;
  bands: Array<{
    name: string;
    height: number;
    elements: SerializedElement[];
  }>;
  fields: JrxmlField[];
  parameters: JrxmlParameter[];
  variables: JrxmlVariable[];
  styles: JrxmlStyle[];
  resources: string[];
  diagnostics: JrxmlDiagnostic[];
}
