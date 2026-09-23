export const SCENARIOS = [
  {
    id: "steady", name: "Steady session", summary: "Normal ping and tick time", label: "BASELINE",
    samples: [
      [27, 20, 34], [31, 20, 37], [29, 20, 35], [34, 20, 39], [30, 20, 36],
      [28, 20, 33], [35, 20, 40], [32, 20, 38], [29, 20, 36], [33, 20, 37]
    ].map((row, i) => ({ time: `00:${String(i).padStart(2, "0")}`, ping: row[0], tps: row[1], mspt: row[2] })),
    logs: "[00:00:03] Server started normally\n[00:00:08] Player joined: sample-player"
  },
  {
    id: "jitter", name: "Ping spikes", summary: "Ping jumps; tick health stays stable", label: "NETWORK-PATH SYMPTOMS",
    samples: [
      [29, 20, 35], [32, 20, 38], [null, 20, 37], [164, 20, 39], [208, 20, 36],
      [null, 20, 40], [147, 20, 37], [34, 20, 35], [31, 20, 38], [null, 20, 36]
    ].map((row, i) => ({ time: `00:${String(i).padStart(2, "0")}`, ping: row[0], tps: row[1], mspt: row[2] })),
    logs: "[00:00:03] Player connection timed out\n[00:00:06] Player reconnected"
  },
  {
    id: "ticks", name: "Tick pressure", summary: "Server MSPT rises and TPS falls", label: "SERVER-TICK PRESSURE",
    samples: [
      [29, 20, 35], [32, 20, 38], [31, 19.8, 43], [30, 18.9, 56], [34, 17.4, 78],
      [31, 16.1, 104], [32, 15.6, 131], [33, 16.2, 96], [31, 17.8, 71], [30, 18.1, 63]
    ].map((row, i) => ({ time: `00:${String(i).padStart(2, "0")}`, ping: row[0], tps: row[1], mspt: row[2] })),
    logs: "[00:00:04] Can't keep up! Is the server overloaded? Running 1100ms or 22 ticks behind\n[00:00:06] Can't keep up! Is the server overloaded? Running 1450ms or 29 ticks behind"
  },
  {
    id: "mixed", name: "Mixed symptoms", summary: "Ping and tick indicators both change", label: "MIXED SIGNALS",
    samples: [
      [31, 20, 37], [34, 19.5, 42], [145, 18.2, 61], [null, 17.1, 74], [198, 15.4, 113],
      [173, 14.8, 139], [null, 15.9, 118], [42, 17.2, 81], [35, 18.1, 62], [33, 18.6, 55]
    ].map((row, i) => ({ time: `00:${String(i).padStart(2, "0")}`, ping: row[0], tps: row[1], mspt: row[2] })),
    logs: "[00:00:03] Player connection timed out\n[00:00:05] Can't keep up! Is the server overloaded? Running 1600ms or 32 ticks behind\n[00:00:07] Player reconnected"
  }
];

const finite = (value) => value === null || value === undefined || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const sorted = (values) => [...values].filter(Number.isFinite).sort((a, b) => a - b);

export function percentile(values, p) {
  const list = sorted(values);
  if (!list.length) return null;
  return list[Math.max(0, Math.ceil(p * list.length) - 1)];
}

export function meanAbsoluteChange(values) {
  const changes = [];
  for (let i = 1; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) changes.push(Math.abs(values[i] - values[i - 1]));
  }
  if (!changes.length) return null;
  return changes.reduce((sum, value) => sum + value, 0) / changes.length;
}

export function parseCsv(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Add a header and at least one sample row.");
  const splitLine = (line) => {
    const cells = []; let cell = ""; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
      else cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = splitLine(lines[0]).map((header) => header.toLowerCase().replace(/[\s-]+/g, "_").replace(/[()]/g, ""));
  const find = (...names) => headers.findIndex((header) => names.includes(header));
  const timeIndex = find("time", "timestamp", "sample_time");
  const pingIndex = find("ping_ms", "rtt_ms", "latency_ms", "ping", "rtt", "latency");
  const tpsIndex = find("tps", "ticks_per_second");
  const msptIndex = find("mspt", "mspt_ms", "tick_time_ms");
  if (pingIndex < 0 && tpsIndex < 0 && msptIndex < 0) throw new Error("Couldn't find telemetry columns. Use ping_ms, tps and/or mspt.");
  const rows = lines.slice(1).map((line, i) => {
    const cells = splitLine(line);
    const read = (index) => index < 0 ? null : cells[index];
    const parseMetric = (raw, label, allowedMissing = false) => {
      if (raw === null || raw === "" || allowedMissing && /^(timeout|lost|na|null)$/i.test(raw)) return null;
      const value = finite(raw);
      if (value === null) throw new Error(`Row ${i + 2} has an invalid ${label} value.`);
      if (value < 0) throw new Error(`Row ${i + 2} has a negative ${label} value.`);
      if (label === "TPS" && value > 20) throw new Error(`Row ${i + 2} has TPS above 20; check the column mapping.`);
      return value;
    };
    const ping = parseMetric(read(pingIndex), "ping", true);
    const tps = parseMetric(read(tpsIndex), "TPS");
    const mspt = parseMetric(read(msptIndex), "MSPT");
    const time = timeIndex < 0 ? `sample-${String(i + 1).padStart(2, "0")}` : (read(timeIndex) || `sample-${i + 1}`);
    return { time, ping, tps, mspt };
  });
  if (rows.every((row) => row.ping === null && row.tps === null && row.mspt === null)) throw new Error("The CSV has no readable telemetry values.");
  return rows;
}

export function redactSensitive(text) {
  return String(text ?? "")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REDACTED]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID REDACTED]")
    .replace(/\b(token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, (_, name) => `${name}=[REDACTED]`);
}

function parseLogClues(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const clues = [];
  lines.forEach((line, index) => {
    if (/can't keep up|server is overloaded|ticks behind/i.test(line)) clues.push({ time: `log ${index + 1}`, type: "tick", text: "Server log reports a tick backlog (\"Can't keep up\")." });
    if (/timed out|timeout|connection reset|disconnected/i.test(line)) clues.push({ time: `log ${index + 1}`, type: "connection", text: "Connection-related log message; it does not identify the cause by itself." });
    if (/exception|error|crash/i.test(line)) clues.push({ time: `log ${index + 1}`, type: "error", text: "An error-like log line is present; inspect the original context." });
  });
  return clues;
}

export function analyzeIncident(inputSamples, logText = "") {
  const samples = (inputSamples ?? []).map((sample) => ({
    time: String(sample.time ?? ""), ping: finite(sample.ping), tps: finite(sample.tps), mspt: finite(sample.mspt)
  }));
  const pingValues = samples.map((sample) => sample.ping).filter(Number.isFinite);
  const tpsValues = samples.map((sample) => sample.tps).filter(Number.isFinite);
  const msptValues = samples.map((sample) => sample.mspt).filter(Number.isFinite);
  const missingPingCount = samples.filter((sample) => sample.ping === null).length;
  const pingP50 = percentile(pingValues, 0.5);
  const pingP95 = percentile(pingValues, 0.95);
  const jitter = meanAbsoluteChange(samples.map((sample) => sample.ping));
  const lossPercent = samples.length ? (missingPingCount / samples.length) * 100 : null;
  const msptP50 = percentile(msptValues, 0.5);
  const tpsMin = tpsValues.length ? Math.min(...tpsValues) : null;
  const network = pingValues.length > 0 && (pingP95 >= 120 || jitter !== null && jitter >= 35 || lossPercent !== null && lossPercent >= 2);
  const server = msptP50 !== null && msptP50 >= 50 || tpsMin !== null && tpsMin < 18;
  const hasPing = pingValues.length > 0;
  const hasServer = msptValues.length > 0 || tpsValues.length > 0;
  let category = "insufficient";
  if (hasPing || hasServer) {
    if (network && server) category = "mixed";
    else if (network) category = "network";
    else if (server) category = "server";
    else category = "steady";
  }
  const rules = [];
  if (pingP95 !== null) rules.push({ state: pingP95 >= 120 ? "warn" : "ok", title: `Ping p95 is ${Math.round(pingP95)} ms`, detail: "Nearest-rank 95th percentile of valid RTT samples; flagged at 120 ms." });
  if (jitter !== null) rules.push({ state: jitter >= 35 ? "warn" : "ok", title: `Mean ping change is ${Math.round(jitter)} ms`, detail: "Mean absolute difference between consecutive valid RTT samples; flagged at 35 ms." });
  if (lossPercent !== null) rules.push({ state: lossPercent >= 2 ? "warn" : "ok", title: `${Math.round(lossPercent)}% of ping samples are missing`, detail: "Missing rows are a dataset signal, not confirmed packet loss; flagged at 2%." });
  if (msptP50 !== null) rules.push({ state: msptP50 >= 50 ? "warn" : "ok", title: `MSPT p50 is ${Math.round(msptP50)} ms`, detail: "Nearest-rank median of tick-time samples; flagged at 50 ms." });
  if (tpsMin !== null) rules.push({ state: tpsMin < 18 ? "warn" : "ok", title: `Lowest observed TPS is ${tpsMin.toFixed(1)}`, detail: "Minimum provided TPS; flagged below 18. Values depend on collection method." });
  const logClues = parseLogClues(logText);
  logClues.forEach((clue) => rules.push({ state: clue.type === "tick" ? "warn" : "note", title: clue.text, detail: `Recognized from ${clue.time}; log text is supporting context, not proof.` }));
  const titles = {
    steady: ["No major signal in this sample", "The provided samples stay under the demo thresholds. This does not prove the server or network is problem-free."],
    network: ["Network-path symptoms", "Ping or missing-sample thresholds were crossed while the provided server tick values stayed below their demo thresholds. The actual cause is still unknown."],
    server: ["Server-tick pressure", "The provided MSPT or TPS values crossed the demo thresholds. This suggests checking server-side workload and timing; it does not rule out a network issue."],
    mixed: ["Mixed symptoms", "Both ping-related and server-tick thresholds were crossed. The available sample cannot isolate one root cause; compare timestamps and request host-side telemetry."],
    insufficient: ["More evidence needed", "There are not enough readable telemetry fields to separate latency symptoms from server tick pressure."]
  };
  const confidence = Math.min(100, Math.round((pingValues.length ? 30 + Math.min(25, pingValues.length * 2) : 0) + (hasServer ? 25 + Math.min(20, Math.max(tpsValues.length, msptValues.length) * 2) : 0)));
  const events = samples.flatMap((sample) => {
    const items = [];
    if (sample.ping === null) items.push({ time: sample.time || "sample", type: "loss", text: "Ping value missing in imported sample." });
    else if (sample.ping >= 120) items.push({ time: sample.time || "sample", type: "ping", text: `High RTT sample: ${Math.round(sample.ping)} ms.` });
    if (sample.mspt !== null && sample.mspt >= 50) items.push({ time: sample.time || "sample", type: "tick", text: `Tick time crossed 50 ms: ${Math.round(sample.mspt)} ms.` });
    if (sample.tps !== null && sample.tps < 18) items.push({ time: sample.time || "sample", type: "tick", text: `TPS below demo threshold: ${sample.tps.toFixed(1)}.` });
    return items;
  });
  return {
    category, title: titles[category][0], explanation: titles[category][1], confidence, confidenceLabel: "evidence coverage, not probability",
    metrics: { sampleCount: samples.length, pingCount: pingValues.length, pingP50, pingP95, jitter, lossPercent, msptP50, tpsMin },
    rules, events: [...events, ...logClues], logClues, samples
  };
}

export function toEvidenceMarkdown(analysis, scenarioName, logText = "") {
  const m = analysis.metrics;
  const rows = [
    `# PulseTrace incident brief`, "", `**Scenario:** ${scenarioName}`, `**Observed pattern:** ${analysis.title}`, `**Evidence coverage:** ${analysis.confidence}% (${analysis.confidenceLabel})`, "",
    analysis.explanation, "", "## Measurements", `- Samples: ${m.sampleCount}`, `- Valid ping samples: ${m.pingCount}`, `- Ping p50: ${m.pingP50 === null ? "Unavailable" : `${Math.round(m.pingP50)} ms`}`, `- Ping p95: ${m.pingP95 === null ? "Unavailable" : `${Math.round(m.pingP95)} ms`}`, `- Mean absolute ping change: ${m.jitter === null ? "Unavailable" : `${Math.round(m.jitter)} ms`}`, `- Missing ping rows: ${m.lossPercent === null ? "Unavailable" : `${Math.round(m.lossPercent)}% (not confirmed packet loss)`}`, `- MSPT p50: ${m.msptP50 === null ? "Unavailable" : `${Math.round(m.msptP50)} ms`}`, `- Lowest TPS: ${m.tpsMin === null ? "Unavailable" : m.tpsMin.toFixed(1)}`, "", "## Rule checks",
    ...analysis.rules.map((rule) => `- ${rule.state === "warn" ? "CHECK" : rule.state === "ok" ? "OK" : "NOTE"}: ${rule.title} — ${rule.detail}`), "", "## Limits", "- This summary is evidence triage, not a root-cause diagnosis.", "- Missing ping values do not prove packet loss.", "- PulseTrace does not detect, attribute or mitigate DDoS attacks.", "- Built-in examples are synthetic; imported data should be independently validated."
  ];
  if (logText.trim()) rows.splice(rows.length - 6, 0, "", "## Redacted log excerpt", "```text", redactSensitive(logText).slice(0, 3000), "```");
  return rows.join("\n");
}
