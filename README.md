# Node-RED Contrib Homie Home Assistant Discovery

[![npm](https://img.shields.io/npm/v/node-red-contrib-homie-home-assistant-discovery.svg)](https://www.npmjs.com/package/node-red-contrib-homie-home-assistant-discovery)
[![Node-RED Library](https://img.shields.io/badge/Node--RED-Library-8f0000.svg)](https://flows.nodered.org/node/node-red-contrib-homie-home-assistant-discovery)
[![npm downloads](https://img.shields.io/npm/dm/node-red-contrib-homie-home-assistant-discovery.svg)](https://www.npmjs.com/package/node-red-contrib-homie-home-assistant-discovery)
[![CI](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/actions/workflows/ci.yaml)
[![License](https://img.shields.io/github/license/labodj/node-red-contrib-homie-home-assistant-discovery.svg)](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/blob/main/LICENSE)

[![works with MQTT Homie](https://homieiot.github.io/img/works-with-homie.svg "works with MQTT Homie")](https://homieiot.github.io/)

Use this Node-RED node to turn Homie MQTT devices into Home Assistant MQTT
discovery entities.

The node is designed to be simple to wire: put it between the built-in `mqtt in`
and `mqtt out` nodes. It reads Homie metadata from MQTT, emits retained Home
Assistant discovery messages, and can send subscription-control messages back to
the same `mqtt in` node.

It does not open its own broker connection. Node-RED's MQTT nodes already handle
credentials, TLS, reconnect behavior and broker configuration; this node focuses
on Homie parsing, Home Assistant mapping, diagnostics and a clean editor
experience.

![Node-RED Homie Home Assistant Discovery flow](https://raw.githubusercontent.com/labodj/node-red-contrib-homie-home-assistant-discovery/main/images/node-usage.png)

## Quick Start

1. Install from the Node-RED Palette Manager.
2. Add an `mqtt in` node and point it to the broker used by your Homie devices.
3. Leave the `mqtt in` topic empty if you want dynamic subscriptions, or use
   `homie/#` for a broad manual subscription.
4. Wire `mqtt in` into `homie-ha-discovery`.
5. Wire output 1 of `homie-ha-discovery` into an `mqtt out` node on the same
   broker.
6. Optional but recommended: wire output 4 back into the same `mqtt in` node so
   the discovery node can manage Homie subscriptions automatically.

Output 4 is the bottom port so that, in a normal left-to-right flow, the
feedback wire can return to the MQTT input without crossing the discovery,
diagnostic or debug wires.

## Outputs

| Output | Name          | What you usually connect it to                         |
| ------ | ------------- | ------------------------------------------------------ |
| 1      | Discovery     | `mqtt out`, same broker, publishes retained discovery. |
| 2      | Diagnostics   | `debug`, useful warnings and lifecycle logs.           |
| 3      | Debug         | `debug`, original input passthrough for inspection.    |
| 4      | Subscriptions | the same `mqtt in`, for dynamic subscriptions.         |

Discovery messages already contain `topic`, `payload`, `qos` and `retain`, so
the `mqtt out` node can publish them directly.

## Basic Configuration

For most installations the defaults are enough:

- **Home Assistant prefix**: `homeassistant`
- **Homie v5**: `homie`
- **Homie v3/v4**: `homie`
- **Versions**: v3, v4 and v5 enabled
- **Subscriptions**: enabled
- **Boolean mapping**: `Auto`

Use `Auto` when you are not sure. It maps obvious lights and fans from Homie
names/types, then falls back to `switch` for generic commandable booleans.
Read-only booleans are always `binary_sensor`.

## What Gets Discovered

The mapper uses Homie metadata first:

- read-only booleans become `binary_sensor`;
- commandable booleans become `switch`, `light` or `fan`;
- commandable numbers become `number`;
- commandable enums become `select` when options are available;
- commandable strings and similar values become `text`;
- read-only values become `sensor`;
- Homie lifecycle and optional v5 attributes become diagnostic entities.

The node is conservative. It will not invent `climate`, `cover`, `lock`,
`vacuum`, alarm panels or other complex Home Assistant domains from generic
Homie metadata alone. Use overrides when you know the real device semantics.

## Friendly Overrides

Start without overrides. Add them only when Home Assistant needs better names,
stable historical IDs, a different platform for one property or advanced MQTT
discovery fields.

The most common pattern is a device with many nodes, each exposing a boolean
`state` property. This example maps named `state` entities to lights, except one
fan:

```jsonc
{
  // Shared identity for discovered Home Assistant devices.
  "deviceDefaults": {
    // Generates predictable device discovery object ids.
    "objectId": "home_{deviceId}",

    // Keeps the Home Assistant device identity stable.
    "identifiers": ["homie:{baseTopic}"],
  },

  // Shortcut: listed node/state entities are lights by default.
  "namedNodeState": {
    "platform": "light",
    "objectId": "home_{deviceId}_{nodeId}",
  },

  // Device-specific names and exceptions.
  "devices": {
    "homie/5/kitchen-board": {
      "name": "Kitchen board",
      "nodeNames": {
        "ceiling": "Ceiling light",
        "extractor": {
          "name": "Extractor fan",
          "platform": "fan",
          "icon": "mdi:fan",
        },
      },
    },
  },
}
```

The editor field accepts strict JSON, not JSON with comments. Use the commented
example to understand the shape, then paste a comment-free version:

```json
{
  "deviceDefaults": {
    "objectId": "home_{deviceId}",
    "identifiers": ["homie:{baseTopic}"]
  },
  "namedNodeState": {
    "platform": "light",
    "objectId": "home_{deviceId}_{nodeId}"
  },
  "devices": {
    "homie/5/kitchen-board": {
      "name": "Kitchen board",
      "nodeNames": {
        "ceiling": "Ceiling light",
        "extractor": {
          "name": "Extractor fan",
          "platform": "fan",
          "icon": "mdi:fan"
        }
      }
    }
  }
}
```

Exact device, node and property overrides always win over generic rules. That
lets you set a broad default for a whole fleet, then make one entity a fan,
switch, renamed sensor or disabled diagnostic without fighting the global
configuration.

## Documentation

The full documentation map lives in
[DOCS.md](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/blob/main/DOCS.md).
Start there for Node-RED wiring, dynamic subscriptions, entity mapping,
overrides and Homie compatibility.

## Core Package

This package wraps
[`homie-home-assistant-discovery`](https://github.com/labodj/homie-home-assistant-discovery).
The shared core owns Homie parsing and Home Assistant mapping. This Node-RED
package owns the editor UI, runtime status, diagnostics and Node-RED message
wiring.

## Local Development

```bash
npm ci
npm run check
```

For sibling-repository development, keep the core
`homie-home-assistant-discovery` package built locally before running the
wrapper checks. Published installs resolve the same dependency from npm.

## License

Apache-2.0. See
[LICENSE](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/blob/main/LICENSE).
