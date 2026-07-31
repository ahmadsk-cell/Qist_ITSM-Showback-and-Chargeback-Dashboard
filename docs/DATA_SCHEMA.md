# Qist Data Schema And Calculation Reference

This document is the operating contract between an ITSM export and Qist. Use one row per ticket or resolved work item. Qist processes data locally in the browser and does not upload the file to a server.

## Recommended Reporting Grain

Use one completed reporting period per import, normally one calendar month. Asset subscriptions, license subscriptions, shared overhead, and configured e-waste charges are period-level allocations and are added once to the active dataset. Weekly and monthly trend charts show ticket-level support costs; they do not repeat period-level allocations in each chart bucket.

If a source export spans several months, ticket trends remain valid, but the department total still represents one configured allocation period. Split multi-month exports before producing finance-ready chargeback files.

## Required Fields

| Qist field | Accepted content | Common source columns |
| --- | --- | --- |
| `ticketId` | Unique ticket, incident, request, or case identifier | Ticket ID, Incident Number, Case Number, Number |
| `createdDate` | A browser-readable date; ISO `YYYY-MM-DD` is recommended | Created, Opened, Submitted Date, Start Date |
| `department` | Configured department name or cost center | Department, Cost Center, Business Unit, Division |
| `hours` | Decimal hours, `HH:MM`, `1h 30m`, or a numeric minutes/seconds column | Hours, Time Spent, Work Hours, Duration Minutes |

Rows missing any required value, containing an invalid date, or containing invalid/negative hours are excluded from calculations. The Import Readiness panel reports exclusions before export.

## Optional Fields

| Qist field | Accepted content | Behavior when omitted |
| --- | --- | --- |
| `closedDate` | Closure or resolution date | Left blank |
| `priority` | Low, Medium, High, Critical; P1-P3 and Sev 1-Sev 3 are normalized | Low multiplier |
| `sensitivity` | General IT, Clinical, EMR/PACS, PHI, Security Incident, etc. | General IT |
| `assets` | Asset IDs separated by semicolons, commas, or pipes | No ticket asset references |
| `deviceTypes` | Device categories separated by semicolons, commas, or pipes | No ticket device references |
| `slaStatus` | Met, Breached, Passed, Failed, Missed, or similar | Unknown; no SLA credit |
| `tier` | Tier 0-3, resolver group, or named specialty | Tier 1 unless sensitivity implies clinical/security expertise |
| `projectCode` | Capital, project, or initiative code | Operational |
| `afterHours` | Yes/No, True/False, 1/0, After Hours, On Call, Off Hours | No surcharge |

Unknown departments are retained as `Unmapped`. Their tickets receive ticket-level charges, but they receive no configured asset subscriptions or headcount-based overhead until the department is added under Rate Settings.

Duplicate ticket IDs remain separate rows and are flagged for review. This avoids silently deleting legitimate split-work records while making accidental duplication visible.

## CSV And JSON Shapes

CSV files must have a nonblank, unique header row. Standard quoted fields, embedded commas, escaped quotes, CRLF, and LF line endings are supported.

JSON can be either a root array or an object containing a `tickets`, `records`, or `data` array. Every array item must be an object with named fields.

```json
{
  "tickets": [
    {
      "incident_number": "INC-24001",
      "opened": "2026-07-01",
      "business_unit": "CC-1100",
      "urgency": "P1",
      "time_spent": "01:30",
      "sla": "Met",
      "assignment_group": "Clinical Applications",
      "on_call": "Yes"
    }
  ]
}
```

Qist suggests mappings from common aliases. Always confirm the four required mappings in Log Upload before exporting.

## Ticket Calculation Order

In hourly mode:

```text
billed hours = max(actual hours, after-hours minimum when applicable)
labor base = billed hours x skill rate
support cost = labor base x priority multiplier + after-hours flat fee
sensitivity surcharge = support cost x configured sensitivity percentage
SLA credit = support cost x negative breach-credit percentage
net ticket cost = support cost + sensitivity surcharge + SLA credit
```

In flat-fee mode, the configured tier fee replaces `billed hours x skill rate`. Priority multipliers, after-hours flat fees, sensitivity surcharges, and SLA credits still apply. The after-hours minimum does not change a flat tier fee.

### Worked Example

Assume a 3.2-hour, Critical, after-hours clinical ticket with a `$172/hour` clinical rate, `2.0x` Critical multiplier, `$125` mobilization fee, `7.5%` sensitivity surcharge, and a met SLA:

```text
labor base = 3.2 x $172 = $550.40
support cost = $550.40 x 2.0 + $125 = $1,225.80
sensitivity surcharge = $1,225.80 x 7.5% = $91.94
SLA credit = $0.00
net ticket cost = $1,317.74
```

For a breached SLA with a `12%` credit, the credit is calculated from support cost before the sensitivity surcharge.

## Department Calculation

```text
department total =
  net ticket costs
  + workstation/cart subscriptions
  + SaaS seat subscriptions
  + configured e-waste charges
  + headcount-based shared overhead
```

Shared overhead is allocated across configured departments by each department's share of total configured headcount. Asset density is the workstation/cart subscription cost divided by configured workstation/cart units; SaaS seats and e-waste charges are intentionally excluded from that density metric.

## Showback And Chargeback

Showback and chargeback use the same calculations. Showback labels the result as informational cost awareness. Chargeback labels exports for ledger-transfer workflows. Switching modes does not alter rates or totals.

## Persistence And Privacy

Rate settings, appearance, and theme are stored in browser storage. Uploaded ticket rows stay in memory unless the user explicitly selects **Save Current Import**, which stores that dataset in browser IndexedDB. Saved imports remain on that browser/device and are removed when deleted in Import History or when browser site data is cleared.
