import { describe, expect, it } from 'vitest';
import { applyOperations, createElementXml, updateAttributeByRange } from '../../src/core/edits';
import { parseJrxml } from '../../src/core/parser';

describe('JRXML source edits', () => {
  it('updates an existing reportElement attribute without rewriting the document', () => {
    const source = `<jasperReport name="test"><detail><band height="20"><staticText><reportElement x="1" y="2" width="10" height="10"/><text><![CDATA[Hello]]></text></staticText></band></detail></jasperReport>`;
    const parsed = parseJrxml(source);
    const element = parsed.model.bands[0]!.elements[0]!;
    const node = parsed.root!.children.find((child) => child.name === 'detail')!.children[0]!.children[0]!.children[0]!;
    const operation = updateAttributeByRange(source, { start: node.start, end: node.startTagEnd + 1 }, 'x', '42');
    const updated = applyOperations(source, [operation]);
    expect(updated).toContain('x="42"');
    expect(updated).toContain('<text><![CDATA[Hello]]></text>');
    expect(element.sourceRange.end).toBeGreaterThan(element.sourceRange.start);
  });

  it('creates common element snippets', () => {
    expect(createElementXml('staticText', { x: 4, y: 5 })).toContain('<staticText>');
    expect(createElementXml('textField', { width: 80 })).toContain('<textFieldExpression>');
  });
});
