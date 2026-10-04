import type { TourStep } from '../components/tour/types';

// The Tutorial tour, in the order a new seller meets the register. Admin-only
// screens (Settings, Change PIN, Payment Options, QR codes) are left out on
// purpose. Copy follows the app's no em/en dash rule; a test enforces it.
//
// `target` ids are `TourTarget`s in the components. A list means "first one
// that exists" (portrait peek bar vs landscape side cart).

const HOME = '/';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: HOME,
    target: null,
    title: 'Welcome to Zoomy POS',
    body: 'A short walk through the register. The tour opens each screen for you, and nothing you see here is saved or charged.',
  },
  {
    id: 'event',
    route: HOME,
    target: 'event',
    title: 'Event badge',
    body: 'Shows which bazaar day you are selling on. Tap it to set up the event day.',
  },
  {
    id: 'sync',
    route: HOME,
    target: 'sync',
    title: 'Sync status',
    body: 'Shows whether your sales have reached Coop. The POS keeps working offline and catches up when the signal returns.',
  },
  {
    id: 'pills',
    route: HOME,
    target: 'pills',
    title: 'Categories',
    body: 'Filter the tiles by product line. Bundles shows the event deals, and Prize is for the spin the wheel.',
  },
  {
    id: 'grid',
    route: HOME,
    target: 'grid',
    title: 'Product tiles',
    body: 'Tap a tile to add it to the cart. A badge counts how many are in the sale, and a warning shows when stock is low.',
  },
  {
    id: 'variants',
    route: HOME,
    target: 'variant-options',
    title: 'Sizes and flavors',
    body: 'Products with variants open a picker first. Tap each variant to add it, then press Done.',
    auto: 'The tour taps a product that has variants',
    scene: { sheet: 'variant' },
  },
  {
    id: 'free-taste-sheet',
    route: HOME,
    target: 'quick-actions',
    title: 'Long press for a free taste',
    body: 'Hold any tile to log a free taste. It uses up stock for pets to sample, and it does not add to the sale.',
    auto: 'The tour long-presses a tile',
    scene: { sheet: 'free-taste' },
  },
  {
    id: 'pet',
    route: HOME,
    target: ['peek-pet', 'panel-pet'],
    title: 'Pet tag',
    body: 'Tag the sale as Dog, Cat or Both. Tap the chip again to clear it.',
  },
  {
    id: 'method',
    route: HOME,
    target: ['peek-method', 'panel-method'],
    title: 'Payment method',
    body: 'Pick how the customer pays. Your manager chooses which methods show up in Settings.',
  },
  {
    id: 'cart-total',
    route: HOME,
    target: ['peek-total', 'panel-lines'],
    title: 'Your cart',
    body: 'The item count and total of the current sale. A demo item was added for the tour.',
  },
  {
    id: 'cart-lines',
    route: HOME,
    target: 'panel-lines',
    title: 'Cart lines',
    body: 'Use plus and minus to change a quantity. The gift icon marks a line as a free prize, and the bin removes it.',
    auto: 'The tour opens the cart',
    scene: { cartExpanded: true },
  },
  {
    id: 'pay',
    route: HOME,
    target: ['peek-pay', 'panel-pay'],
    title: 'Pay',
    body: 'Tap Pay to finish the sale. By default it asks you to confirm first.',
  },
  {
    id: 'confirm-summary',
    route: HOME,
    target: 'confirm-summary',
    title: 'Confirm payment',
    body: 'Check the method and the total before you record the sale.',
    auto: 'The tour taps Pay (demo only)',
    scene: { sheet: 'confirm-pay' },
  },
  {
    id: 'confirm-handle',
    route: HOME,
    target: 'confirm-handle',
    title: 'Furbaby or IG handle',
    body: 'Optional. Add the customer’s Instagram handle or their pet’s name so you can tag them later.',
    scene: { sheet: 'confirm-pay' },
  },
  {
    id: 'confirm-actions',
    route: HOME,
    target: 'confirm-actions',
    title: 'Paid',
    body: 'Paid records the sale and starts a new one. In the tour it is blocked, so nothing is charged.',
    scene: { sheet: 'confirm-pay' },
  },
  {
    id: 'prize',
    route: HOME,
    target: 'grid',
    title: 'Prizes',
    body: 'After the customer spins the wheel, tap the prize tile to pick what they won. It joins the cart as a free line.',
    auto: 'The tour selects the Prize pill',
    scene: { category: 'prize' },
  },
  {
    id: 'bundles',
    route: HOME,
    target: 'grid',
    title: 'Bundle deals',
    body: 'Event deals such as Buy Any 4 show up as tiles. Tap one to choose its flavors.',
    auto: 'The tour selects the Bundles pill',
    scene: { category: 'bundles' },
  },
];
