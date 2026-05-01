# Node-RED Usage

`node-red-contrib-homie-home-assistant-discovery` is the visual Node-RED wrapper
around the `homie-home-assistant-discovery` core package.

It receives MQTT messages from Node-RED's built-in `mqtt in` node and emits Home
Assistant discovery messages for Node-RED's built-in `mqtt out` node. The broker
connection, username, password, TLS certificates, MQTT v5 setting and reconnect
behavior all stay where Node-RED users expect them: in the MQTT broker
configuration node.

## Recommended Flow

![Node-RED Homie Home Assistant Discovery flow](https://raw.githubusercontent.com/labodj/node-red-contrib-homie-home-assistant-discovery/main/images/node-usage.png)

Wire the flow like this:

1. `mqtt in` -> `homie-ha-discovery`
2. `homie-ha-discovery` output 1 -> `mqtt out`
3. `homie-ha-discovery` output 4 -> the same `mqtt in` node, if you want dynamic
   subscriptions

The `mqtt out` node should publish to the same broker Home Assistant reads from.
The generated discovery messages are retained, so Home Assistant can rediscover
entities after a restart.

## Input Messages

Input messages should look like normal Node-RED MQTT messages.

```json
{
  "topic": "homie/5/kitchen-board/$description",
  "payload": "{\"homie\":\"5.0\",\"version\":1,\"nodes\":{...}}",
  "retain": true
}
```

`payload` may be a string, `Buffer`, `Uint8Array`, boolean, number or JSON
object. This works well with MQTT input nodes configured as `auto-detect`.

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

They can be wired directly into `mqtt out`.

## Dynamic Subscriptions

When dynamic subscriptions are enabled, the node tells `mqtt in` what Homie
topics to listen to. On deploy, it first clears the previous dynamic
subscriptions:

```json
{
  "action": "unsubscribe",
  "topic": true
}
```

Then it sends the subscriptions needed for the enabled Homie versions:

```json
{
  "action": "subscribe",
  "topic": [
    {
      "topic": "homie/#",
      "qos": 1
    }
  ]
}
```

If you prefer manual subscriptions, disable dynamic subscriptions and configure
the `mqtt in` topic yourself. The broad manual subscription is usually
`homie/#`.

The node avoids overlapping topic filters. When the legacy root does not cover
the v5 domain, it emits an additional v5 subscription. With attribute
diagnostics enabled that v5 subscription is broad, such as `homie/5/+/#`, so it
can observe extension-style `$...` attributes. With attribute diagnostics
disabled it uses narrower `$description` and `$state` filters.

## Editor Configuration

| Field                 | Default             | Meaning                                               |
| --------------------- | ------------------- | ----------------------------------------------------- |
| Home Assistant prefix | `homeassistant`     | Home Assistant MQTT discovery prefix.                 |
| ID prefix             | `homie`             | Prefix for generated discovery IDs and entity IDs.    |
| Homie v5              | `homie`             | Homie v5 topic domain.                                |
| Homie v3/v4           | `homie`             | Homie legacy topic root.                              |
| Versions              | all enabled         | Homie versions to process.                            |
| Boolean mapping       | `auto`              | Boolean fallback: `auto`, `switch`, `light`, `fan`.   |
| Manufacturer          | `Homie`             | Default Home Assistant manufacturer.                  |
| Model                 | `Homie MQTT Device` | Default Home Assistant model.                         |
| emit subscriptions    | enabled             | Emit Node-RED MQTT subscription messages.             |
| state sensor          | enabled             | Publish diagnostic Homie State sensor.                |
| attribute diagnostics | enabled             | Publish observed v5 `$...` attributes as diagnostics. |
| Overrides             | empty               | JSON discovery override configuration.                |

At least one Homie version must remain enabled. Invalid JSON in the overrides
field is rejected in the editor and again by the runtime constructor.

## Entity Mapping

The mapper uses Homie metadata first and falls back conservatively.

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

## Overrides Without Too Much JSON

Start from the shape that matches your device.

For a board where every useful entity is a node with a commandable boolean
`state` property:

```json
{
  "namedNodeState": {
    "platform": "light"
  },
  "devices": {
    "homie/5/kitchen-board": {
      "nodeNames": {
        "ceiling": "Ceiling light",
        "extractor": {
          "name": "Extractor fan",
          "platform": "fan"
        }
      }
    }
  }
}
```

For stable Home Assistant history, add object-id templates:

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
      "nodeNames": {
        "ceiling": "Ceiling light",
        "extractor": {
          "name": "Extractor fan",
          "platform": "fan"
        }
      }
    }
  }
}
```

For pattern-based mapping, use ordered rules. Later matching rules override
earlier matching rules, and exact device/node/property overrides win over all
generic rules.

```json
{
  "rules": [
    {
      "match": {
        "datatype": "boolean",
        "settable": true
      },
      "platform": "switch"
    },
    {
      "match": {
        "path": "lights/*"
      },
      "platform": "light"
    }
  ],
  "devices": {
    "homie/5/garden-board": {
      "properties": {
        "pump/state": {
          "platform": "switch",
          "name": "Fountain pump"
        }
      }
    }
  }
}
```

## Commented Override Example

The Node-RED editor accepts strict JSON, so do not paste comments into the
Overrides field. This commented `jsonc` block is only here to explain each line.

```jsonc
{
  // Shared identity for all devices.
  "deviceDefaults": {
    // Device discovery object id.
    "objectId": "home_{deviceId}",

    // Home Assistant device identifier.
    "identifiers": ["homie:{baseTopic}"],
  },

  // Shortcut for named commandable boolean node/state properties.
  "namedNodeState": {
    // Most listed node/state entities are lights.
    "platform": "light",

    // Entity object id template.
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

## Attribute Diagnostics

Observed v5 attribute diagnostics use a synthetic `diagnostics` node in override
matching. For example:

- `$implementation/ota/enabled` matches
  `diagnostics/implementation-ota-enabled`;
- `$stats/uptime` matches `diagnostics/stats-uptime`.

Core operational v5 attributes such as `$state`, `$description`, `$log` and
`$alert` are not emitted as diagnostic entities.

## Advanced Home Assistant Fields

When you need a Home Assistant MQTT discovery field that is not exposed as a
typed override, add it under `ha` with native Home Assistant keys. Managed
identity and routing keys such as `platform`, `unique_id`, `default_entity_id`,
`object_id`, `state_topic` and `command_topic` are rejected there; use the typed
override fields for those values.

The node does not infer Home Assistant domains that need semantics Homie core
does not provide, such as `climate`, `cover`, `lock`, `vacuum`, alarm panels,
water heaters, valves or scenes.

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
