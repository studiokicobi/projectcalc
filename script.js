/* ============================================================================
   Codeable Project Calculator
   ----------------------------------------------------------------------------
   Five editable fields, one source of truth (the base estimate).

     base   ── the estimate you enter on Codeable (the central number)
     billed ── what the client pays   = base × 1.175
     paid   ── what you receive       = base × 0.9
     hours  ── estimated hours        \  base = hours × rate
     rate   ── hourly rate            /

   Whenever the user edits ONE field we recompute everything else from it, so
   there are no circular updates: programmatic `.value` assignments do not fire
   `input` events, and we always derive from a single `source`.
   ========================================================================== */

'use strict';

/* ── Fee configuration (single source of truth for the rates) ───────────── */
const CLIENT_SERVICE_FEE_RATE = 0.175; // 17.5% added on top for the client
const DEVELOPER_FEE_RATE      = 0.10;  // 10% taken from the developer payout

// Derived multipliers used throughout the app.
const CLIENT_BILLED_MULTIPLIER = 1 + CLIENT_SERVICE_FEE_RATE; // 1.175
const DEVELOPER_PAID_MULTIPLIER = 1 - DEVELOPER_FEE_RATE;     // 0.9

/* ── State: the only values we persist. Everything else is derived. ─────── */
const state = {
  base: null,    // number | null
  hours: null,   // number | null  — raw time estimate
  padding: null, // number | null  — percent buffer added on top of hours
  rate: null,    // number | null
};

// When the base changes via a price field and BOTH hours & rate are present,
// we keep whichever hours/rate field the user most recently typed and let the
// other one flex. `null` means neither has been anchored yet.
let hrAnchor = null; // 'hours' | 'rate' | null

/* ── Element lookups ────────────────────────────────────────────────────── */
const inputs = {
  base:    document.querySelector('[data-field="base"]'),
  billed:  document.querySelector('[data-field="billed"]'),
  paid:    document.querySelector('[data-field="paid"]'),
  hours:   document.querySelector('[data-field="hours"]'),
  padding: document.querySelector('[data-field="padding"]'),
  rate:    document.querySelector('[data-field="rate"]'),
};

const paddingHelp = document.getElementById('padding-help');

const outputs = {
  clientFeeAmount: document.querySelector('[data-out="clientFeeAmount"]'),
  devFeeAmount:    document.querySelector('[data-out="devFeeAmount"]'),
  clientFeeRate:   document.querySelector('[data-out="clientFeeRate"]'),
  devFeeRate:      document.querySelector('[data-out="devFeeRate"]'),
};

const copyBtn  = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');
const toast    = document.getElementById('toast');

/* ── Parsing & formatting helpers ───────────────────────────────────────── */

/** Turn raw user text ("$3,000", "3000", "") into a number or null. */
function parseNumber(raw) {
  if (raw == null) return null;
  // Strip anything that isn't a digit or a decimal point (so "$", commas,
  // "/hr", "hours" all disappear). Negative money makes no sense here.
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Money for display: rounded to the nearest dollar, grouped, no symbol. */
function formatMoney(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** Hours / rate for display: up to 2 decimals, grouped, trailing zeros trimmed. */
function formatNumber(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/* ── Core calculation ───────────────────────────────────────────────────── */

// Padding multiplier: 30% padding → 1.3. Empty padding behaves as 0% (×1).
// So "padded hours" = hours × paddingFactor(), and base = padded hours × rate.
function paddingFactor() {
  return 1 + (state.padding == null ? 0 : state.padding) / 100;
}

/**
 * If both hours and rate are known, drive the base from them (with padding):
 *   base = hours × paddingFactor × rate
 * Returns true if the base was computed, false if there wasn't enough info.
 */
function applyHoursRateToBase() {
  if (state.hours != null && state.rate != null) {
    state.base = state.hours * paddingFactor() * state.rate;
    return true;
  }
  return false;
}

/**
 * Recompute `state` from the field the user just edited.
 * @param {'base'|'billed'|'paid'|'hours'|'padding'|'rate'} source
 * @param {string} raw  the field's current text
 */
function recompute(source, raw) {
  const value = parseNumber(raw);

  if (source === 'base' || source === 'billed' || source === 'paid') {
    // --- A price field changed → resolve the base estimate first. ---
    if (value == null) {
      state.base = null;
    } else if (source === 'base') {
      state.base = value;
    } else if (source === 'billed') {
      state.base = value / CLIENT_BILLED_MULTIPLIER;
    } else { // 'paid'
      state.base = value / DEVELOPER_PAID_MULTIPLIER;
    }

    // Reconcile hours/rate so that base = padded hours × rate keeps holding.
    reconcileHoursRate();

  } else if (source === 'padding') {
    // --- Padding changed → it inflates hours, so the figures move. ---
    state.padding = value;
    applyHoursRateToBase(); // base = hours × paddingFactor × rate (if both known)

  } else {
    // --- Hours or rate changed. ---
    state[source] = value;
    hrAnchor = source; // the hours/rate field the user just committed to

    if (!applyHoursRateToBase() && value != null && state.base != null) {
      // Only one of hours/rate is set, but we already have a base → fill the
      // other in, accounting for padding.
      const pf = paddingFactor();
      if (source === 'hours' && value !== 0 && pf !== 0) {
        state.rate = state.base / (value * pf);
      } else if (source === 'rate' && value !== 0 && pf !== 0) {
        state.hours = state.base / (value * pf);
      }
    }
    // If the user cleared the field, leave base as-is (it may still be driven
    // by the price fields); the blank simply stays blank.
  }
}

/**
 * Keep base = padded hours × rate consistent after the base changed from a
 * price field. We hold the most-recently-typed hours/rate field and flex the
 * other; padding is always held fixed.
 */
function reconcileHoursRate() {
  if (state.base == null) return; // nothing to derive from

  const pf = paddingFactor();
  if (pf === 0) return; // padding of -100% → can't divide; leave hours/rate

  const haveHours = state.hours != null;
  const haveRate  = state.rate != null;

  if (haveHours && haveRate) {
    if (hrAnchor === 'rate' && state.rate !== 0) {
      state.hours = state.base / (state.rate * pf);   // keep rate, flex hours
    } else if (state.hours !== 0) {
      state.rate = state.base / (state.hours * pf);    // default: keep hours, flex rate
    }
  } else if (haveHours && state.hours !== 0) {
    state.rate = state.base / (state.hours * pf);
  } else if (haveRate && state.rate !== 0) {
    state.hours = state.base / (state.rate * pf);
  }
  // If neither hours nor rate is set, there's nothing to reconcile.
}

/** Snapshot of every displayed value, derived from `state`. */
function derive() {
  const { base, hours, padding, rate } = state;
  const billed = base == null ? null : base * CLIENT_BILLED_MULTIPLIER;
  const paid   = base == null ? null : base * DEVELOPER_PAID_MULTIPLIER;
  const effectiveHours = hours == null ? null : hours * paddingFactor();
  return {
    base, hours, padding, rate, billed, paid, effectiveHours,
    clientFeeAmount: base == null ? null : billed - base,
    devFeeAmount:    base == null ? null : base - paid,
  };
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/**
 * Write derived values into every field, EXCEPT the one the user is actively
 * editing (`skip`) so we never fight their keystrokes.
 */
function render(skip) {
  const v = derive();

  setField('base',    v.base,    'money', skip);
  setField('billed',  v.billed,  'money', skip);
  setField('paid',    v.paid,    'money', skip);
  setField('hours',   v.hours,   'number', skip);
  setField('padding', v.padding, 'number', skip);
  setField('rate',    v.rate,    'number', skip);

  outputs.clientFeeAmount.textContent =
    v.clientFeeAmount == null ? '—' : '$' + formatMoney(v.clientFeeAmount);
  outputs.devFeeAmount.textContent =
    v.devFeeAmount == null ? '—' : '$' + formatMoney(v.devFeeAmount);

  updatePaddingHelp(v);
}

/** Spell out the padding math live, e.g. "30 hrs + 30% = 39 effective hrs". */
function updatePaddingHelp(v) {
  if (v.padding != null && v.padding !== 0 && v.hours != null) {
    paddingHelp.textContent =
      `${formatNumber(v.hours)} hrs + ${formatNumber(v.padding)}% = ` +
      `${formatNumber(v.effectiveHours)} effective hrs.`;
  } else {
    paddingHelp.textContent = 'Buffer added on top of your hours.';
  }
}

function setField(field, value, kind, skip) {
  if (field === skip) return; // leave the field being typed in untouched
  const el = inputs[field];
  if (value == null) { el.value = ''; return; }
  el.value = kind === 'money' ? formatMoney(value) : formatNumber(value);
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */

Object.entries(inputs).forEach(([field, el]) => {
  // Recalculate live, but don't reformat the field being typed in.
  el.addEventListener('input', () => {
    recompute(field, el.value);
    render(field);
  });

  // On focus, strip grouping so the value is easy to edit ("3,000" → "3000").
  el.addEventListener('focus', () => {
    el.value = el.value.replace(/,/g, '');
    el.select();
  });

  // On blur, reformat everything (this field included) from state.
  el.addEventListener('blur', () => render(null));
});

/* ── Copy summary ───────────────────────────────────────────────────────── */

function buildSummary() {
  const v = derive();
  const money = (n) => (n == null ? '—' : '$' + formatMoney(n));
  const hoursText = (n) =>
    n == null ? '—' : `${formatNumber(n)} ${n === 1 ? 'hour' : 'hours'}`;
  const rateText = v.rate == null ? '—' : `$${formatNumber(v.rate)}/hr`;

  const lines = [
    `Base estimate: ${money(v.base)}`,
    `Billed to client: ${money(v.billed)}`,
    `Developer payout: ${money(v.paid)}`,
    `Estimated hours: ${hoursText(v.hours)}`,
  ];
  if (v.padding != null) {
    lines.push(`Padding: ${formatNumber(v.padding)}%`);
    if (v.padding !== 0 && v.hours != null) {
      lines.push(`Effective hours: ${hoursText(v.effectiveHours)}`);
    }
  }
  lines.push(`Hourly rate: ${rateText}`);
  return lines.join('\n');
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  // Force a reflow so the transition runs even on rapid re-clicks.
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 220);
  }, 1600);
}

async function copySummary() {
  const text = buildSummary();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure contexts (e.g. opened via file://).
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed — select and copy manually');
  }
}

copyBtn.addEventListener('click', copySummary);

/* ── Reset ──────────────────────────────────────────────────────────────── */

resetBtn.addEventListener('click', () => {
  state.base = null;
  state.hours = null;
  state.padding = null;
  state.rate = null;
  hrAnchor = null;
  render(null);
  inputs.base.focus();
});

/* ── Init ───────────────────────────────────────────────────────────────── */

// Reflect the configured fee rates in the breakdown labels so they stay in
// sync if the constants ever change.
outputs.clientFeeRate.textContent =
  (CLIENT_SERVICE_FEE_RATE * 100).toFixed(1).replace(/\.0$/, '') + '%';
outputs.devFeeRate.textContent =
  (DEVELOPER_FEE_RATE * 100).toFixed(1).replace(/\.0$/, '') + '%';

render(null);
