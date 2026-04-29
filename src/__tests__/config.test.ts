import {
  buildSubscriptionMessages,
  normalizeNodeConfig,
  parseDiscoveryOverridesJson,
  shouldProcessMessage,
} from "../config";
import type { HomieHaDiscoveryNodeDef } from "../types";

const baseConfig: HomieHaDiscoveryNodeDef = {
  id: "node",
  type: "homie-ha-discovery",
  z: "flow",
  name: "",
  discoveryPrefix: "homeassistant",
  idPrefix: "homie",
  homieDomain: "homie",
  legacyRoot: "homie",
  enableV3: true,
  enableV4: true,
  enableV5: true,
  emitSubscriptions: true,
  includeStateSensor: true,
  includeAttributeDiagnostics: true,
  defaultCommandableBooleanPlatform: "auto",
  manufacturer: "Homie",
  model: "Homie MQTT Device",
  overridesJson: "",
};

describe("node config helpers", () => {
  it("builds dynamic subscription messages", () => {
    const config = normalizeNodeConfig(baseConfig);

    expect(buildSubscriptionMessages(config)).toEqual([
      { action: "unsubscribe", topic: true },
      {
        action: "subscribe",
        topic: [{ topic: "homie/#", qos: 1 }],
      },
    ]);
  });

  it("keeps separate v5 subscriptions when the legacy root does not cover the v5 domain", () => {
    const config = normalizeNodeConfig({
      ...baseConfig,
      legacyRoot: "legacy",
      homieDomain: "homie",
    });

    expect(buildSubscriptionMessages(config)).toEqual([
      { action: "unsubscribe", topic: true },
      {
        action: "subscribe",
        topic: [
          { topic: "homie/5/+/#", qos: 1 },
          { topic: "legacy/#", qos: 1 },
        ],
      },
    ]);
  });

  it("can keep v5 subscriptions narrow when attribute diagnostics are disabled", () => {
    const config = normalizeNodeConfig({
      ...baseConfig,
      includeAttributeDiagnostics: false,
      enableV3: false,
      enableV4: false,
    });

    expect(buildSubscriptionMessages(config)).toEqual([
      { action: "unsubscribe", topic: true },
      {
        action: "subscribe",
        topic: [
          { topic: "homie/5/+/$description", qos: 1 },
          { topic: "homie/5/+/$state", qos: 1 },
        ],
      },
    ]);
  });

  it("validates concrete topic prefixes", () => {
    expect(() =>
      normalizeNodeConfig({
        ...baseConfig,
        discoveryPrefix: "homeassistant/#",
      }),
    ).toThrow(/must not contain MQTT wildcards/);
    expect(() =>
      normalizeNodeConfig({
        ...baseConfig,
        homieDomain: "/homie",
      }),
    ).toThrow(/must not start or end/);
    expect(() =>
      normalizeNodeConfig({
        ...baseConfig,
        legacyRoot: "homie//legacy",
      }),
    ).toThrow(/empty MQTT topic segments/);
    expect(() =>
      normalizeNodeConfig({
        ...baseConfig,
        discoveryPrefix: " ",
      }),
    ).toThrow(/cannot be empty/);
  });

  it("normalizes the Home Assistant id prefix", () => {
    expect(normalizeNodeConfig({ ...baseConfig, idPrefix: " fleet " }).idPrefix).toBe("fleet");
    expect(normalizeNodeConfig({ ...baseConfig, idPrefix: "" }).idPrefix).toBe("homie");
  });

  it("normalizes optional labels and falls back to public defaults", () => {
    const config = normalizeNodeConfig({
      ...baseConfig,
      name: "  Kitchen discovery  ",
      manufacturer: "",
      model: "",
    });

    expect(config.name).toBe("Kitchen discovery");
    expect(config.manufacturer).toBe("Homie");
    expect(config.model).toBe("Homie MQTT Device");
  });

  it("defaults settable boolean mapping to automatic semantics", () => {
    const withoutBooleanMode: Partial<HomieHaDiscoveryNodeDef> = { ...baseConfig };
    delete withoutBooleanMode.defaultCommandableBooleanPlatform;
    expect(
      normalizeNodeConfig(withoutBooleanMode as HomieHaDiscoveryNodeDef)
        .defaultCommandableBooleanPlatform,
    ).toBe("auto");
  });

  it("honors enabled Homie versions", () => {
    const config = normalizeNodeConfig({
      ...baseConfig,
      enableV3: false,
      enableV4: true,
      enableV5: false,
    });

    expect(shouldProcessMessage(config, "homie/5/kitchen/$description", "{}")).toBe(false);
    expect(shouldProcessMessage(config, "homie/legacy/$homie", "3.0.1")).toBe(false);
    expect(shouldProcessMessage(config, "homie/legacy/$homie", "4.0.0")).toBe(true);
  });

  it("rejects configurations with all Homie versions disabled", () => {
    expect(() =>
      normalizeNodeConfig({
        ...baseConfig,
        enableV3: false,
        enableV4: false,
        enableV5: false,
      }),
    ).toThrow(/At least one Homie version/);
  });

  it("parses optional discovery overrides JSON", () => {
    expect(parseDiscoveryOverridesJson("")).toBeUndefined();
    expect(
      parseDiscoveryOverridesJson(
        JSON.stringify({
          deviceDefaults: {
            objectId: "acme_{deviceId}",
          },
          namedNodeState: {
            platform: "light",
            objectId: "acme_{deviceId}_{nodeId}",
          },
          devices: {
            kitchen: {
              nodeNames: {
                relay: "Kitchen Ceiling",
                fan: {
                  name: "Extractor Fan",
                  platform: "fan",
                },
              },
            },
          },
        }),
      ),
    ).toEqual({
      deviceDefaults: {
        objectId: "acme_{deviceId}",
      },
      namedNodeState: {
        platform: "light",
        objectId: "acme_{deviceId}_{nodeId}",
      },
      devices: {
        kitchen: {
          nodeNames: {
            relay: "Kitchen Ceiling",
            fan: "Extractor Fan",
          },
          nodes: {
            relay: {
              name: "Kitchen Ceiling",
            },
            fan: {
              name: "Extractor Fan",
              properties: {
                state: {
                  name: "Extractor Fan",
                  platform: "fan",
                },
              },
            },
          },
        },
      },
    });
    expect(
      parseDiscoveryOverridesJson(
        JSON.stringify({
          devices: {
            kitchen: {
              properties: {
                "diagnostics/stats-mqtt-inbound-dropped": {
                  name: "MQTT Dropped Messages",
                  objectId: "acme_kitchen_mqtt_dropped",
                  stateClass: "total_increasing",
                  ha: {
                    availability: [{ topic: "homie/5/kitchen/$state" }],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toEqual({
      devices: {
        kitchen: {
          properties: {
            "diagnostics/stats-mqtt-inbound-dropped": {
              name: "MQTT Dropped Messages",
              objectId: "acme_kitchen_mqtt_dropped",
              stateClass: "total_increasing",
              ha: {
                availability: [{ topic: "homie/5/kitchen/$state" }],
              },
            },
          },
        },
      },
    });
    expect(() => parseDiscoveryOverridesJson("[1]")).toThrow(/must be an object/);
    expect(() =>
      parseDiscoveryOverridesJson(
        JSON.stringify({
          devices: {
            kitchen: {
              properties: {
                "relay/state": {
                  platform: "cover",
                },
              },
            },
          },
        }),
      ),
    ).toThrow(/supported Home Assistant platform/);
  });
});
