import { flattenElements } from './parser';
import type { JrxmlDiagnostic, JrxmlDocumentModel } from './types';

function duplicateDiagnostics(items: Array<{ name: string; sourceRange: { start: number; end: number } }>, label: string): JrxmlDiagnostic[] {
  const seen = new Map<string, number>();
  const diagnostics: JrxmlDiagnostic[] = [];
  for (const item of items) {
    const count = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, count);
    if (count > 1) diagnostics.push({ message: `Duplicate ${label} name "${item.name}".`, severity: 'error', range: item.sourceRange, code: `duplicate-${label}` });
  }
  return diagnostics;
}

export function validateModel(model: JrxmlDocumentModel): JrxmlDiagnostic[] {
  const diagnostics: JrxmlDiagnostic[] = [...model.diagnostics];
  diagnostics.push(...duplicateDiagnostics(model.fields, 'field'));
  diagnostics.push(...duplicateDiagnostics(model.parameters, 'parameter'));
  diagnostics.push(...duplicateDiagnostics(model.variables, 'variable'));
  diagnostics.push(...duplicateDiagnostics(model.styles, 'style'));

  const elements = flattenElements(model);
  for (const element of elements) {
    if (element.width < 0 || element.height < 0) diagnostics.push({ message: `${element.kind} has a negative size.`, severity: 'error', range: element.sourceRange, code: 'negative-size' });
    if (element.x < 0 || element.y < 0) diagnostics.push({ message: `${element.kind} has a negative position.`, severity: 'warning', range: element.sourceRange, code: 'negative-position' });
    if (element.x + element.width > model.page.columnWidth + model.page.leftMargin + model.page.rightMargin) diagnostics.push({ message: `${element.kind} extends beyond the report page width.`, severity: 'warning', range: element.sourceRange, code: 'out-of-bounds-x' });
    if (element.unsupported) diagnostics.push({ message: `The element type <${element.kind}> is displayed using a fallback renderer.`, severity: 'info', range: element.sourceRange, code: 'unsupported-element' });
  }

  const defined = new Set([...model.fields, ...model.parameters, ...model.variables].map((item) => item.name));
  for (const element of elements) {
    const expression = element.expression ?? element.imageExpression ?? '';
    for (const match of expression.matchAll(/\$(F|P|V)\{([^}]+)\}/g)) {
      if (!defined.has(match[2])) diagnostics.push({ message: `Reference ${match[0]} does not match a declared ${match[1] === 'F' ? 'field' : match[1] === 'P' ? 'parameter' : 'variable'}.`, severity: 'warning', range: element.sourceRange, code: 'missing-reference' });
    }
  }
  return diagnostics;
}
