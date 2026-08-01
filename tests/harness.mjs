// Loads the Qist engine directly out of index.html so tests can never drift
// from shipped code. The app is a single file by design; rather than duplicate
// the calculation logic here, the main <script> is evaluated against a minimal
// DOM stub with the two bootstrap calls (render / initializeImportHistory)
// removed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function extractEngineSource() {
  const html = readFileSync(join(root, "index.html"), "utf8");
  // The app script is the last <script> block in the file.
  const open = html.lastIndexOf("<script>");
  const close = html.lastIndexOf("</script>");
  if (open === -1 || close === -1 || close < open) {
    throw new Error("Could not locate the application <script> block in index.html");
  }
  const source = html.slice(open + "<script>".length, close);
  const stripped = source
    .replace(/^\s*render\(\);\s*$/m, "")
    .replace(/^\s*initializeImportHistory\(\);\s*$/m, "");
  if (stripped === source) {
    throw new Error("Bootstrap calls not found; harness needs updating");
  }
  return stripped;
}

function createStubDom() {
  const store = new Map();
  const element = {
    innerHTML: "",
    value: "",
    dataset: {},
    classList: { add() {}, remove() {} },
    files: [],
    focus() {},
    setSelectionRange() {},
    addEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const documentStub = {
    documentElement: { dataset: {} },
    body: element,
    addEventListener() {},
    getElementById: () => element,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ ...element })
  };
  const windowStub = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    location: { href: "http://localhost/index.html" },
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
    open: () => null
    // indexedDB intentionally absent: Monthly History degrades gracefully.
  };
  return { documentStub, windowStub };
}

// Names the tests need. Everything is a top-level declaration in the app script.
const EXPORTS = [
  "state", "defaultConfig", "clone", "mergeConfig",
  "roundMoney", "sumMoney", "allocateOverhead",
  "parseCsv", "parseJson", "parseHours", "hoursColumnUnit", "headerTokens",
  "inferMapping", "headersFromRows", "normalizePriority", "normalizeTier",
  "normalizeSlaStatus", "isSensitive", "isAfterHours", "canonicalDepartment",
  "monthKey", "weekKey", "inferReportingPeriod", "isValidReportingPeriod",
  "evaluateImportQuality", "computeTicket", "aggregate", "totals",
  "departmentAssetCosts", "snapshotFromTickets", "trendForTickets",
  "snapshotForRows", "cachedSnapshotForRecord",
  "departmentLedgerRows", "ticketCalculationRows", "toCsv"
];

export function loadEngine() {
  const { documentStub, windowStub } = createStubDom();
  const body = `${extractEngineSource()}\n;return { ${EXPORTS.join(", ")} };`;
  const factory = new Function("window", "document", "console", body);
  return factory(windowStub, documentStub, console);
}

export function readSample(name) {
  return readFileSync(join(root, "sample-data", name), "utf8");
}

// Loads a parsed dataset into engine state exactly as the upload path does.
export function loadRows(engine, rows) {
  engine.state.rawRows = rows;
  engine.state.headers = engine.headersFromRows(rows);
  engine.state.mapping = engine.inferMapping(engine.state.headers);
  engine.aggregate();
  return engine.totals();
}

export function resetConfig(engine) {
  engine.state.config = engine.clone(engine.defaultConfig);
}
