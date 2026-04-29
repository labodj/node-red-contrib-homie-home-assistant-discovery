# Node-RED Usage

`node-red-contrib-homie-home-assistant-discovery` is a thin Node-RED adapter around the
standalone `homie-home-assistant-discovery` core.

It receives Homie MQTT messages from a Node-RED MQTT input node and emits Home
Assistant MQTT discovery messages ready for a Node-RED MQTT output node.

## Basic Flow

![Node-RED Homie Home Assistant Discovery flow](https://raw.githubusercontent.com/labodj/node-red-contrib-homie-home-assistant-discovery/main/images/node-usage.png)

Wire:

1. `mqtt-in` -> `homie-ha-discovery`
2. `homie-ha-discovery` output 1 -> `mqtt-out`
3. optionally `homie-ha-discovery` output 4 -> the same `mqtt-in` node

Output 4 emits dynamic subscription control messages. This lets the node tell
`mqtt-in` which Homie topics to subscribe to.

## Outputs

| Output | Name          | Payload                                          |
| ------ | ------------- | ------------------------------------------------ |
| 1      | Discovery     | Retained Home Assistant MQTT discovery messages. |
| 2      | Diagnostics   | Warnings and informational logs.                 |
| 3      | Debug         | Original input message passthrough.              |
| 4      | Subscriptions | Node-RED MQTT subscription control messages.     |

Discovery messages contain:

- `topic`
- `payload`
- `qos`
- `retain`

They can be wired directly into `mqtt-out`.

## Input Messages

Input messages must look like MQTT messages:

```json
{
  "topic": "homie/5/kitchen/$description",
  "payload": "{\"homie\":\"5.0\",\"version\":1,\"nodes\":{...}}",
  "retain": true
}
```

`payload` may be a string, `Buffer`, `Uint8Array`, boolean, number or JSON
object. This supports Node-RED MQTT input nodes configured with
`auto-detect`.

## Dynamic Subscriptions

When enabled, the node emits:

```json
{ "action": "unsubscribe", "topic": true }
```

followed by:

```json
{
  "action": "subscribe",
  "topic": [{ "topic": "homie/#", "qos": 1 }]
}
```

Disable dynamic subscriptions if you prefer to configure `mqtt-in` manually.
For manual setup, `homie/#` is the simplest broad subscription.

The node avoids overlapping topic filters. When the legacy root does not cover
the v5 domain, it emits an additional v5 subscription. With attribute
diagnostics enabled that v5 subscription is intentionally broad, such as
`homie/5/+/#`; with attribute diagnostics disabled it uses the narrower
`$description`/`$state` v5 filters.

## Editor Configuration

| Field                 | Default             | Meaning                                               |
| --------------------- | ------------------- | ----------------------------------------------------- |
| HA prefix             | `homeassistant`     | Home Assistant MQTT discovery prefix.                 |
| ID prefix             | `homie`             | Prefix for generated discovery IDs and entity IDs.    |
| Homie v5              | `homie`             | Homie v5 topic domain.                                |
| Homie v3/v4           | `homie`             | Homie legacy topic root.                              |
| Versions              | all enabled         | Homie versions to process.                            |
| Boolean mapping       | `auto`              | Boolean mapping: `auto`, `switch`, `light`, `fan`.    |
| Manufacturer          | `Homie`             | Default Home Assistant manufacturer.                  |
| Model                 | `Homie MQTT Device` | Default Home Assistant model.                         |
| emit subscriptions    | enabled             | Emit Node-RED MQTT subscription messages.             |
| state sensor          | enabled             | Publish diagnostic Homie State sensor.                |
| attribute diagnostics | enabled             | Publish observed v5 `$...` attributes as diagnostics. |
| Overrides             | empty               | JSON discovery override configuration.                |

The editor keeps the common fields in the first visible section. Home Assistant
identity and entity mapping options are available in collapsible advanced
sections.

At least one Homie version must remain enabled. Invalid JSON in the overrides
field is rejected in the editor and again by the runtime constructor.

## Entity Mapping

The mapper uses Homie metadata first and falls back conservatively. Homie
describes properties with datatype, format, unit, settable and retained
metadata; v5 can also carry node/property names and node types. Common settable
boolean lights and fans can therefore be discovered without overrides.

Home Assistant MQTT discovery supports many specialized component domains. This
node automatically emits only the platforms that can be inferred safely from
Homie metadata; richer domains require explicit semantics.

Automatic mapping:

| Homie property                                                                             | Home Assistant entity                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| non-settable `boolean`                                                                     | `binary_sensor`                                                                      |
| settable `boolean`                                                                         | `auto` semantic mapping, selected fallback, rule or override: `switch`/`light`/`fan` |
| settable `integer` / `float`                                                               | `number`                                                                             |
| settable `enum` with options                                                               | `select`                                                                             |
| settable `enum` without options                                                            | `text`                                                                               |
| settable `string`, `color`, `datetime`, `duration`, `json`                                 | `text`                                                                               |
| non-settable `integer`, `float`, `string`, `enum`, `color`, `datetime`, `duration`, `json` | `sensor`                                                                             |

Homie v3/v4 define `integer`, `float`, `boolean`, `string`, `enum` and
`color`. Homie v5 also defines `datetime`, `duration` and `json`. Homie v3
properties without `$datatype` are treated as `string`; Homie v4/v5 properties
need a datatype before discovery can be generated.

`Boolean mapping` is not an on/off toggle. The default `auto` mode maps common
Homie `light` and `fan` names/types to matching Home Assistant platforms and
uses `switch` when metadata is generic. Select `switch`, `light` or `fan` to
force that fallback globally.

Use `namedNodeState` for the common pattern where named Homie nodes expose a
settable boolean `state` property. When a fleet shares the same naming
convention, add `deviceDefaults` templates and keep per-device configuration to
compact `nodeNames` maps:

```json
{
  "deviceDefaults": {
    "objectId": "acme_{deviceId}",
    "identifiers": ["ACME_{deviceId}"],
    "manufacturer": "Acme"
  },
  "namedNodeState": {
    "platform": "light",
    "objectId": "acme_{deviceId}_{nodeId}"
  },
  "devices": {
    "homie/5/kitchen": {
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

Rules are applied in order and later matching rules override earlier matching
rules. `namedNodeState` is an easier shortcut for the common pattern where
named nodes expose a settable boolean `state`; exact device/node/property
overrides, including object entries in `nodeNames`, win over it. Supported
template tokens include `{baseTopic}`, `{deviceId}`, `{majorVersion}`, `{root}`,
`{rootSlug}`, `{nodeId}`, `{propertyId}`, `{path}`, `{nodeName}`, `{nodeType}`,
`{propertyName}`, `{deviceObjectId}`, `{platform}`, `{entityObjectId}` and
`{objectId}`. The `configuredNode` matcher remains available when custom rules
need to target nodes declared in `nodeNames`.

Use ordered `rules` for pattern-based mapping that cannot be expressed with the
shortcut, and exact overrides only where a specific property needs different
metadata:

```json
{
  "rules": [
    {
      "match": { "path": "lights/*", "datatype": "boolean", "settable": true },
      "platform": "light"
    }
  ],
  "devices": {
    "homie/5/kitchen": {
      "properties": {
        "pump/state": {
          "platform": "switch",
          "name": "Fountain Pump"
        }
      }
    }
  }
}
```

When replacing an existing discovery bridge, set `objectId` to preserve
`unique_id` and `defaultEntityId` to preserve the first Home Assistant entity
id, for example `light.kitchen_ceiling`.

Observed v5 attribute diagnostics use the synthetic `diagnostics` node in
override matching. For example, `$implementation/ota/enabled` matches
`diagnostics/implementation-ota-enabled`, and `$stats/uptime` matches
`diagnostics/stats-uptime`.
Core operational v5 attributes such as `$state`, `$description`, `$log` and
`$alert` are not emitted as diagnostic entities.

For fields that are not modeled directly by the override schema, advanced users
can add an `ha` object with native Home Assistant MQTT discovery keys. Managed
identity and routing keys such as `platform`, `unique_id`, `default_entity_id`,
`object_id`, `state_topic` and `command_topic` are rejected there; use the typed
override fields for those values.

The node does not infer Home Assistant domains that need semantics Homie core
does not provide, such as `climate`, `cover`, `lock`, `vacuum`, alarm panels,
water heaters, valves or scenes. Use exact overrides for metadata supported by
the core mapper, and keep domain-specific entities outside this bridge until a
stable Homie-to-Home-Assistant semantic convention exists for that domain.

## Overrides

The overrides field uses the same schema as the core package. See the core
`docs/OVERRIDES.md` document while developing locally.

Invalid override JSON fails node initialization with a configuration error.

## Diagnostics

Warnings are emitted when input cannot be used safely, for example:

- missing MQTT topic;
- payloads that cannot be converted to MQTT text;
- invalid Homie IDs;
- unsupported Homie datatypes;
- invalid override JSON.

The node status shows readiness and the number of discovery messages published
through output 1.

## Local Package Verification

```bash
npm run build
npm run verify:package
```

The verification script packs the companion core package and this Node-RED
package, installs both tarballs into a temporary consumer project and checks
that the runtime registration export and editor HTML are present. It never
publishes to npm.
