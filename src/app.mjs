import { SCENARIOS, analyzeIncident, parseCsv, redactSensitive, toEvidenceMarkdown } from "./engine.mjs";

const $ = (selector) => document.querySelector(selector);
const scenarioList = $("#scenario-list");
const chart = $("#chart");
const logsInput = $("#logs-input");
const csvInput = $("#csv-input");
let activeScenario = SCENARIOS[1];
let activeSamples = activeScenario.samples;
let imported = false;
let lastAnalysis = analyzeIncident(activeSamples, activeScenario.logs);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const fmt = (value, suffix = "") => value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}${suffix}`;

function renderScenarios() {
  scenarioList.innerHTML = SCENARIOS.map((scenario) => `<button class="scenario-card ${scenario.id === activeScenario.id ? "selected" : ""}" data-scenario="${scenario.id}" aria-pressed="${scenario.id === activeScenario.id}"><span class="scenario-head"><span class="scenario-icon scenario-${scenario.id}">${scenario.id === "steady" ? "✓" : scenario.id === "jitter" ? "↗" : scenario.id === "ticks" ? "⌁" : "⊕"}</span><span class="scenario-kicker">${scenario.id === "steady" ? "CONTROL" : scenario.id === "mixed" ? "COMBINED" : "SIGNAL TEST"}</span><span class="scenario-arrow">↗</span></span><strong>${escapeHtml(scenario.name)}</strong><small>${escapeHtml(scenario.summary)}</small></button>`).join("");
  scenarioList.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => loadScenario(button.dataset.scenario)));
}

function loadScenario(id) {
  activeScenario = SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
  activeSamples = activeScenario.samples;
  imported = false;
  logsInput.value = activeScenario.logs;
  csvInput.value = "";
  $("#import-status").textContent = "No data leaves this tab.";
  $("#sample-label").textContent = `SYNTHETIC DEMO · ${activeScenario.label}`;
  runAnalysis();
  renderScenarios();
}

function chartMarkup(samples) {
  const width = 760; const height = 226; const left = 42; const right = 14; const top = 18; const bottom = 34;
  const maxValue = Math.max(100, ...samples.flatMap((sample) => [sample.ping, sample.mspt]).filter(Number.isFinite)) * 1.12;
  const x = (index) => left + (samples.length <= 1 ? 0 : index * (width - left - right) / (samples.length - 1));
  const y = (value) => height - bottom - (value / maxValue) * (height - top - bottom);
  const guides = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const val = maxValue * fraction; const py = y(val);
    return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}" class="grid-line"/><text x="${left - 10}" y="${py + 4}" text-anchor="end" class="axis-text">${Math.round(val)}</text>`;
  }).join("");
  const pathFor = (key) => {
    let d = ""; let pen = false;
    samples.forEach((sample, index) => {
      const value = sample[key];
      if (!Number.isFinite(value)) { pen = false; return; }
      d += `${pen ? " L" : " M"}${x(index)} ${y(value)}`; pen = true;
    });
    return d;
  };
  const points = (key, klass) => samples.map((sample, index) => Number.isFinite(sample[key]) ? `<circle cx="${x(index)}" cy="${y(sample[key])}" r="3.6" class="${klass}" aria-label="${escapeHtml(sample.time)} ${key} ${sample[key]} ms"><title>${escapeHtml(sample.time)} · ${key === "ping" ? "ping" : "MSPT"}: ${sample[key]} ms</title></circle>` : "").join("");
  const losses = samples.map((sample, index) => sample.ping === null ? `<path d="M${x(index)} ${height - bottom + 7}v8" class="loss-marker"><title>${escapeHtml(sample.time)} · ping sample missing</title></path>` : "").join("");
  const labelEvery = Math.max(1, Math.ceil(samples.length / 8));
  const labels = samples.map((sample, index) => index % labelEvery === 0 || index === samples.length - 1 ? `<text x="${x(index)}" y="${height - 8}" text-anchor="middle" class="axis-text">${escapeHtml(sample.time)}</text>` : "").join("");
  return `<title>Ping and MSPT over the incident sample window</title><desc>Both series are milliseconds. Red markers indicate ping values missing from this dataset.</desc>${guides}<path d="${pathFor("ping")}" class="line-ping"/><path d="${pathFor("mspt")}" class="line-mspt"/>${points("ping", "point-ping")}${points("mspt", "point-mspt")}${losses}${labels}<text x="${left}" y="11" class="axis-title">MS</text>`;
}

function renderChart() {
  chart.setAttribute("viewBox", "0 0 760 226");
  chart.innerHTML = chartMarkup(activeSamples);
  chart.setAttribute("aria-label", `Chart showing ping and server MSPT for ${activeSamples.length} samples`);
  const first = activeSamples[0]?.time ?? "—"; const last = activeSamples.at(-1)?.time ?? "—";
  $("#window-label").textContent = `${activeSamples.length} samples · ${first}–${last}`;
}

function renderDiagnosis(analysis) {
  const map = {
    steady: ["steady", "NO MAJOR SIGNAL"], network: ["network", "NETWORK-PATH SYMPTOMS"],
    server: ["server", "SERVER-TICK PRESSURE"], mixed: ["mixed", "MIXED SIGNALS"], insufficient: ["insufficient", "MORE EVIDENCE NEEDED"]
  };
  const [kind, label] = map[analysis.category];
  $("#diagnosis-panel").innerHTML = `<div class="diagnosis-top"><span class="diagnosis-chip chip-${kind}"><i></i>${label}</span><span class="confidence" title="Coverage of available telemetry fields; this is not a probability of root cause."><strong>${analysis.confidence}%</strong><small>evidence coverage</small></span></div><div class="diagnosis-symbol symbol-${kind}">${kind === "steady" ? "✓" : kind === "network" ? "⌁" : kind === "server" ? "◷" : kind === "mixed" ? "⊕" : "?"}</div><h3>${escapeHtml(analysis.title)}</h3><p>${escapeHtml(analysis.explanation)}</p><div class="diagnosis-divider"></div><div class="next-step"><span class="next-icon">→</span><div><strong>Next check</strong><span>${nextCheck(analysis.category)}</span></div></div><div class="not-cause">This is a symptom pattern, not a root-cause verdict.</div>`;
}

function nextCheck(category) {
  return ({
    steady: "Repeat the sample during the problem window and confirm how your metrics were collected.",
    network: "Compare timestamps with another player or host-side path telemetry; do not infer an attack from ping alone.",
    server: "Check server workload, MSPT/TPS collection method and timing around the lag window.",
    mixed: "Align player RTT with tick metrics and ask the host for network-side evidence.",
    insufficient: "Import more ping samples and at least one of TPS or MSPT across the same time window."
  })[category];
}

function renderMetrics(analysis) {
  const m = analysis.metrics;
  const cards = [
    ["PING P95", fmt(m.pingP95, " ms"), "95th percentile · nearest rank", "blue"],
    ["MEAN PING CHANGE", fmt(m.jitter, " ms"), "Average change between valid RTT samples", "teal"],
    ["MISSING PING ROWS", m.lossPercent === null ? "—" : `${Math.round(m.lossPercent)}%`, "Dataset gaps · not confirmed packet loss", "amber"],
    ["MSPT P50", fmt(m.msptP50, " ms"), "Median tick time · nearest rank", "violet"]
  ];
  $("#metrics-grid").innerHTML = cards.map(([label, value, hint, color]) => `<article class="metric-card metric-${color}"><div class="metric-top"><span>${label}</span><i></i></div><strong>${value}</strong><small>${hint}</small></article>`).join("");
}

function renderEvidence(analysis) {
  $("#signal-count").textContent = `${analysis.rules.length} CHECK${analysis.rules.length === 1 ? "" : "S"}`;
  const signals = analysis.rules.length ? analysis.rules : [{ state: "note", title: "No readable checks yet", detail: "Import timestamped telemetry values to build an evidence summary." }];
  $("#signal-list").innerHTML = signals.map((rule) => `<div class="signal-row"><span class="signal-state state-${rule.state}">${rule.state === "ok" ? "✓" : rule.state === "warn" ? "!" : "i"}</span><div><strong>${escapeHtml(rule.title)}</strong><small>${escapeHtml(rule.detail)}</small></div><span class="signal-label">${rule.state === "ok" ? "WITHIN" : rule.state === "warn" ? "CHECK" : "NOTE"}</span></div>`).join("");
  const events = analysis.events.slice(0, 8);
  $("#timeline-list").innerHTML = events.length ? events.map((event) => `<div class="timeline-row"><span class="timeline-time">${escapeHtml(event.time)}</span><span class="timeline-dot dot-${event.type}"></span><span class="timeline-text">${escapeHtml(event.text)}</span></div>`).join("") : `<div class="empty-state"><span>○</span><strong>No flagged samples</strong><small>The current sample has no demo-threshold events.</small></div>`;
}

function runAnalysis() {
  lastAnalysis = analyzeIncident(activeSamples, logsInput.value || activeScenario.logs);
  renderChart(); renderDiagnosis(lastAnalysis); renderMetrics(lastAnalysis); renderEvidence(lastAnalysis);
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function currentName() { return imported ? "Imported CSV sample" : activeScenario.name; }

scenarioList.addEventListener("click", (event) => {
  if (event.target.closest("[data-scenario]")) return;
});
$("#reset-button").addEventListener("click", () => loadScenario("jitter"));
$("#analyze-button").addEventListener("click", () => {
  try {
    const untouchedDemoLogs = logsInput.value === activeScenario.logs;
    activeSamples = parseCsv(csvInput.value); imported = true;
    if (untouchedDemoLogs) logsInput.value = "";
    activeScenario = { id: "imported", name: "Imported telemetry", label: "LOCAL CSV IMPORT", logs: "" };
    $("#sample-label").textContent = "LOCAL CSV IMPORT · NOT UPLOADED";
    $("#import-status").textContent = `${activeSamples.length} rows read in this tab.`;
    runAnalysis(); renderScenarios();
  } catch (error) {
    $("#import-status").textContent = error.message;
    $("#import-status").classList.add("error-text");
  }
});
$("#csv-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 2_000_000) { $("#import-status").textContent = "Please choose a CSV smaller than 2 MB."; return; }
  csvInput.value = await file.text(); $("#import-status").textContent = `${file.name} loaded locally. Choose Analyze sample to review it.`;
  $("#import-status").classList.remove("error-text");
});
$("#redact-button").addEventListener("click", () => {
  const text = logsInput.value || activeScenario.logs;
  const safe = redactSensitive(text);
  $("#redaction-status").textContent = safe === text ? "Preview: no common IP, email or UUID pattern found." : `Preview: ${safe.slice(0, 150)}${safe.length > 150 ? "…" : ""}`;
});
logsInput.addEventListener("input", () => $("#redaction-status").textContent = "Potential IPs, emails and UUIDs are removed in exported notes.");
$("#export-md").addEventListener("click", () => downloadFile("pulsetrace-incident-brief.md", toEvidenceMarkdown(lastAnalysis, currentName(), logsInput.value || activeScenario.logs), "text/markdown;charset=utf-8"));
$("#export-json").addEventListener("click", () => downloadFile("pulsetrace-incident-evidence.json", JSON.stringify({ product: "PulseTrace", demo: !imported, scenario: currentName(), generatedAt: new Date().toISOString(), analysis: lastAnalysis, redactedLogExcerpt: redactSensitive(logsInput.value || activeScenario.logs).slice(0, 3000), limitations: ["Symptom triage only; not a root-cause verdict.", "Missing ping values do not prove packet loss.", "Does not detect, attribute or mitigate DDoS attacks."] }, null, 2), "application/json;charset=utf-8"));
$("#help-button").addEventListener("click", () => $("#about-dialog").showModal());
$("#close-dialog").addEventListener("click", () => $("#about-dialog").close());
$("#about-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

renderScenarios();
logsInput.value = activeScenario.logs;
runAnalysis();
