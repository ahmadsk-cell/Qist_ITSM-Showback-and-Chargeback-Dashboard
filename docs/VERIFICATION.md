# Qist Release Verification

This checklist records the expected behavior for a release-ready Qist build. Run it after changing parsing, calculations, settings, persistence, or exports.

## Baseline Fixtures

### Canonical CSV

Load `sample-data/tickets.csv`.

- Import Readiness reports `18 accepted`, `0 excluded`, `0 unmapped departments`, and `0 duplicate IDs`.
- Total modeled allocation is `$52,082.21` with the starter settings.
- Billed hours are `55.6`.
- Net average ticket cost is `$902` when rounded for the dashboard.
- Ticket `INC-10041` is `$1,317.74` in hourly mode.
- Ticket `INC-10067` is `$85.80` in hourly mode and `$95.00` in flat-fee mode.

### Canonical JSON

Load `sample-data/tickets.json`.

- Import Readiness reports `3 accepted` with no warnings.
- Saving the import creates one IndexedDB history record.
- Reloading the page restores the saved rows and mapping.
- Deleting the history record removes persistence without deleting the currently loaded in-memory rows.

## Parser Edge Cases

Verify an alias-based file with columns such as `Incident Number`, `Opened`, `Business Unit`, `Urgency`, `Duration Minutes`, `SLA`, `Assignment Group`, and `On Call`.

- Common aliases map automatically.
- Decimal hours, `HH:MM`, `1h 30m`, explicit minute values, and numeric minute/second columns normalize to decimal hours.
- `Regular day`, `No`, `False`, and `0` do not trigger after-hours charges.
- `On Call`, `After Hours`, `Yes`, `True`, and `1` do trigger after-hours rules.
- Blank SLA values remain `Unknown` and do not receive a breach credit.
- Missing required values, invalid dates, invalid hours, and negative hours are excluded and reported with source row numbers.
- Unknown departments remain visible but receive no configured asset or overhead allocation.
- Duplicate ticket IDs remain separate and are flagged.
- Blank or duplicate CSV headers and unclosed quoted fields fail with a readable upload error.
- JSON rows that are not objects fail with a readable row-level error.

## Calculation Checks

- Hourly labor is billed hours multiplied by the tier rate.
- After-hours minimums affect billed hours only in hourly mode.
- Priority multipliers apply before the after-hours flat fee is added.
- Sensitivity surcharge applies to support cost.
- SLA breach credit applies to support cost and is represented as a negative amount.
- Gross trend cost equals support cost plus sensitivity surcharge.
- Net trend cost equals gross trend cost plus SLA impact.
- Shared overhead totals exactly the configured pool across configured departments with positive total headcount.
- Asset density uses workstation/cart subscription cost divided by workstation/cart units; SaaS seats and e-waste are excluded.

## Settings And Modes

- Hourly/flat mode, rates, department structure, asset counts, overhead, and compliance settings recalculate the dashboard after change.
- Percentage inputs are constrained to `0-100`; monetary and quantity values cannot calculate below zero.
- New departments receive unique placeholder names and cost centers.
- Blank or duplicate department names are rejected.
- Settings, appearance fields, organization logo, and theme survive reload through browser storage.
- Showback and Chargeback are visibly selectable in the top header.
- Switching mode changes labels and export language, not totals.

## Analytics And Navigation

- Weekly and monthly trend controls use actual dated ticket costs.
- The trend compares Gross Support with Net Recovered and shows Ticket Volume.
- Global search scopes dashboard departments, trend points, and ticket activity.
- Ticket filters combine department, priority, sensitivity, and text search.
- Department-card action buttons open the corresponding department ledger.
- The Qist logo returns to Dashboard.

## Export Checks

- Export actions are disabled when no valid ticket rows are available.
- Department CSV contains line-item and total rows for each department.
- Ticket CSV contains normalized row-level calculation fields.
- User-controlled CSV text that begins like a spreadsheet formula is prefixed safely; numeric negative credits remain numeric.
- Executive PDF opens a print-ready report with Qist branding, organization branding, mode, metrics, department rollup, highest-cost tickets, and calculation notes.

## Browser Smoke Check

- No runtime console errors appear after load, import, navigation, settings changes, mode changes, search, or reload.
- No `NaN` or `undefined` values appear in rendered output.
- Light and dark themes retain readable contrast and the header controls do not overlap at supported responsive breakpoints.
