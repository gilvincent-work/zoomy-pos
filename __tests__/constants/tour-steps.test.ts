import { TOUR_STEPS } from '../../constants/tour-steps';

// Admin-only screens the tour must never open or spotlight.
const ADMIN_ROUTES = ['/modals/admin', '/modals/payment-settings'];

describe('TOUR_STEPS', () => {
  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains no em or en dashes in any title or body', () => {
    TOUR_STEPS.forEach((s) => {
      expect(s.title).not.toMatch(/[–—]/);
      expect(s.body).not.toMatch(/[–—]/);
      if (s.auto) expect(s.auto).not.toMatch(/[–—]/);
    });
  });

  it('never routes to or targets admin screens, Settings included', () => {
    TOUR_STEPS.forEach((s) => {
      ADMIN_ROUTES.forEach((r) => expect(s.route.startsWith(r)).toBe(false));
      const targets = s.target === null ? [] : Array.isArray(s.target) ? s.target : [s.target];
      targets.forEach((t) => expect(t).not.toMatch(/settings|admin|pin/i));
    });
  });

  it('starts with a centered welcome card and has copy on every step', () => {
    expect(TOUR_STEPS[0].target).toBeNull();
    TOUR_STEPS.forEach((s) => {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    });
  });
});
