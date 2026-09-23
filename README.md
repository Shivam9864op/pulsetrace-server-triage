# PulseTrace — Minecraft server incident evidence desk

PulseTrace is a browser-local demo for comparing player ping with server tick health and a few recognizable log clues. It helps sort **network-path symptoms**, **server-tick pressure**, **mixed symptoms**, and **insufficient evidence** into a readable troubleshooting handoff.

It is a personal open-source project using synthetic sample data. It is not client work, a production monitoring service, a Minecraft plugin, a DDoS detector, or a root-cause oracle.

## Run it

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm test
npm run serve
```

Open `http://127.0.0.1:8794`. The demo is static and processes pasted/imported data in the browser. The tiny local server only serves project files; it does not receive telemetry.

## Walkthrough video

Watch the [60-second walkthrough](media/pulsetrace-walkthrough.mp4) or download its [subtitle file](media/pulsetrace-walkthrough.srt). The clip was assembled from real states of this running demo; this repository intentionally uses video rather than showcase screenshots.

## Live demo

The live static app is published at [`https://shivam9864op.github.io/pulsetrace-server-triage/`](https://shivam9864op.github.io/pulsetrace-server-triage/). GitHub Actions redeploys it when `main` changes; no application server is needed.

## Try the workflow

1. Pick **Ping spikes**, **Tick pressure**, or **Mixed symptoms**.
2. Compare RTT (ping) with MSPT and TPS in the chart and metric cards.
3. Review which visible rules were crossed and the matched log clues.
4. Import your own CSV with `time,ping_ms,tps,mspt` headers, or paste a few log lines.
5. Preview common personal identifiers redacted from log text.
6. Export the current analysis as Markdown or JSON.

The repository includes a subtitled walkthrough video recorded from the real running demo, plus its SRT caption file. It contains no product mockups or fabricated customer material.

CSV values may use `timeout`, `lost`, `na`, or blank for a missing ping sample. Aliases include `timestamp`, `latency_ms`, `rtt_ms`, `ticks_per_second`, and `tick_time_ms`. File size is limited to 2 MB in the browser UI.

## How the demo classifies symptoms

The starting thresholds are deliberately visible in the interface and code:

- Network-path symptom flags: nearest-rank ping p95 ≥ 120 ms, average absolute change between consecutive valid ping samples ≥ 35 ms, or at least 2% of ping rows missing.
- Server-tick pressure flags: nearest-rank MSPT median ≥ 50 ms or minimum provided TPS < 18.
- Both groups flagged: mixed symptoms. Neither flagged: no major signal in this sample. Too little readable telemetry: insufficient evidence.

These are example thresholds, not universal Minecraft operating limits. The “evidence coverage” number indicates how much telemetry is present; it is **not** a confidence probability. The missing-ping percentage is a gap in the supplied dataset, not confirmed packet loss.

## Safety and privacy boundaries

- No server login, plugin, API key, active scan, packet capture, or outbound telemetry request.
- Imported files and pasted logs stay in the current browser session. Nothing is saved by the app.
- Exported log excerpts are passed through basic redaction for IPv4 addresses, email addresses, UUIDs, and simple `token=`, `secret=`, or `authorization=` values. Review every export; pattern-based redaction can miss secrets.
- Do not paste credentials, player personal information, private chat, or production logs you do not have permission to share.
- A ping spike alone cannot prove a DDoS attack. PulseTrace does not detect, attribute, or mitigate attacks. Ask the hosting/network provider for appropriate telemetry.
- Logs can corroborate a time window, but a generic timeout or “Can't keep up” line does not prove the complete root cause.

## Project structure

```text
index.html             Browser dashboard
src/engine.mjs         Deterministic calculations, CSV parser, redaction, report
src/app.mjs            Interactive UI and local export actions
src/styles.css         Responsive interface
scripts/serve.mjs      Small static-file development server
test/engine.test.mjs   Node built-in tests
```

## Roadmap

- Add fixture-based examples for different sampling intervals.
- Add an import preview that lets people map arbitrary header names.
- Collect feedback from server owners before adding integrations.

No commercial Minecraft server, client, or customer is represented by the built-in scenarios.
