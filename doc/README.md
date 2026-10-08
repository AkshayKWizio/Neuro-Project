# Neuro glove rehabilitation documentation

This folder is the documentation entry point for the local Neuro glove rehabilitation system.

## Start here

![Neuro end-to-end user flow](assets/neuro-end-to-end-flow.png)

The editable flowchart source is [assets/neuro-end-to-end-flow.mmd](assets/neuro-end-to-end-flow.mmd), with a scalable export at [assets/neuro-end-to-end-flow.svg](assets/neuro-end-to-end-flow.svg).

## Documentation map

### Product and developer documentation

- [developer/UI_FLOW_AND_COMPONENTS.md](developer/UI_FLOW_AND_COMPONENTS.md) — phase-by-phase user story and panel-level behavior.
- [developer/PRD.md](developer/PRD.md) — product goals, personas, user stories, functional requirements, non-functional requirements and acceptance criteria.
- [developer/TRD.md](developer/TRD.md) — architecture, protocols, data models, animation pipeline, exercise logic, APIs and technical constraints.
- [developer/REQUIREMENTS_TRACEABILITY.md](developer/REQUIREMENTS_TRACEABILITY.md) — requirement-to-component and verification mapping.
- [developer/RUNBOOK.md](developer/RUNBOOK.md) — installation, local startup, build, troubleshooting and handoff instructions.

### Agent documentation

- [agent/AGENT_CONTEXT.md](agent/AGENT_CONTEXT.md) — concise system context, invariants, ownership boundaries and safe-change guidance for future coding agents.

## Current release scope

The application is a Windows-local clinical prototype. StretchSense XR Game owns the Bluetooth glove connection and processed glove stream. The Python bridge receives OSC v1 packets, runs the selected exercise detector, exposes HTTP/WebSocket APIs, and serves the compiled React application and embedded Night Relay game on `http://127.0.0.1:3000`.

The documentation describes the code as it exists on 29 September 2026. Items explicitly marked as planned or known limitations are not current features.
