# Qist Product Write-Up

## Overview

Qist is an IT chargeback and showback management dashboard for ITSM teams that need to explain where operational IT spend is coming from. It turns monthly ticket exports into a transparent model for department billing, SLA impact, shared infrastructure allocation, asset density, and executive reporting.

The application is designed for service desk managers, ITSM analysts, IT finance teams, CIOs, and department leaders who need a practical bridge between raw operational support work and finance-ready reporting.

## Why The Name Qist

The name Qist was selected because it evokes fairness, proportionality, and a measured share. That fits the product: IT chargeback should not feel like a black box or a surprise invoice. Qist makes the allocation model visible so each department can understand its consumption, the rules behind the total, and whether the report is informational showback or actual chargeback.

In short: Qist is about fair visibility before financial transfer.

## Problem Statement

Many IT organizations can export tickets from tools like ServiceNow, Jira Service Management, Freshservice, Cherwell, or Zendesk, but those exports rarely answer executive finance questions directly:

- Which departments consume the most IT support?
- Which tickets created the most billable impact?
- How much cost is driven by clinical systems, security events, or PHI-sensitive work?
- How should shared infrastructure overhead be allocated?
- Which SLA breaches should reduce or change the modeled cost?
- What should department leaders receive as a clear showback or invoice-ready chargeback report?

Qist solves this by combining configurable ITSM rates, departmental structure, and ticket-level parsing into one browser-based dashboard.

## Core Workflow

The Management navigation includes a **Getting Started** page that explains this process in plain language, defines the billing terms used throughout Qist, and provides a dedicated **Monthly History** subtab for the recurring upload routine.

1. **Configure the model**

   Add departments, headcount, cost centers, skill rates, flat fees, priority multipliers, SLA behavior, after-hours rules, asset subscription rates, and compliance fees.

2. **Load operational data**

   Upload a CSV or JSON ticket export. Qist normalizes common fields such as ticket ID, dates, department, priority, sensitivity, assets, device types, hours, SLA status, tier, project code, and after-hours flag. The Import Readiness check identifies missing required mappings, invalid rows, duplicate IDs, and departments that do not yet have configured allocation data.

3. **Confirm and save the reporting period**

   Confirm the inferred `YYYY-MM` Reporting Period, give the dataset a useful name, and use Monthly History to save it in the browser. A duplicate month is replaced only after confirmation. Saved periods can be loaded later, auto-restore as the active dataset on future visits, and can be deleted from the same panel. This keeps persistence intentional rather than silently retaining sensitive operational logs.

4. **Review analytics**

   The dashboard calculates total modeled spend, billed hours, average net ticket cost, top departments, SLA exposure, department mix, and recent ticket activity. Weekly analytics use only the active period. Monthly analytics compare every saved period, plus a confirmed active upload, and show actual gross support cost against net recovered cost after SLA credits.

5. **Inspect detail**

   Use the ticket inspector for row-level billing validation and the department invoice view for cost center and ledger-style reporting.

6. **Export**

   Export a branded executive PDF report or CSV files for departmental ledgers and ticket-level reconciliation.

## Calculation Logic

At a department level, Qist models spend using:

```text
Total departmental spend =
  asset base rate
  + ticket support cost
  + pro-rata shared overhead
  + sensitivity/compliance surcharges
  + after-hours charges
  + SLA breach credits
```

Ticket support cost can be calculated in either of two ways:

```text
Hourly mode = hours x skill rate x priority multiplier
Flat fee mode = configured resolution tier fee
```

Additional rules are then applied:

- **SLA status** applies the configured breach credit and exposes breach risk in departmental reporting.
- **After-hours support** can add mobilization surcharges and minimum billable hours.
- **PHI or security-sensitive work** can add compliance surcharges.
- **Assets and subscriptions** add workstation, clinical cart, mobile/telemetry, and SaaS seat costs.
- **Shared overhead** is distributed by headcount so infrastructure costs are visible and proportionate.

Finance-ready imports should contain one reporting period. Recurring asset/license subscriptions and shared overhead are allocated once to the active dataset. The active dataset powers all operational detail and exports; older saved rows appear only as recalculated points in Monthly analytics unless the user explicitly loads that period. Ticket trend charts use dated ticket charges only, so they remain useful without implying that recurring period-level allocations repeat every week.

## Branding And Reporting

The **Appearance** section lets the end user add organization details that are used in report exports:

- Organization name
- Division or business unit
- Report title
- Address
- Prepared-by name
- Contact email
- Phone
- Website
- Organization logo

The exported executive report includes both the Qist logo and the organization's logo/details. The report is opened as a print-ready browser document so users can save it as a PDF using the browser print dialog.

## Design Direction

Qist uses a dense, minimalist enterprise dashboard style inspired by premium SaaS operations tools. The interface prioritizes:

- Left-side persistent navigation
- High-density KPI and ledger views
- Crisp borders and restrained surfaces
- Light and dark mode support
- Dot-and-label status treatments instead of heavy capsules
- Monospace numerics for tickets, rates, and currency
- Scannable tables with fixed structure
- Quiet, report-friendly chart styling

The dark mode intentionally leans into gunmetal, slate, and dark gray rather than a blue/purple palette, while still preserving semantic colors for revenue, SLA risk, and warnings.

## Privacy And Deployment

Qist is a static, client-side application. There is no backend and no external data transmission by default. Ticket files are parsed in the browser, making it suitable for demos, internal modeling, and privacy-conscious operational analysis.

Settings and organization branding are saved in browser storage. Ticket imports are saved only when the user explicitly selects **Save Reporting Period**. Those saved periods use local IndexedDB, stay on the current device/browser, and can be loaded, replaced, or removed through Monthly History.

Because the app is a single static HTML application, it can be published directly through GitHub Pages, Netlify, Vercel, or any static file host.

## Future Enhancements

Potential next steps:

- Save and load named rate models.
- Add department approval workflow states.
- Add optional encrypted backup and restore for the device-local period archive.
- Add ServiceNow/Jira export presets.
- Add configurable GL account mapping.
- Add XLSX export for finance teams.
- Add richer PDF themes for different organization brands.

## Author

Built by [ASK Andalus](https://github.com/ahmadsk-cell/).
