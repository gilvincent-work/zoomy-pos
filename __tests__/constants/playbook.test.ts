import {
  FLOW_STEPS, PRODUCT_NOTES, QUICK_GUIDE, PLAYBOOK_AS_OF, type FlowBlock,
} from '../../constants/playbook';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe('playbook content', () => {
  it('contains no em or en dashes in any string', () => {
    const all = collectStrings([FLOW_STEPS, PRODUCT_NOTES, QUICK_GUIDE, PLAYBOOK_AS_OF]);
    expect(all.length).toBeGreaterThan(0);
    all.forEach((s) => expect(s).not.toMatch(/[–—]/));
  });

  it('gives every flow step either blocks or branches, with unique ids', () => {
    const ids = FLOW_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    FLOW_STEPS.forEach((s) => {
      const hasContent = (s.blocks?.length ?? 0) > 0 || (s.branches?.length ?? 0) > 0;
      expect(hasContent).toBe(true);
    });
  });

  it('gives every branch a label and at least one block', () => {
    FLOW_STEPS.flatMap((s) => s.branches ?? []).forEach((b) => {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.blocks.length).toBeGreaterThan(0);
    });
  });

  it('never leaves an actions block empty', () => {
    const blocks: FlowBlock[] = FLOW_STEPS.flatMap((s) => [
      ...(s.blocks ?? []),
      ...(s.branches ?? []).flatMap((b) => b.blocks),
    ]);
    blocks.forEach((b) => {
      if (b.kind === 'actions') expect(b.items.length).toBeGreaterThan(0);
    });
  });

  it('gives every product note a unique id and a name', () => {
    const ids = PRODUCT_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    PRODUCT_NOTES.forEach((n) => expect(n.name.length).toBeGreaterThan(0));
  });

  it('keeps the quick guide rows filled in', () => {
    expect(QUICK_GUIDE.length).toBeGreaterThan(0);
    QUICK_GUIDE.forEach((r) => {
      expect(r.customer.length).toBeGreaterThan(0);
      expect(r.recommend.length).toBeGreaterThan(0);
    });
  });
});
