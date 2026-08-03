import { describe, expect, it } from 'vitest';
import { parseJrxml, flattenElements, findElement } from '../../src/core/parser';
import { validateModel } from '../../src/core/diagnostics';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../fixtures', name), 'utf8');

describe('JRXML parser', () => {
  it('parses report metadata, bands and elements', () => {
    const parsed = parseJrxml(fixture('sample.jrxml'));
    expect(parsed.model.valid).toBe(true);
    expect(parsed.model.name).toBe('sample');
    expect(parsed.model.page.width).toBe(595);
    expect(parsed.model.bands.map((band) => band.name)).toEqual(['title', 'detail']);
    expect(flattenElements(parsed.model).map((element) => element.kind)).toEqual(['staticText', 'textField', 'textField', 'rectangle']);
    expect(parsed.model.fields[0]?.name).toBe('customerName');
    expect(parsed.model.parameters[0]?.name).toBe('title');
    expect(parsed.model.styles[0]?.name).toBe('HeaderStyle');
  });

  it('keeps source ranges and resolves elements by id', () => {
    const source = fixture('sample.jrxml');
    const parsed = parseJrxml(source);
    const element = parsed.model.bands[0]?.elements[0];
    expect(element).toBeDefined();
    expect(source.slice(element!.sourceRange.start, element!.sourceRange.end)).toContain('<staticText>');
    expect(findElement(parsed.model, element!.id)).toEqual(element);
  });

  it('reports malformed XML with a useful diagnostic', () => {
    const parsed = parseJrxml(fixture('malformed.jrxml'));
    expect(parsed.model.valid).toBe(false);
    expect(parsed.model.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  });

  it('validates missing field references and negative geometry', () => {
    const source = `<jasperReport name="test"><field name="known" class="java.lang.String"/><detail><band height="20"><textField><reportElement x="-1" y="0" width="10" height="10"/><textFieldExpression><![CDATA[$F{unknown}]]></textFieldExpression></textField></band></detail></jasperReport>`;
    const model = parseJrxml(source).model;
    const diagnostics = validateModel(model);
    expect(diagnostics.some((item) => item.code === 'negative-position')).toBe(true);
    expect(diagnostics.some((item) => item.code === 'missing-reference')).toBe(true);
  });
});
