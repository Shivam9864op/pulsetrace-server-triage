import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, analyzeIncident, parseCsv, percentile, redactSensitive, toEvidenceMarkdown } from "../src/engine.mjs";

test("demo scenarios produce distinct, explainable symptom groups", () => {
  const results = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, analyzeIncident(scenario.samples, scenario.logs)]));
  assert.equal(results.steady.category, "steady");
  assert.equal(results.jitter.category, "network");
  assert.equal(results.ticks.category, "server");
  assert.equal(results.mixed.category, "mixed");
  assert.ok(results.jitter.rules.some((rule) => /missing/i.test(rule.title)));
  assert.ok(results.ticks.rules.some((rule) => /Can't keep up/.test(rule.title)));
});

test("p95 uses nearest-rank and missing RTT rows are not called confirmed loss", () => {
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
  const result = analyzeIncident([{ time: "a", ping: 20, tps: 20, mspt: 30 }, { time: "b", ping: null, tps: 20, mspt: 30 }]);
  assert.equal(result.metrics.lossPercent, 50);
  assert.match(result.rules.find((rule) => /ping samples are missing/.test(rule.title)).detail, /not confirmed packet loss/i);
});

test("CSV parser supports aliases, quoted cells, and timeout rows", () => {
  const rows = parseCsv('timestamp,latency_ms,TPS,MSPT\n"00:00",35,20,31\n00:01,timeout,20,32');
  assert.deepEqual(rows, [
    { time: "00:00", ping: 35, tps: 20, mspt: 31 },
    { time: "00:01", ping: null, tps: 20, mspt: 32 }
  ]);
});

test("CSV parser rejects missing telemetry headers and malformed numeric-only rows", () => {
  assert.throws(() => parseCsv("time,player\n00:00,alex"), /Couldn't find telemetry columns/);
  assert.throws(() => parseCsv("time,ping_ms,tps,mspt\n00:00,abc,20,35"), /invalid ping value/);
  assert.throws(() => parseCsv("time,ping_ms,tps,mspt\n00:00,-1,20,35"), /negative ping value/);
  assert.throws(() => parseCsv("time,ping_ms,tps,mspt\n00:00,20,21,35"), /TPS above 20/);
});

test("rows with only missing ping samples remain insufficient without tick metrics", () => {
  const result = analyzeIncident([{ time: "a", ping: null }, { time: "b", ping: null }]);
  assert.equal(result.category, "insufficient");
});

test("sensitive log values are redacted before appearing in exported notes", () => {
  const source = "peer 10.2.3.4 user ash@example.org uuid 123e4567-e89b-42d3-a456-426614174000 token=abc123";
  const safe = redactSensitive(source);
  assert.doesNotMatch(safe, /10\.2\.3\.4|ash@example\.org|123e4567|abc123/);
  const brief = toEvidenceMarkdown(analyzeIncident(SCENARIOS[1].samples, source), "sample", source);
  assert.match(brief, /\[IP REDACTED\]/);
  assert.doesNotMatch(brief, /ash@example\.org/);
});

test("an empty input gives an honest insufficient-evidence state", () => {
  const result = analyzeIncident([]);
  assert.equal(result.category, "insufficient");
  assert.equal(result.metrics.pingP95, null);
  assert.match(result.explanation, /not enough readable telemetry/i);
});
