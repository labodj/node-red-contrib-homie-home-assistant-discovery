# Node-RED Contrib Homie Home Assistant Discovery

[![npm](https://img.shields.io/npm/v/node-red-contrib-homie-home-assistant-discovery.svg)](https://www.npmjs.com/package/node-red-contrib-homie-home-assistant-discovery)
[![Node-RED Library](https://img.shields.io/badge/Node--RED-Library-8f0000.svg)](https://flows.nodered.org/node/node-red-contrib-homie-home-assistant-discovery)
[![npm downloads](https://img.shields.io/npm/dm/node-red-contrib-homie-home-assistant-discovery.svg)](https://www.npmjs.com/package/node-red-contrib-homie-home-assistant-discovery)
[![CI](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/actions/workflows/ci.yaml)
[![License](https://img.shields.io/github/license/labodj/node-red-contrib-homie-home-assistant-discovery.svg)](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/blob/main/LICENSE)

Node-RED node that turns Homie MQTT devices into Home Assistant MQTT discovery
entities.

Drop it between a normal Node-RED `mqtt-in` node and `mqtt-out`: it reads Homie
metadata, emits retained Home Assistant discovery payloads, and can manage the
MQTT input subscription set automatically.

The node wraps the standalone
[`homie-home-assistant-discovery`](https://github.com/labodj/homie-home-assistant-discovery)
core. The Node-RED package owns the editor UI, status, diagnostics and wiring;
Homie parsing and Home Assistant mapping live in the shared core.

![Node-RED Homie Home Assistant Discovery flow](https://raw.githubusercontent.com/labodj/node-red-contrib-homie-home-assistant-discovery/main/images/node-usage.png)

## Start Here

- New users can install the node from the Node-RED Palette Manager and wire the
  [Recommended Flow](#recommended-flow).
- Advanced users should read [Overrides](#overrides) for precise entity
  platforms, names, icons and raw Home Assistant discovery metadata.
- The full mapping behavior lives in
  [Home Assistant discovery mapping](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOME_ASSISTANT_DISCOVERY.md).
- Exact Homie version coverage lives in
  [Homie compatibility](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOMIE_COMPATIBILITY.md).

## Key Features

- **Normal Node-RED MQTT wiring**: accepts messages from the built-in `mqtt-in`
  node and emits publish-ready messages for `mqtt-out`.
- **Dynamic subscription output**: can feed subscription control messages back to
  `mqtt-in`, keeping the MQTT input subscribed to the right Homie topics.
- **Homie v3.0.1, v4.0.0 and v5.x support**: inherited from the shared core
  package.
- **Safe default entity mapping**: every supported Homie datatype maps to a
  practical Home Assistant MQTT entity.
- **Granular overrides**: rules and exact device/property overrides cover entity
  platform, name, icon, object ID, payloads, units, diagnostics and advanced
  Home Assistant fields.
- **Extension-agnostic diagnostics**: optional discovery of observed Homie v5
  `$...` attribute topics as diagnostic entities.
- **Editor help built in**: common settings stay simple, advanced settings are
  available without turning the first configuration pass into a wall of options.

## Installation

Install from the Node-RED **Palette Manager**, or from your Node-RED user
directory:

```bash
npm install node-red-contrib-homie-home-assistant-discovery
```

Restart Node-RED after installation if your runtime does not reload palette
nodes automatically.

## Recommended Flow

Wire:

1. `mqtt-in` -> `homie-ha-discovery`
2. `homie-ha-discovery` output 1 -> `mqtt-out`
3. optionally `homie-ha-discovery` output 4 -> the same `mqtt-in`

Manual subscription is also fine. The broad setup is `homie/#`. Dynamic mode
emits the smallest non-overlapping subscription set for the enabled Homie
versions and configured roots.

Output 4 is intentionally the bottom port, so the dynamic subscription feedback
wire can return to the MQTT input without crossing the discovery, diagnostic and
debug wires in a typical left-to-right flow.

## Outputs

| Output | Name          | Meaning                                                    |
| ------ | ------------- | ---------------------------------------------------------- |
| 1      | Discovery     | Retained Home Assistant MQTT discovery messages.           |
| 2      | Diagnostics   | Warnings and logs from parsing and discovery generation.   |
| 3      | Debug         | Original input message passthrough for inspection/testing. |
| 4      | Subscriptions | MQTT subscription control messages for Node-RED `mqtt-in`. |

Discovery messages include `topic`, `payload`, `qos` and `retain`, ready to
wire directly into `mqtt-out`.

## Editor Model

The main section is enough for the common case:

- Home Assistant discovery prefix.
- Homie v5 domain.
- Homie v3/v4 root.
- Enabled Homie versions.
- Dynamic subscriptions.

Advanced sections expose generated ID prefix, manufacturer, model, diagnostic
state sensor, observed v5 attribute diagnostics, boolean mapping and JSON
overrides.

`Boolean mapping` is not an on/off toggle. The default `auto` mode maps common
Homie `light` and `fan` names/types to matching Home Assistant platforms and
uses `switch` when metadata is generic. Non-settable booleans are always
discovered as `binary_sensor`.

## Entity Mapping

The automatic mapper uses Homie metadata first and falls back conservatively:

- settable `boolean` properties become `light` or `fan` when Homie `type` /
  `name` metadata says so, otherwise `switch`
- read-only `boolean` properties become `binary_sensor`
- settable `enum` properties become `select`
- settable `integer`, `float` and `string` properties become `number` or `text`
- read-only numeric and text properties become `sensor`
- Homie v5 lifecycle state can be exposed as a diagnostic sensor
- observed non-operational Homie v5 attributes can be exposed as diagnostic
  entities

The node does not guess complex Home Assistant domains such as `climate`,
`cover`, `lock`, `vacuum` or `alarm_control_panel` from generic Homie metadata
alone. Use overrides when you know the device semantics.

## Overrides

The editor includes an optional JSON overrides field. Use ordered `rules` for
pattern-based mapping, `deviceDefaults` templates for shared identity
conventions and exact device/property overrides for exceptions.

Device keys may be the full Homie base topic (`homie/5/kitchen`) or the device
ID (`kitchen`). Advanced Home Assistant MQTT discovery fields that are not
modeled directly can be added with the validated `ha` object.

```json
{
  "deviceDefaults": {
    "objectId": "acme_{deviceId}",
    "identifiers": ["ACME_{deviceId}"]
  },
  "namedNodeState": {
    "platform": "light",
    "objectId": "acme_{deviceId}_{nodeId}"
  },
  "devices": {
    "homie/5/kitchen": {
      "name": "Kitchen Board",
      "nodeNames": {
        "relay": "Kitchen Ceiling",
        "fan": {
          "name": "Extractor Fan",
          "platform": "fan"
        }
      }
    }
  }
}
```

See
[Discovery overrides](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/OVERRIDES.md)
for the complete schema.

## Documentation

- [Node-RED usage](https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery/blob/main/docs/USAGE.md)
- [Entity mapping](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOME_ASSISTANT_DISCOVERY.md)
- [Discovery overrides](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/OVERRIDES.md)
- [Homie compatibility](https://github.com/labodj/homie-home-assistant-discovery/blob/main/docs/HOMIE_COMPATIBILITY.md)

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
