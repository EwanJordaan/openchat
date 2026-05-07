import fs from "node:fs";

const threshold = {
  lines: 80,
  statements: 80,
  functions: 80,
  branches: 70,
};

const candidates = ["coverage/coverage-final.json", "coverage.json"];
const coveragePath = candidates.find((path) => fs.existsSync(path));
if (!coveragePath) {
  console.error("Coverage report was not generated. Expected coverage/coverage-final.json or coverage.json.");
  process.exit(1);
}

const raw = fs.readFileSync(coveragePath, "utf8");
const parsed = JSON.parse(raw);
const files = Object.values(parsed);

const totals = {
  lines: { covered: 0, total: 0 },
  statements: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
};

for (const file of files) {
  const entry = file;
  const s = entry.s || {};
  const f = entry.f || {};
  const b = entry.b || {};

  totals.statements.total += Object.keys(s).length;
  totals.statements.covered += Object.values(s).filter((count) => Number(count) > 0).length;

  totals.functions.total += Object.keys(f).length;
  totals.functions.covered += Object.values(f).filter((count) => Number(count) > 0).length;

  let branchTotal = 0;
  let branchCovered = 0;
  for (const item of Object.values(b)) {
    if (!Array.isArray(item)) continue;
    branchTotal += item.length;
    branchCovered += item.filter((count) => Number(count) > 0).length;
  }
  totals.branches.total += branchTotal;
  totals.branches.covered += branchCovered;

  totals.lines.total += Object.keys(s).length;
  totals.lines.covered += Object.values(s).filter((count) => Number(count) > 0).length;
}

function percent(covered, total) {
  if (!total) return 100;
  return (covered / total) * 100;
}

const scores = {
  lines: percent(totals.lines.covered, totals.lines.total),
  statements: percent(totals.statements.covered, totals.statements.total),
  functions: percent(totals.functions.covered, totals.functions.total),
  branches: percent(totals.branches.covered, totals.branches.total),
};

console.log("Coverage summary:");
for (const key of Object.keys(scores)) {
  console.log(`${key}: ${scores[key].toFixed(2)}% (threshold ${threshold[key]}%)`);
}

const failing = Object.entries(scores).filter(([key, value]) => value < threshold[key]);
if (failing.length) {
  console.error("Coverage thresholds failed:");
  for (const [key, value] of failing) {
    console.error(`- ${key}: ${value.toFixed(2)}% < ${threshold[key]}%`);
  }
  process.exit(1);
}
