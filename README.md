# Codeable Project Calculator

A small single-page calculator for estimating [Codeable](https://www.codeable.io/)
projects from three angles at once:

1. **Base project estimate** — the figure you enter on Codeable
2. **Billed to client** — what the client actually pays
3. **What I get paid** — your payout after Codeable's fee

Type into any field and the others update automatically. No build step, no
dependencies — just open `index.html`.

## Why

Codeable adds a client service fee on top of your estimate and subtracts a
developer fee from your payout, so the number you enter is never the number you
receive or the number the client sees. This tool lets you work backwards from
whichever figure you actually care about — "I want to take home $2,700, what do
I enter?" — and sanity-checks an estimate against your hours and rate.

## Features

- **Three-way pricing.** Edit base, billed, or payout and the other two follow.
- **Hours, padding, and rate.** Estimate the base from your time:
  `base = padded hours × rate`. Padding inflates your raw hours by a percentage
  (e.g. 30 hrs + 30% = 39 effective hrs) to build in a buffer.
- **Reverse calculations.** Enter a base and your hours to derive the implied
  rate, or a base and rate to derive the hours.
- **Live fee breakdown.** Shows the client service fee and developer fee, both
  as a percentage and a dollar amount.
- **Copy summary.** One click copies a plain-text estimate to the clipboard.
- **Reset.** Clears everything.
- **Sensible formatting.** Money displays as USD (`$3,525`) but you type plain
  numbers — formatting happens on blur, never mid-keystroke.
- **Lightweight.** Plain HTML/CSS/JS, zero dependencies, light and dark mode.

## The math

The fee rates live as constants at the top of [`script.js`](script.js):

```js
const CLIENT_SERVICE_FEE_RATE = 0.175; // 17.5% added on top for the client
const DEVELOPER_FEE_RATE      = 0.10;  // 10% taken from the developer payout

const CLIENT_BILLED_MULTIPLIER  = 1 + CLIENT_SERVICE_FEE_RATE; // 1.175
const DEVELOPER_PAID_MULTIPLIER = 1 - DEVELOPER_FEE_RATE;      // 0.9
```

Everything is derived from the **base estimate** as the single source of truth:

```
billed  = base × 1.175
payout  = base × 0.9
base    = billed ÷ 1.175
base    = payout ÷ 0.9
base    = hours × (1 + padding%) × rate
```

Worked example — a $3,000 estimate:

| Field             | Value    |
| ----------------- | -------- |
| Base estimate     | `$3,000` |
| Billed to client  | `$3,525` |
| What I get paid    | `$2,700` |
| Client fee amount | `$525`   |
| Developer fee amount | `$300` |

The same project at 30 hours and a $100/hr rate gives the same `$3,000` base.
Add 30% padding and the base becomes `$3,900` (39 effective hours × $100).

## Running it

It's a static page. Either:

- Open `index.html` directly in a browser, or
- Serve the folder, e.g.:

  ```sh
  python3 -m http.server 4173
  ```

  then visit <http://localhost:4173>.

## Project structure

```
index.html    Markup and field layout
styles.css    Styling, light/dark mode, responsive layout
script.js     Calculation logic, formatting, and interaction wiring
```

## Notes and assumptions

- The fee rates reflect Codeable's currently visible calculator (17.5% client
  service fee added, 10% developer fee subtracted). If those change, edit the
  two constants in `script.js` and everything else — including the breakdown
  labels — updates with them.
- Displayed money is rounded to the nearest dollar; internal calculations keep
  full precision to avoid compounding rounding errors.
- When the base changes from a price field and both hours and rate are set, the
  calculator holds whichever of the two you edited most recently and flexes the
  other. Padding is always held fixed.
