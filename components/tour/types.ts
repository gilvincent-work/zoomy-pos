/** A rectangle in window coordinates (what `measureInWindow` returns). */
export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What the screens should look like while a step is showing. Declarative: each
 * screen reads the current scene and applies the parts it owns, so a step never
 * has to undo the previous one (a missing field means "closed / default").
 */
export interface TourScene {
  /** Home: which bottom sheet or modal is open. */
  sheet?: 'variant' | 'free-taste' | 'confirm-pay';
  /** Home: the cart sheet is expanded to show every line. */
  cartExpanded?: boolean;
  /** Home: which synthetic category pill is selected. */
  category?: 'bundles' | 'prize';
  /** Home, compact layout only: the header menu drawer is open. */
  drawerOpen?: boolean;
  /** Free taste screen tab. */
  freeTasteTab?: 'record' | 'recent';
  /** Playbook screen tab. */
  playbookTab?: 'flow' | 'products';
}

export interface TourStep {
  id: string;
  /**
   * Route the step lives on. `'/'` is the POS home. A route may contain
   * `:firstBundleId`, which the provider resolves to a real bundle (the step is
   * skipped when there is none).
   */
  route: string;
  /** `TourTarget` id to spotlight, or null for a centered welcome card. */
  target: string | null;
  title: string;
  body: string;
  /** Short note shown on the card when the tour is doing something for the user. */
  auto?: string;
  scene?: TourScene;
}

export type TourStatus = 'idle' | 'navigating' | 'ready';
