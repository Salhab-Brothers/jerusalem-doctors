// Writes the mutation score as a table, for the run page of the weekly
// "Mutation testing" workflow (it is appended to $GITHUB_STEP_SUMMARY).
//
// Usage: node scripts/mutation-summary.mjs [report.json]
// The report is Stryker's JSON one (reports/mutation/mutation.json by default).
//
// Score = detected / (detected + survived + no coverage), where detected is
// killed or timed out: Stryker's own formula. Ignored mutants (excluded or
// type errors) are not counted.

import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "reports/mutation/mutation.json";
const report = JSON.parse(readFileSync(path, "utf8"));

const rows = Object.entries(report.files).map(([file, { mutants }]) => {
  const count = (...statuses) => mutants.filter((m) => statuses.includes(m.status)).length;
  const detected = count("Killed", "Timeout");
  const missed = count("Survived", "NoCoverage");
  const total = detected + missed;
  return { file, detected, missed, total, score: total === 0 ? 100 : (100 * detected) / total };
});

const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
const total = sum("detected") + sum("missed");
const overall = total === 0 ? 100 : (100 * sum("detected")) / total;

const lines = [
  "### Mutation score",
  "",
  `**${overall.toFixed(1)}%** (${sum("detected")} of ${total} testable mutants caught, ${sum("missed")} missed)`,
  "",
  "| File | Score | Missed | Testable |",
  "| --- | ---: | ---: | ---: |",
  // The weakest files first: that is where a new test pays most.
  ...rows
    .filter((r) => r.total > 0)
    .sort((a, b) => a.score - b.score || b.missed - a.missed)
    .map((r) => `| \`${r.file}\` | ${r.score.toFixed(1)}% | ${r.missed} | ${r.total} |`),
  "",
  "The report with every missed mutant is the `mutation-report` artifact of this run.",
];
console.log(lines.join("\n"));
