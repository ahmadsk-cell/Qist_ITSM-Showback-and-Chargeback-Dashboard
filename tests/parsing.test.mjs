// Executable form of the "Parser Edge Cases" section of docs/VERIFICATION.md.

import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, readSample, resetConfig } from "./harness.mjs";

const engine = loadEngine();

test("hours column unit is inferred from whole words, not substrings", () => {
  // Regression: substring matching on a squashed header read "Admin Hours" as
  // minutes and "Section Hours" as seconds, silently shrinking billable time.
  assert.equal(engine.parseHours("3.5", "Hours"), 3.5);
  assert.equal(engine.parseHours("3.5", "Admin Hours"), 3.5);
  assert.equal(engine.parseHours("3.5", "Section Hours"), 3.5);
  assert.equal(engine.parseHours("3.5", "Determination Hours"), 3.5);
  assert.equal(engine.parseHours("3.5", "Administrative Time"), 3.5);

  assert.equal(engine.parseHours("90", "Duration Minutes"), 1.5);
  assert.equal(engine.parseHours("90", "duration_mins"), 1.5);
  assert.equal(engine.parseHours("90", "durationMinutes"), 1.5, "camelCase splits");
  assert.equal(engine.parseHours("7200", "Elapsed Seconds"), 2);
  assert.equal(engine.parseHours("7200", "elapsed_secs"), 2);
});

test("an explicit hour token wins over an ambiguous one", () => {
  assert.equal(engine.hoursColumnUnit("Work Hours (Minutes Billed)"), "hours");
  assert.equal(engine.hoursColumnUnit("Time Spent"), "hours", "unlabelled defaults to hours");
  assert.equal(engine.hoursColumnUnit("Minutes"), "minutes");
  assert.equal(engine.hoursColumnUnit("Seconds"), "seconds");
});

test("per-row hour formats normalise regardless of column name", () => {
  assert.equal(engine.parseHours("01:30"), 1.5);
  assert.equal(engine.parseHours("1:30:00"), 1.5);
  assert.equal(engine.parseHours("1h 30m"), 1.5);
  assert.equal(engine.parseHours("2 hrs"), 2);
  assert.equal(engine.parseHours("45 min"), 0.75);
  assert.equal(engine.parseHours(2.25), 2.25);
  assert.ok(Number.isNaN(engine.parseHours("")));
  assert.ok(Number.isNaN(engine.parseHours("not a number")));
});

test("after-hours flags are read conservatively", () => {
  ["Yes", "true", "1", "Y", "After Hours", "on-call", "Off Hours"].forEach((value) => {
    assert.equal(engine.isAfterHours(value), true, value);
  });
  ["No", "false", "0", "", "Regular day", "business hours", "standard"].forEach((value) => {
    assert.equal(engine.isAfterHours(value), false, value);
  });
});

test("priority aliases normalise", () => {
  assert.equal(engine.normalizePriority("P1"), "Critical");
  assert.equal(engine.normalizePriority("Sev 2"), "High");
  assert.equal(engine.normalizePriority("Normal"), "Medium");
  assert.equal(engine.normalizePriority(""), "Low");
});

test("SLA status aliases normalise, blanks stay Unknown", () => {
  ["Breached", "missed", "violated", "failed", "not met"].forEach((value) => {
    assert.equal(engine.normalizeSlaStatus(value), "Breached", value);
  });
  ["Met", "passed", "within target", "compliant"].forEach((value) => {
    assert.equal(engine.normalizeSlaStatus(value), "Met", value);
  });
  assert.equal(engine.normalizeSlaStatus(""), "Unknown");
  assert.equal(engine.normalizeSlaStatus("pending"), "Unknown");
});

test("CSV handles quoting, embedded commas, and CRLF", () => {
  const rows = engine.parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n2,plain\r\n');
  assert.deepEqual(rows, [
    { a: "x,1", b: 'he said "hi"' },
    { a: "2", b: "plain" }
  ]);
});

test("CSV strips a leading BOM from the first header only", () => {
  const rows = engine.parseCsv("﻿ticketId,hours\nT-1,2\n");
  assert.deepEqual(Object.keys(rows[0]), ["ticketId", "hours"]);
});

test("malformed CSV fails with a readable message", () => {
  assert.throws(() => engine.parseCsv('a,b\n"unclosed,2\n'), /unclosed quoted field/);
  assert.throws(() => engine.parseCsv("a,,c\n1,2,3\n"), /blank column header/);
  assert.throws(() => engine.parseCsv("Ticket ID,ticket_id\n1,2\n"), /duplicate column headers/);
});

test("JSON accepts a root array or a wrapped array", () => {
  const expected = [{ ticketId: "T-1" }];
  assert.deepEqual(engine.parseJson('[{"ticketId":"T-1"}]'), expected);
  assert.deepEqual(engine.parseJson('{"tickets":[{"ticketId":"T-1"}]}'), expected);
  assert.deepEqual(engine.parseJson('{"records":[{"ticketId":"T-1"}]}'), expected);
  assert.deepEqual(engine.parseJson('{"data":[{"ticketId":"T-1"}]}'), expected);
  assert.throws(() => engine.parseJson('{"nope":1}'), /must be an array/);
  assert.throws(() => engine.parseJson("[1,2]"), /row 1 must be an object/);
});

test("the shipped JSON sample parses and maps", () => {
  const rows = engine.parseJson(readSample("tickets.json"));
  assert.ok(rows.length >= 3);
  const mapping = engine.inferMapping(engine.headersFromRows(rows));
  ["ticketId", "createdDate", "department", "hours"].forEach((field) => {
    assert.ok(mapping[field], `${field} should map automatically`);
  });
});

test("common ITSM column aliases map automatically", () => {
  const mapping = engine.inferMapping([
    "Incident Number", "Opened", "Business Unit", "Urgency",
    "Duration Minutes", "SLA", "Assignment Group", "On Call"
  ]);
  assert.equal(mapping.ticketId, "Incident Number");
  assert.equal(mapping.createdDate, "Opened");
  assert.equal(mapping.department, "Business Unit");
  assert.equal(mapping.priority, "Urgency");
  assert.equal(mapping.hours, "Duration Minutes");
});

test("invalid rows are excluded and reported with source row numbers", () => {
  const local = loadEngine();
  resetConfig(local);
  const rows = [
    { ticketId: "T-1", createdDate: "2026-04-01", department: "ER", hours: "1" },
    { ticketId: "", createdDate: "2026-04-01", department: "ER", hours: "1" },
    { ticketId: "T-3", createdDate: "not-a-date", department: "ER", hours: "1" },
    { ticketId: "T-4", createdDate: "2026-04-01", department: "", hours: "1" },
    { ticketId: "T-5", createdDate: "2026-04-01", department: "ER", hours: "-2" }
  ];
  const quality = local.evaluateImportQuality(rows, local.inferMapping(Object.keys(rows[0])), Object.keys(rows[0]));

  assert.equal(quality.acceptedRows.length, 1);
  // Row numbers are 1-based with a header row, so data row 2 reports as 3.
  assert.deepEqual(quality.invalidRows.map((item) => item.row), [3, 4, 5, 6]);
  assert.deepEqual(quality.invalidRows[0].issues, ["ticket ID"]);
  assert.deepEqual(quality.invalidRows[1].issues, ["created date"]);
  assert.deepEqual(quality.invalidRows[2].issues, ["department"]);
  assert.deepEqual(quality.invalidRows[3].issues, ["hours"]);
});

test("duplicate ticket IDs are flagged but kept as separate rows", () => {
  const local = loadEngine();
  resetConfig(local);
  const rows = [
    { ticketId: "T-1", createdDate: "2026-04-01", department: "ER", hours: "1" },
    { ticketId: "t-1", createdDate: "2026-04-02", department: "ER", hours: "2" }
  ];
  const quality = local.evaluateImportQuality(rows, local.inferMapping(Object.keys(rows[0])), Object.keys(rows[0]));
  assert.equal(quality.acceptedRows.length, 2, "split work records are preserved");
  assert.deepEqual(quality.duplicateTicketIds, ["t-1"]);
});

test("unknown departments are surfaced, not dropped", () => {
  const local = loadEngine();
  resetConfig(local);
  const rows = [{ ticketId: "T-1", createdDate: "2026-04-01", department: "Radiology", hours: "1" }];
  const quality = local.evaluateImportQuality(rows, local.inferMapping(Object.keys(rows[0])), Object.keys(rows[0]));
  assert.equal(quality.acceptedRows.length, 1);
  assert.deepEqual(quality.unknownDepartments, ["Radiology"]);
});

test("departments resolve by cost centre as well as name", () => {
  const local = loadEngine();
  resetConfig(local);
  assert.equal(local.canonicalDepartment("CC-1100"), "ER");
  assert.equal(local.canonicalDepartment("er"), "ER");
  assert.equal(local.canonicalDepartment("Radiology"), "Radiology");
});

test("reporting period is inferred from the most common created month", () => {
  const rows = [
    { createdDate: "2026-07-02" }, { createdDate: "2026-07-19" },
    { createdDate: "2026-07-28" }, { createdDate: "2026-06-30" }
  ];
  const mapping = { createdDate: "createdDate" };
  assert.equal(engine.inferReportingPeriod(rows, mapping), "2026-07");
  assert.equal(engine.isValidReportingPeriod("2026-07"), true);
  assert.equal(engine.isValidReportingPeriod("2026-13"), false);
  assert.equal(engine.isValidReportingPeriod("July 2026"), false);
});

test("date-only strings are read in local time, not shifted by UTC", () => {
  // A naive new Date("2026-04-01") is UTC midnight and can land in March.
  assert.equal(engine.monthKey("2026-04-01"), "2026-04");
  assert.equal(engine.weekKey("2026-04-01"), "2026-03-30", "ISO weeks start Monday");
  assert.equal(engine.monthKey("garbage"), "Unknown");
});

test("stored settings cannot pollute Object.prototype", () => {
  const local = loadEngine();
  local.mergeConfig({ safe: 1 }, JSON.parse('{"__proto__":{"polluted":"yes"}}'));
  assert.equal({}.polluted, undefined);
});
