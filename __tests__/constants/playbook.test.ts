import {
  FLOW_STEPS, PRODUCT_NOTES, PLAYBOOK_AS_OF, AUDIENCE_FILTERS, notesForFilter,
} from '../../constants/playbook';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe('playbook content', () => {
  it('contains no em or en dashes in any string', () => {
    const all = collectStrings([FLOW_STEPS, PRODUCT_NOTES, PLAYBOOK_AS_OF]);
    expect(all.length).toBeGreaterThan(0);
    all.forEach((s) => expect(s).not.toMatch(/[–—]/));
  });

  it('gives every flow step either actions or branches, with unique ids', () => {
    const ids = FLOW_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    FLOW_STEPS.forEach((s) => {
      const hasContent = (s.actions?.length ?? 0) > 0 || (s.branches?.length ?? 0) > 0;
      expect(hasContent).toBe(true);
    });
  });

  it('gives every branch a label and at least one action', () => {
    FLOW_STEPS.flatMap((s) => s.branches ?? []).forEach((b) => {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.actions.length).toBeGreaterThan(0);
    });
  });

  it('gives every product note facts and an audience', () => {
    PRODUCT_NOTES.forEach((n) => {
      expect(n.facts.length).toBeGreaterThan(0);
      expect(n.audience.length).toBeGreaterThan(0);
    });
  });
});

describe('notesForFilter', () => {
  it('returns every note for "all"', () => {
    expect(notesForFilter('all')).toHaveLength(PRODUCT_NOTES.length);
  });

  it('returns only notes for the chosen audience', () => {
    const cats = notesForFilter('cats');
    expect(cats.length).toBeGreaterThan(0);
    cats.forEach((n) => expect(n.audience).toContain('cats'));
  });

  it('has a filter chip for every audience used by the notes', () => {
    const keys = AUDIENCE_FILTERS.map((f) => f.key);
    PRODUCT_NOTES.flatMap((n) => n.audience).forEach((a) => expect(keys).toContain(a));
  });
});
