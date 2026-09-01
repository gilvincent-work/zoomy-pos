# ZoomyPOS

Mobile POS for pet-treat bazaar sales. Expo / React Native + SQLite. Optimized for speed and ease of order processing (tile-based UI, category filtering).

The principles below apply to **all sessions** on this project.

# Developer Best Practices

- **YAGNI (You Aren't Gonna Need It)** — Build only what the current requirement needs. Don't add speculative abstractions, config options, or generality for hypothetical future cases.
- **DRY (Don't Repeat Yourself)** — Factor out genuine duplication into shared functions, components, or constants. But don't over-abstract: two similar-looking snippets that change for different reasons should stay separate.
- **KISS** — Prefer the simplest solution that works. Readability over cleverness.
- Match the surrounding code's conventions, naming, and idioms.

# Design & Architecture

- **SOLID** — Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion.
- **Separation of Concerns** — Keep distinct responsibilities in distinct modules (UI vs. business logic vs. data access).
- **Composition over inheritance** — Favor combining small pieces over deep class hierarchies.
- **Law of Demeter** — An object should only talk to its immediate collaborators, not reach through them.
- **Principle of Least Astonishment** — Code should behave the way a reader expects.
- **Loose coupling, high cohesion** — Minimize dependencies between modules; keep related things together.
- **Fail fast** — Surface errors early and loudly rather than silently continuing.

# Design Skills

- **When designing or building any frontend/UI, use the design skills.** Invoke them via the Skill tool for interface work (pages, components, layout, styling, motion, UX review):
  - **`emil-design-eng`** — Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.
  - **`impeccable`** — designing, redesigning, critiquing, and polishing interfaces: visual hierarchy, spacing, typography, color, motion, accessibility, and reusable design systems.
  - **`design-taste-frontend`** ("Taste") — anti-slop frontend design for landing pages, portfolios, and redesigns that don't look templated.

# Code Quality

- **Boy Scout Rule** — Leave code cleaner than you found it.
- **Single Level of Abstraction** — A function should operate at one level of detail.
- **Meaningful names** — Names should reveal intent; avoid abbreviations and magic numbers.
- **Small functions, small files** — Easier to test, reason about, and reuse.
- **Guard clauses / early returns** — Reduce nesting.
- **Avoid premature optimization** — Measure before optimizing (complements YAGNI).

# Testing

- **Test pyramid** — Many unit tests, fewer integration tests, fewest E2E tests.
- **AAA (Arrange-Act-Assert)** — Structure tests in these three clear phases.
- **TDD / test-first** — Write tests before implementation where it fits.
- **Tests as documentation** — Tests should clearly describe intended behavior.

# Content & Copy

- **No em/en-dashes in copy.** Do not use `—` or `–` in any user-facing text (page copy, headings, metadata, alt text, UI strings). They read as AI-generated. Rewrite with a period, comma, colon, parentheses, or the word "to" for ranges. This applies to prose only; a hyphen `-` in code, IDs, or class names is fine.

# Commit Conventions

- **Conventional Commits** — Format: `<type>(<optional scope>): <description>`. Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`. Use imperative mood ("add", not "added"). Keep the subject line ≤72 chars.
- **Atomic commits** — Each commit is one logical, self-contained change that builds and passes tests on its own. Split unrelated changes into separate commits; don't bundle a refactor with a feature.
- **Do NOT add Claude as a co-author or author** in commits. Omit any `Co-Authored-By: Claude` trailer and any Claude attribution.
- **Branch flow** — `feature branch → develop → staging → main`. Always ask before merging into `develop`, `staging`, or `main`.
