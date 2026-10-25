# Mistral landing page: type scale

Measured on 2026-10-25 from https://mistral.ai/ (the site changes, so treat these as a snapshot).

## Method

Headless Chrome (Chromium 1228 through `playwright-core`) loaded the page at five viewport widths: 375, 768, 1024, 1440 and 1920 px, each 900 px tall. At each width the page was scrolled top to bottom so lazy sections rendered, then every visible text node was read for its computed `font-size`, `line-height`, `font-weight`, `letter-spacing`, `font-family` and colour. Roughly 110 distinct text items per width, grouped by role below. Sizes are computed pixels.

Not measured: the customer quote text in the "See Sovereign AI at work" block (it was not in the DOM at load time, only the attribution under it), hover states, and anything below the page's first load.

## Fonts and colour

- **ALTMistral** (their own face) for display text, headings, card titles, navigation and buttons. Weight 500 throughout.
- **Inter** for running copy and attributions. Weight 400, with 500 for short labels.
- **Space Mono** for one item only: the "Menu" label on phone.
- Three text tiers: near-black primary (`oklch(0.21 …)`), a mid grey secondary (`oklch(0.552 …)`, used for inactive or supporting lines) and white on dark or image panels.

## Scale by role

Format: size / line-height. Weight is 500 for ALTMistral rows and 400 for Inter rows unless noted.

| Role (example text) | 375 | 768 | 1024 | 1440 | 1920 | Tracking |
|---|---|---|---|---|---|---|
| Hero display ("Mistral is #1 in Sovereign AI.") | 40 / 48 | 40 / 48 | 96 / 96 | 96 / 96 | 96 / 96 | -2% |
| Statement ("No one else should hold the…") | 28 / 40 | 28 / 40 | 56 / 60 | 56 / 60 | 56 / 60 | -1% |
| Section heading, H2 ("See Sovereign AI at work.") | 24 / 28 | 24 / 28 | 44 / 52 | 44 / 52 | 44 / 52 | -1% |
| Product tile title ("Research", "Cloud") | 20 / 24 | 20 / 24 | 32 / 40 | 32 / 40 | 32 / 40 | none |
| Card statement ("Process knowledge") | 24 / 32 | 24 / 32 | 24 / 32 | 24 / 32 | 24 / 32 | none |
| Quote attribution ("CEO, TotalEnergies"), Inter | 16 / 24 | 16 / 24 | 20 / 28 | 20 / 28 | 20 / 28 | -2% |
| Navigation and small headings ("Why Sovereign AI") | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | none |
| Link text ("Discover Research") | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | +1% |
| Body copy ("Start with Mistral's frontier…"), Inter | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | none or -1% |
| Card subtitle ("Frontier open models"), Inter 500 | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | 16 / 24 | -1% |
| Buttons ("Get in touch", "Login") | 13 / 20 (nav) or 16 / 24 | same | 14 / 20 | 14 / 20 | 14 / 20 | +2% |
| Footer / caption ("Mistral AI © 2026"), Inter | 13 / 20 | 13 / 20 | 13 / 20 | 13 / 20 | 13 / 20 | none |

## What the numbers say

1. **One breakpoint, not fluid scaling.** Nothing changes between 1024 and 1920, and nothing between 375 and 768. Every size change happens once, somewhere between 768 and 1024 (most likely a 1024 breakpoint). There is no `clamp()`-style gradual growth.
2. **Only the display levels change.** Hero, statement, H2 and tile titles grow from phone to desktop. Body, navigation, links and captions are fixed at 16 or 13.
3. **The big levels grow a lot.** Hero 40 to 96 (2.4x), statement 28 to 56 (2x), H2 24 to 44 (1.8x), tile title 20 to 32 (1.6x). Body copy stays at 16, so on desktop the hero is six times the body size.
4. **Few distinct sizes.** Desktop uses nine: 96, 56, 44, 32, 24, 20, 16, 14, 13. Phone uses six: 40, 28, 24, 20, 16, 13. Headings and body are far apart (the smallest heading is 24 against 16 body, apart from the 20 px attribution), which is why they never look alike.
5. **Tight leading on big text, normal on small.** Line-height is 1.0 at 96, about 1.07 at 56, 1.18 at 44, 1.25 at 32, 1.33 at 24 and 1.5 at 16.
6. **Negative tracking that scales with size.** About -2% at 96, -1% from 56 down to 24, and a faint -1% on some 16 px Inter. Small UI text such as buttons and links gets slight positive tracking (+1 to +2%).
7. **Weight does not carry hierarchy.** Headings and tiles are all 500 and body is 400. The hierarchy comes from size, tracking, line-height and the primary vs grey colour tier.

## Geneie landing page today, for comparison

| Role | Geneie (phone to desktop) | Mistral equivalent |
|---|---|---|
| Hero headline | 36 to 48, line-height 1.1, semibold, `tracking-tight` | 40 to 96 |
| Hero subtext | 16 to 18 | 16 (fixed) |
| Section H2 | 24, 30, then 36 at `lg` | 24 to 44 |
| Tour step title | 15, 17 at `lg`, semibold | 24 to 32 (card level) |
| Tour step description | 13, regular, muted | 16 |
| FAQ question | 15 | 16 to 24 |
| Form label, nav links, hints | 13 | 13 to 16 |

Observations only, nothing has been changed:

- Geneie's hero is 48 px against 16 to 18 px subtext (about 2.7x). Mistral's hero-to-body ratio on desktop is 6x. This is the main reason Geneie's hierarchy can feel flat.
- Geneie's H2 tops out at 36 px, only about twice the body size. Mistral's is 44 px, 2.75x body.
- Geneie's tour description at 13 px is the smallest running text on the page, below Mistral's 16 px body floor. Mistral keeps body copy at 16 everywhere and uses 13 only for the footer.
- Mistral has one size jump (about 1024 px) and fixed small text. Geneie has three steps on H2 (`sm`, `lg`).
