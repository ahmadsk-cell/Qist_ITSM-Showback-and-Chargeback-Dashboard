// Executable form of the "Baseline Fixtures" and "Calculation Checks" sections
// of docs/VERIFICATION.md.

import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, readSample, loadRows, resetConfig } from "./harness.mjs";

const cents = (value) => Math.round(value * 100);

function sampleEngine() {
  const engine = loadEngine();
  resetConfig(engine);
  const totals = loadRows(engine, engine.parseCsv(readSample("tickets.csv")));
  return { engine, totals };
}

test("canonical CSV fixture imports cleanly", () => {
  const { engine } = sampleEngine();
  const quality = engine.state.dataQuality;
  assert.equal(quality.acceptedCount, 18);
  assert.equal(quality.rawCount, 18);
  assert.deepEqual(quality.invalidRows, []);
  assert.deepEqual(quality.unknownDepartments, []);
  assert.deepEqual(quality.duplicateTicketIds, []);
});

test("canonical CSV fixture produces the documented totals", () => {
  const { totals } = sampleEngine();
  assert.equal(totals.total.toFixed(2), "52082.25");
  assert.equal(totals.hours.toFixed(1), "55.6");
});

test("INC-10041 matches the worked example in DATA_SCHEMA.md", () => {
  const { engine } = sampleEngine();
  const ticket = engine.state.tickets.find((item) => item.id === "INC-10041");
  // 3.2h clinical @ $172, Critical 2.0x, $125 mobilization, 7.5% surcharge, SLA met.
  assert.equal(ticket.supportCost.toFixed(2), "1225.80");
  assert.equal(ticket.sensitivitySurcharge.toFixed(2), "91.94");
  assert.equal(ticket.slaImpact.toFixed(2), "0.00");
  assert.equal(ticket.ticketTotal.toFixed(2), "1317.74");
});

test("INC-10067 differs between hourly and flat-fee mode", () => {
  const { engine } = sampleEngine();
  assert.equal(
    engine.state.tickets.find((item) => item.id === "INC-10067").ticketTotal.toFixed(2),
    "85.80"
  );

  engine.state.config.flatFeeMode = true;
  engine.aggregate();
  assert.equal(
    engine.state.tickets.find((item) => item.id === "INC-10067").ticketTotal.toFixed(2),
    "95.00"
  );
});

test("after-hours minimum applies in hourly mode only", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const row = {
    ticketId: "T-1", createdDate: "2026-04-02", department: "ER",
    priority: "Low", sensitivity: "General IT", hours: "0.5",
    tier: "Tier 1 Desktop Support", afterHours: "Yes", slaStatus: "Met"
  };

  const hourly = engine.computeTicket(row, 0, engine.inferMapping(Object.keys(row)));
  assert.equal(hourly.billedHours, 2, "0.5h is raised to the 2h minimum");
  // 2h * $78 * 1.0 + $125 mobilization
  assert.equal(hourly.supportCost.toFixed(2), "281.00");

  engine.state.config.flatFeeMode = true;
  const flat = engine.computeTicket(row, 0, engine.inferMapping(Object.keys(row)));
  assert.equal(flat.billedHours, 0.5, "flat fee mode ignores the hours minimum");
  assert.equal(flat.supportCost.toFixed(2), "220.00", "$95 tier fee + $125 mobilization");
});

test("SLA breach credit is negative and taken on support cost, before surcharge", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const row = {
    ticketId: "T-2", createdDate: "2026-04-02", department: "ICU",
    priority: "Low", sensitivity: "General IT", hours: "1",
    tier: "Tier 1 Desktop Support", slaStatus: "Breached"
  };
  const ticket = engine.computeTicket(row, 0, engine.inferMapping(Object.keys(row)));
  assert.equal(ticket.supportCost.toFixed(2), "78.00");
  assert.equal(ticket.slaImpact.toFixed(2), "-9.36", "12% of support cost, negative");
  assert.equal(ticket.ticketTotal.toFixed(2), "68.64");
});

test("blank SLA stays Unknown and earns no credit", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const row = {
    ticketId: "T-3", createdDate: "2026-04-02", department: "ICU",
    priority: "Low", sensitivity: "General IT", hours: "1", slaStatus: ""
  };
  const ticket = engine.computeTicket(row, 0, engine.inferMapping(Object.keys(row)));
  assert.equal(ticket.slaStatus, "Unknown");
  assert.equal(ticket.slaImpact, 0);
});

test("shared overhead sums exactly to the configured pool", () => {
  const { engine } = sampleEngine();
  const pool = engine.state.config.fees.sharedOverhead;
  const allocated = engine.state.summaries.reduce((sum, item) => sum + cents(item.overhead), 0);
  assert.equal(allocated, cents(pool));
});

test("overhead allocation stays exact for pools that do not divide evenly", () => {
  const engine = loadEngine();
  // Three equal shares of $100.00 cannot each be a whole number of cents.
  const shares = engine.allocateOverhead([{ weight: 1 }, { weight: 1 }, { weight: 1 }], 100);
  assert.equal(shares.reduce((sum, value) => sum + cents(value), 0), 10000);
  assert.deepEqual(shares.map((value) => value.toFixed(2)), ["33.34", "33.33", "33.33"]);
});

test("zero total headcount allocates no overhead", () => {
  const engine = loadEngine();
  assert.deepEqual(engine.allocateOverhead([{ weight: 0 }, { weight: 0 }], 12800), [0, 0]);
});

test("departments with no configured headcount receive no overhead", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const rows = engine.parseCsv(readSample("tickets.csv")).map((row) => ({ ...row, department: "Radiology" }));
  loadRows(engine, rows);
  const unmapped = engine.state.summaries.find((item) => item.department === "Radiology");
  assert.equal(unmapped.costCenter, "Unmapped");
  assert.equal(unmapped.overhead, 0);
  assert.equal(unmapped.assetCost, 0);
  assert.ok(unmapped.ticketTotal > 0, "ticket-level charges still apply");
});

test("gross and net trend cost follow the documented relationship", () => {
  const { engine } = sampleEngine();
  const trend = engine.trendForTickets(engine.state.tickets, "weekly");
  assert.ok(trend.length > 0);
  trend.forEach((bucket) => {
    assert.equal(
      cents(bucket.cost),
      cents(bucket.grossCost) + cents(bucket.slaImpact),
      "net = gross + (negative) SLA impact"
    );
  });
});

test("asset density excludes SaaS seats and e-waste", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const dept = { workstations: 10, carts: 5, seats: 100, eWasteAssets: 4, headcount: 20 };
  const costs = engine.departmentAssetCosts(dept);
  // 10 * $42 + 5 * $58 = $710 managed; seats and e-waste tracked separately.
  assert.equal(costs.managedAssetSubscription.toFixed(2), "710.00");
  assert.equal(costs.licenseSubscription.toFixed(2), "1800.00");
  assert.equal(costs.eWaste.toFixed(2), "140.00");
});

// Monthly History promises that archived periods are recosted against current
// rates. The snapshot cache must never break that promise to save work.
test("archived period snapshots are cached but recost when rates change", () => {
  const engine = loadEngine();
  resetConfig(engine);
  const rows = [{
    ticketId: "H-1", createdDate: "2026-03-04", department: "ER",
    hours: "2", priority: "High", sensitivity: "General IT", slaStatus: "Met"
  }];
  const record = {
    id: "rec-1",
    savedAt: "2026-04-01T00:00:00Z",
    periodKey: "2026-03",
    rows,
    headers: Object.keys(rows[0]),
    mapping: engine.inferMapping(Object.keys(rows[0]))
  };

  const first = engine.cachedSnapshotForRecord(record);
  assert.equal(engine.cachedSnapshotForRecord(record), first, "repeat reads hit the cache");
  // 2h * $78 tier 1 * 1.5 High multiplier
  assert.equal(first.netRecovered.toFixed(2), "234.00");

  engine.state.config.hourlyRates.tier1 = 200;
  assert.equal(
    engine.cachedSnapshotForRecord(record).netRecovered.toFixed(2),
    "600.00",
    "a rate change must invalidate the cached snapshot"
  );

  // Replacing a reporting period reuses its id, so savedAt has to be part of the key.
  const replaced = engine.cachedSnapshotForRecord({
    ...record,
    savedAt: "2026-05-01T00:00:00Z",
    rows: [...rows, { ...rows[0], ticketId: "H-2" }]
  });
  assert.equal(replaced.tickets, 2, "replaced rows must not read a stale snapshot");
});

test("switching showback and chargeback does not change totals", () => {
  const { engine, totals } = sampleEngine();
  engine.state.mode = "chargeback";
  engine.aggregate();
  assert.equal(engine.totals().total.toFixed(2), totals.total.toFixed(2));
});
