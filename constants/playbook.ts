// Sales playbook content: the booth conversation flow and product facts.
// Static on purpose (works offline at the booth, no sync). No em/en dashes in
// any string (brand copy rule); playbook.test.ts enforces it.

export type PlaybookAudience = 'small' | 'big' | 'cats';

export interface FlowBranch {
  label: string;
  actions: string[];
  /** A line to say out loud to the customer. */
  say?: string;
  /** Shows a shortcut button into the POS. */
  shortcut?: 'free-taste';
}

export interface FlowStep {
  id: string;
  title: string;
  hint: string;
  actions?: string[];
  say?: string;
  /** Mutually exclusive paths; the seller picks the one that applies. */
  branches?: FlowBranch[];
}

export interface ProductNote {
  id: string;
  name: string;
  audience: PlaybookAudience[];
  facts: string[];
  tags: string[];
  expiry?: string;
}

/** When the product notes were last checked against real batches. */
export const PLAYBOOK_AS_OF = 'October 2026';

export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'booth',
    title: 'At the booth',
    hint: 'Start here',
    actions: ['Stand in front of the booth.'],
  },
  {
    id: 'pet-check',
    title: 'Check for a pet',
    hint: 'Pick the path that fits',
    branches: [
      {
        label: 'Has a pet',
        actions: [
          'Ask if you can offer a treat.',
          'If yes, give a free taste.',
          'If the pet eats it, ask if you can take a video, then record it.',
        ],
        shortcut: 'free-taste',
      },
      {
        label: 'No pet with them',
        actions: [
          'Ask if they have a pet.',
          'Ask what kind of pet it is and what its name is.',
        ],
      },
    ],
  },
  {
    id: 'recommend',
    title: 'Recommend by size',
    hint: 'Pick the path that fits',
    branches: [
      {
        label: 'Small dog or cat',
        actions: [
          'Recommend freeze dried. It is pure meat and good for small cats and dogs.',
          'For a cat, add a little water to rehydrate the meat. Cats need moisture and do not like drinking.',
        ],
        say: 'This is our best seller, freeze dried. It is pure meat and good for small cats and dogs.',
      },
      {
        label: 'Big dog or cat',
        actions: [
          'Our best seller for them is Meaty Treats. Also suggest Tasty Treats, our premium option.',
          'Meaty Treats are the more "fun" product, with some carbs mixed in with the meat.',
          'Tasty Treats are pure meat, better if they want a high protein diet for their dog.',
        ],
      },
    ],
  },
  {
    id: 'price',
    title: 'Say the price',
    hint: 'In this order',
    actions: ['Say the individual price.', 'Then say the bundle price.'],
    say: 'We have a special event deal, and it is super worth it!',
  },
  {
    id: 'payment',
    title: 'At payment',
    hint: 'While they scan',
    actions: [
      'Log what they are taking in the POS as they scan.',
      'Pick the pet type in the cart: cat, dog, or both.',
    ],
    say: 'Ma’am, we are on Instagram too. You can scan the QR, follow and tag us so we can post your pet!',
  },
  {
    id: 'after',
    title: 'After payment',
    hint: 'Last touches',
    actions: [
      'Tell them they can spin the wheel for more prizes. They just scan the QR.',
      'If their pet liked the treats, they can buy on our website. It is cheaper than Shopee and Lazada, which add fees on top.',
    ],
  },
];

export const PRODUCT_NOTES: ProductNote[] = [
  {
    id: 'freeze-dried',
    name: 'Freeze Dried line',
    audience: ['small', 'cats'],
    facts: [
      'No sodium, no preservatives, human grade.',
      'Good for cats and dogs 8 weeks and older.',
      'For a kitten or puppy, suggest freeze dried: it is pure meat and easy to chew and digest.',
      'Not just a treat. It can also be mixed into their food.',
      'Good for small cats and dogs.',
    ],
    tags: ['Small', 'Pure meat'],
    expiry: 'Check the batch label',
  },
  {
    id: 'meaty-treats',
    name: 'Meaty Treats',
    audience: ['big'],
    facts: [
      'Good for big dogs and cats, and for small dogs too.',
      'Easier to shred into smaller pieces.',
      'A fun mix of meat with some carbs.',
    ],
    tags: ['Big', 'With carbs'],
    expiry: 'April 2027',
  },
  {
    id: 'tasty-treats',
    name: 'Tasty Treats (jerky)',
    audience: ['big'],
    facts: [
      'Jerky has no additives and no preservatives.',
      'Premium because it is pure meat.',
      'Best for a high protein diet.',
    ],
    tags: ['Big', 'Premium'],
  },
  {
    id: 'cat-grass',
    name: 'Cat Grass',
    audience: ['cats'],
    facts: ['Made from barley.', 'Good for hairball digestion.'],
    tags: ['Cats'],
  },
  {
    id: 'cat-favorites',
    name: 'Cat favorites',
    audience: ['cats'],
    facts: [
      'Cats like stronger smells, so beef, salmon and capelin (similar to galunggong) are their favorites.',
    ],
    tags: ['Cats', 'Beef', 'Salmon', 'Capelin'],
  },
  {
    id: 'yoghurt-cubes',
    name: 'Yoghurt Cubes',
    audience: ['small', 'big', 'cats'],
    facts: ['The probiotic option.'],
    tags: ['Probiotic'],
  },
  {
    id: 'lamb-liver',
    name: 'Lamb Liver Cubes',
    audience: ['small', 'big', 'cats'],
    facts: ['The hypoallergenic option.'],
    tags: ['Hypoallergenic'],
  },
];

export const AUDIENCE_FILTERS: { key: 'all' | PlaybookAudience; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'small', label: 'Small' },
  { key: 'big', label: 'Big' },
  { key: 'cats', label: 'Cats' },
];

/** Product notes visible for a filter. `all` returns everything. */
export function notesForFilter(filter: 'all' | PlaybookAudience): ProductNote[] {
  return filter === 'all' ? PRODUCT_NOTES : PRODUCT_NOTES.filter((n) => n.audience.includes(filter));
}
