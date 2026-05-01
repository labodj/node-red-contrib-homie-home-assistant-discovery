# Documentation

This package is the Node-RED wrapper for the Homie-to-Home-Assistant discovery
bridge. The README gives the quickest first run; this page keeps the rest of the
documentation easy to navigate.

## Start Here

Read these in order if you are building the flow for the first time:

1. [README](README.md) for the purpose of the node, the basic wiring, outputs,
   and a small override example.
2. [Node-RED usage](docs/USAGE.md) for editor fields, dynamic subscriptions,
   diagnostics, and Node-RED-specific behavior.
3. [Discovery overrides](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/OVERRIDES.md)
   when Home Assistant needs friendlier names, stable historical IDs, or a more
   specific entity platform.

That path is enough for most Node-RED installations.

## Common Tasks

- Wire the normal Node-RED flow:
  [Node-RED usage](docs/USAGE.md#recommended-flow).
- Let the node manage MQTT subscriptions dynamically:
  [Dynamic subscriptions](docs/USAGE.md#dynamic-subscriptions).
- Understand the four physical outputs:
  [Node-RED usage](docs/USAGE.md#outputs).
- Configure prefixes, versions, booleans and diagnostics:
  [Editor configuration](docs/USAGE.md#editor-configuration).
- Decide how Homie properties become Home Assistant entities:
  [Entity mapping](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOME_ASSISTANT_DISCOVERY.md).
- Rename entities or preserve existing Home Assistant history:
  [Discovery overrides](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/OVERRIDES.md).
- Check exact Homie v3/v4/v5 behavior:
  [Homie compatibility](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOMIE_COMPATIBILITY.md).

## How the Pieces Fit

This Node-RED node owns the editor UI, status text, diagnostics, dynamic
subscription-control messages, and the four physical outputs.

The shared mapping engine lives in
[`homie-home-assistant-discovery`](https://github.com/labodj/homie-home-assistant-discovery).
That core package owns Homie parsing, Home Assistant MQTT discovery payloads,
override validation, cleanup messages, and the standalone CLI/library API.

Keeping that split visible helps when something needs debugging: MQTT broker
credentials and TLS stay in Node-RED's MQTT config node; Homie parsing and
entity mapping stay in the shared core; flow wiring stays in this package.

## Project Scope

This node is about discovery metadata: Homie device descriptions in, retained
Home Assistant MQTT discovery messages out.

It does not open its own MQTT connection, replace Home Assistant, validate live
property values, or decide automation behavior. Home Assistant entities subscribe
directly to the generated Homie state topics and publish directly to the
generated Homie command topics.

## Mapping Philosophy

The mapper is careful by default. It uses Homie metadata when the meaning is
clear, and it leaves human intent to overrides when Homie core is too generic.

That is why generic commandable booleans become `switch` by default, while
lights, fans, stable names, device classes, icons, historical IDs, and advanced
Home Assistant fields are best handled through explicit overrides.
