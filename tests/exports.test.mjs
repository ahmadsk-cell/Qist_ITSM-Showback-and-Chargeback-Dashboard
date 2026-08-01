// Guards the property that makes the CSV exports usable in a finance workflow:
// every exported figure must reconcile against the others. These assertions
// fail on the pre-rounding-fix engine.

import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, readSample, loadRows, resetConfig } from "./harness.mjs";

const cents = (value) => Math.round(Number(value) * 100);

function ledgerByDepartment(engine) {
  const [header, ...rows] = engine.departmentLedgerRows();
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  const grouped = new Map();
  rows.forEach((row) => {
    const department = row[column.department];
    if (!grouped.has(department)) grouped.set(department, {});
    grouped.get(department)[row[column.line_item]] = row[column.amount];
  });
  return grouped;
}

function loadedEngine(rows) {
  const engine = loadEngine();
  resetConfig(engine);
  loadRows(engine, rows || engine.parseCsv(readSample("tickets.csv")));
  return engine;
}

test("ledger line items sum to the exported total row", () => {
  const engine = loadedEngine();
  for (const [department, lines] of ledgerByDepartment(engine)) {
    const parts = [
      "asset_subscriptions", "e_waste_drive_destruction", "ticket_support",
      "sensitivity_surcharge", "sla_breach_credit", "shared_overhead"
    ].reduce((sum, key) => sum + cents(lines[key]), 0);
    assert.equal(parts, cents(lines.total), `${department} line items must foot to its total`);
  }
});

test("ticket CSV rows reconcile to the ledger ticket lines", () => {
  const engine = loadedEngine();
  const [header, ...rows] = engine.ticketCalculationRows();
  const column = Object.fromEntries(header.map((name, index) => [name, index]));

  const perDepartment = new Map();
  rows.forEach((row) => {
    const department = row[column.department];
    const current = perDepartment.get(department) || { support: 0, surcharge: 0, sla: 0 };
    current.support += cents(row[column.support_cost]);
    current.surcharge += cents(row[column.sensitivity_surcharge]);
    current.sla += cents(row[column.sla_impact]);
    perDepartment.set(department, current);
  });

  const ledger = ledgerByDepartment(engine);
  for (const [department, sums] of perDepartment) {
    const lines = ledger.get(department);
    assert.equal(sums.support, cents(lines.ticket_support), `${department} ticket support`);
    assert.equal(sums.surcharge, cents(lines.sensitivity_surcharge), `${department} surcharge`);
    assert.equal(sums.sla, cents(lines.sla_breach_credit), `${department} SLA credit`);
  }
});

test("billable_amount equals its own component columns on every row", () => {
  const engine = loadedEngine();
  const [header, ...rows] = engine.ticketCalculationRows();
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  rows.forEach((row) => {
    const parts = cents(row[column.support_cost])
      + cents(row[column.sensitivity_surcharge])
      + cents(row[column.sla_impact]);
    assert.equal(parts, cents(row[column.billable_amount]), `ticket ${row[column.ticket_id]}`);
  });
});

test("department totals sum to the dashboard headline total", () => {
  const engine = loadedEngine();
  const summed = engine.state.summaries.reduce((sum, item) => sum + cents(item.total), 0);
  assert.equal(summed, cents(engine.totals().total));
});

test("reconciliation holds on a larger generated dataset", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const departments = engine.state.config.departments.map((dept) => dept.name);
  const rows = Array.from({ length: 2000 }, (_, index) => ({
    ticketId: `INC-${200000 + index}`,
    createdDate: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
    department: departments[index % departments.length],
    priority: ["Low", "Medium", "High", "Critical"][index % 4],
    // Thirds and sevenths of an hour are where cent rounding actually bites.
    hours: String(((index % 17) + 1) / 3),
    sensitivity: index % 3 === 0 ? "Clinical Systems - EMR" : "General IT",
    slaStatus: index % 7 === 0 ? "Breached" : "Met",
    afterHours: index % 9 === 0 ? "Yes" : "No",
    tier: "Tier 1 Desktop Support"
  }));
  loadRows(engine, rows);

  assert.equal(engine.state.dataQuality.acceptedCount, 2000);
  for (const [department, lines] of ledgerByDepartment(engine)) {
    const parts = [
      "asset_subscriptions", "e_waste_drive_destruction", "ticket_support",
      "sensitivity_surcharge", "sla_breach_credit", "shared_overhead"
    ].reduce((sum, key) => sum + cents(lines[key]), 0);
    assert.equal(parts, cents(lines.total), `${department} must foot at scale`);
  }
});

test("CSV export neutralises spreadsheet formula injection", () => {
  const engine = loadEngine();
  const csv = engine.toCsv([
    ["value"],
    ["=1+1"],
    ["+SUM(A1)"],
    ["@import"],
    ["-cmd|calc"],
    ["\tTabbed"],
    ["-42.50"],
    ["ordinary text"]
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[1], `"'=1+1"`);
  assert.equal(lines[2], `"'+SUM(A1)"`);
  assert.equal(lines[3], `"'@import"`);
  assert.equal(lines[4], `"'-cmd|calc"`);
  assert.equal(lines[5], `"'\tTabbed"`);
  assert.equal(lines[6], `"-42.50"`, "negative credits must stay numeric");
  assert.equal(lines[7], `"ordinary text"`);
});

test("CSV export escapes embedded quotes", () => {
  const engine = loadEngine();
  assert.equal(engine.toCsv([[`He said "hi"`]]), `"He said ""hi"""`);
});
