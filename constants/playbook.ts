// Sales playbook content: the booth conversation flow and product facts.
// Static on purpose (works offline at the booth, no sync). Taglish, as the
// sellers actually talk. No em/en dashes in any string (brand copy rule);
// playbook.test.ts enforces it.

export type FlowBlock =
  | { kind: 'actions'; items: string[] }
  /** A line to say out loud to the customer. */
  | { kind: 'say'; text: string }
  | { kind: 'heading'; text: string };

export interface FlowBranch {
  label: string;
  blocks: FlowBlock[];
  /** Shows a shortcut button into the POS. */
  shortcut?: 'free-taste';
}

export interface FlowStep {
  id: string;
  title: string;
  blocks?: FlowBlock[];
  /** Mutually exclusive paths; the seller picks the one that applies. */
  branches?: FlowBranch[];
}

export interface ProductNote {
  id: string;
  name: string;
  facts: string[];
  tags: string[];
  expiry?: string;
  /** Caution shown under the name, e.g. how far to trust the expiry. */
  hint?: string;
  say?: string;
}

export interface QuickGuideRow {
  customer: string;
  recommend: string;
}

/** When the product notes were last checked against real batches. */
export const PLAYBOOK_AS_OF = 'October 2026';

const actions = (...items: string[]): FlowBlock => ({ kind: 'actions', items });
const say = (text: string): FlowBlock => ({ kind: 'say', text });
const heading = (text: string): FlowBlock => ({ kind: 'heading', text });

export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'approach',
    title: 'Approach customers',
    blocks: [
      actions(
        'Nakatayo sa harap ng booth and actively approach customers.',
        'Greet customers and ask if may pet sila.',
      ),
    ],
  },
  {
    id: 'pet-check',
    title: 'Pet check',
    branches: [
      {
        label: 'May dalang pet',
        shortcut: 'free-taste',
        blocks: [
          say('Pwede po ba namin bigyan ng free taste yung pet niyo?'),
          heading('If pwede'),
          actions('Bigyan ng free taste yung pet.', 'If kinain/enjoy ng pet, ask:'),
          say('Pwede po ba namin videohan habang kumakain?'),
          actions('If yes, take a short video of the pet enjoying the treats.'),
        ],
      },
      {
        label: 'Walang dalang pet',
        blocks: [
          say('May pet po kayo?'),
          heading('If yes, ask'),
          say('Anong pet po? Anong pangalan?'),
        ],
      },
    ],
  },
  {
    id: 'recommend',
    title: 'Recommend',
    branches: [
      {
        label: 'Small dog or cat',
        blocks: [
          actions('Recommend the Freeze-Dried line.'),
          say('Ito pala yung best seller namin, freeze-dried. Pure meat siya and good for small cats and dogs.'),
          heading('If cat'),
          say('For cats po, pwede lagyan ng konting water para ma-rehydrate yung meat. Mas okay din po kasi sa cats na may additional moisture since hindi sila masyadong mahilig uminom ng water.'),
        ],
      },
      {
        label: 'Puppy or kitten',
        blocks: [
          actions('Recommend Freeze-Dried because:'),
          actions(
            'Pure meat',
            'Easy to chew and digest',
            'Good for cats and dogs 8 weeks and above',
            'Hindi lang siya treats, pwede rin siyang ihalo sa regular food',
          ),
        ],
      },
      {
        label: 'Big dog',
        blocks: [
          actions(
            'Recommend Meaty Treats as the best seller.',
            'Recommend Tasty Treats as the premium option.',
          ),
          heading('Meaty Treats'),
          actions(
            'Mas “fun” yung product',
            'May carbs na mixed with meat',
            'Good for both big and small dogs',
            'Mas madaling himay-himayin into smaller pieces',
          ),
          heading('Tasty Treats / Jerky'),
          actions(
            'Pure meat',
            'No additives and preservatives',
            'Premium option',
            'Better if gusto nila ng high-protein diet for their dog',
          ),
          say('If gusto niyo po ng mas high-protein option, I recommend yung Tasty Treats kasi pure meat siya.'),
        ],
      },
    ],
  },
  {
    id: 'price',
    title: 'Price',
    blocks: [
      actions('Sabihin muna yung individual price ng product.', 'Then mention the bundle:'),
      say('May event special po kami na super sulit!'),
      actions('Sabihin both the individual and bundle price para makita nila yung savings.'),
    ],
  },
  {
    id: 'payment',
    title: 'While customer is paying',
    blocks: [
      actions('I-log agad sa POS yung mga kukunin nilang products.', 'Note kung Dog, Cat, or Both.'),
      heading('Promote Instagram'),
      say('Ay Ma’am/Sir, baka meron din po kayong Instagram. You can scan the QR, follow us, and tag us para ma-post din namin.'),
    ],
  },
  {
    id: 'spin',
    title: 'After payment: spin the wheel',
    blocks: [
      say('Pwede rin po kayo mag-spin ng wheel para makakuha ng additional prizes!'),
      actions('Tell them to scan the QR code to participate.'),
    ],
  },
  {
    id: 'website',
    title: 'Before they leave: website',
    blocks: [
      say('If nagustuhan po ng pet niyo yung treats, pwede rin po kayo bumili sa website. Mas mura po doon compared sa Shopee and Lazada kasi may additional fees pa from the marketplaces.'),
    ],
  },
];

export const QUICK_GUIDE: QuickGuideRow[] = [
  { customer: 'Small dog', recommend: 'Freeze-Dried' },
  { customer: 'Cat', recommend: 'Freeze-Dried' },
  { customer: 'Puppy / Kitten 8 weeks+', recommend: 'Freeze-Dried' },
  { customer: 'Big dog', recommend: 'Meaty Treats' },
  { customer: 'High-protein option', recommend: 'Tasty Treats / Jerky' },
  { customer: 'Premium treat', recommend: 'Tasty Treats / Jerky' },
  { customer: 'Hypoallergenic', recommend: 'Lamb Liver' },
  { customer: 'Probiotic', recommend: 'Yogurt Cubes' },
  { customer: 'Hairball digestion', recommend: 'Cat Grass' },
  { customer: 'Cat’s favorite flavors', recommend: 'Beef, Salmon, Capelin' },
];

export const PRODUCT_NOTES: ProductNote[] = [
  {
    id: 'freeze-dried',
    name: 'Freeze-Dried line',
    tags: ['Pure meat'],
    expiry: '30 days from now',
    hint: 'Check the actual product/package before giving customers the exact expiration date.',
    facts: [
      'No sodium',
      'No preservatives',
      'Human-grade',
      'Good for cats and dogs 8 weeks and above',
      'Good for small cats and dogs',
      'Easy to chew and digest',
      'Pwede as treats',
      'Pwede rin ihalo sa regular food',
    ],
    say: 'If kitten or puppy po, we recommend yung freeze-dried kasi pure meat siya and easy to chew and digest.',
  },
  {
    id: 'cat-grass',
    name: 'Cat Grass',
    tags: [],
    facts: ['Made out of barley', 'Good for hairball digestion'],
  },
  {
    id: 'tasty-treats',
    name: 'Jerky / Tasty Treats',
    tags: ['Premium', 'Pure meat'],
    facts: [
      'No additives and preservatives',
      'Premium product',
      'Good for customers looking for a high-protein treat',
      'For cats: mas gusto nila yung mas mabango/malakas ang amoy',
      'Recommended flavors: Beef, Salmon, Capelin (similar sa galunggong)',
    ],
  },
  {
    id: 'meaty-treats',
    name: 'Meaty Treats',
    tags: ['With carbs'],
    expiry: 'April 2027',
    facts: [
      'Good for both big and small dogs',
      'Mas madaling himay-himayin',
      'May carbs mixed with meat',
      'More of a “fun” treat compared to the pure-meat options',
    ],
  },
  { id: 'yogurt-cubes', name: 'Yogurt Cubes', tags: ['Probiotic'], facts: [] },
  { id: 'lamb-liver', name: 'Lamb Liver', tags: ['Hypoallergenic'], facts: [] },
];
