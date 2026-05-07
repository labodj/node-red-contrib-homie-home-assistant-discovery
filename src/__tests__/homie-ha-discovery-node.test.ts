import { HomieHaDiscoveryNode } from "../homie-ha-discovery";
import { Output } from "../types";
import type { HomieHaDiscoveryNodeDef } from "../types";

type InputListener = (
  msg: Record<string, unknown>,
  send: unknown,
  done: (error?: Error) => void,
) => void;

type CloseListener = (done: () => void) => void;

class FakeNode {
  public sent: unknown[] = [];
  public warnings: string[] = [];
  public logs: string[] = [];
  public debugMessages: string[] = [];
  public errors: string[] = [];
  public statuses: unknown[] = [];
  private inputListener: InputListener | null = null;
  private closeListener: CloseListener | null = null;

  public on(event: "input", listener: InputListener): void;
  public on(event: "close", listener: CloseListener): void;
  public on(event: "input" | "close", listener: InputListener | CloseListener): void {
    if (event === "input") {
      this.inputListener = listener as InputListener;
    } else {
      this.closeListener = listener as CloseListener;
    }
  }

  public send(message: unknown): void {
    this.sent.push(message);
  }

  public warn(message: string): void {
    this.warnings.push(message);
  }

  public log(message: string): void {
    this.logs.push(message);
  }

  public debug(message: string): void {
    this.debugMessages.push(message);
  }

  public error(message: string): void {
    this.errors.push(message);
  }

  public status(value: unknown): void {
    this.statuses.push(value);
  }

  public emitInput(msg: Record<string, unknown>): Error | undefined {
    let doneError: Error | undefined;
    this.inputListener?.(msg, undefined, (error) => {
      doneError = error;
    });
    return doneError;
  }

  public emitClose(): void {
    this.closeListener?.(() => undefined);
  }
}

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
  emitSubscriptions: false,
  includeStateSensor: true,
  includeAttributeDiagnostics: true,
  defaultCommandableBooleanPlatform: "auto",
  manufacturer: "Homie",
  model: "Homie MQTT Device",
  overridesJson: "",
};

const buildDescription = (): string =>
  JSON.stringify({
    homie: "5.0",
    version: 1,
    name: "Kitchen",
    nodes: {
      relay: {
        properties: {
          state: {
            datatype: "boolean",
            settable: true,
          },
        },
      },
    },
  });

describe("HomieHaDiscoveryNode runtime", () => {
  it("registers with Node-RED and reports invalid editor configuration", () => {
    const registerNode: (red: unknown) => void = jest.requireActual("../homie-ha-discovery");
    let registeredConstructor:
      | ((this: FakeNode, config: HomieHaDiscoveryNodeDef) => void)
      | undefined;
    const red = {
      nodes: {
        createNode: jest.fn(),
        registerType: jest.fn((_type: string, constructor: typeof registeredConstructor) => {
          registeredConstructor = constructor;
        }),
      },
    };
    registerNode(red);

    const node = new FakeNode();
    registeredConstructor?.call(node, {
      ...baseConfig,
      discoveryPrefix: "homeassistant/#",
    });

    expect(red.nodes.registerType).toHaveBeenCalledWith("homie-ha-discovery", expect.any(Function));
    expect(node.errors).toEqual([
      "Invalid node configuration: Discovery Prefix must not contain MQTT wildcards.",
    ]);
    expect(node.statuses.at(-1)).toEqual({
      fill: "red",
      shape: "ring",
      text: "config error",
    });
  });

  it("emits initial dynamic subscription messages when enabled", async () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, {
      ...baseConfig,
      emitSubscriptions: true,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.sent[0]).toEqual([
      null,
      null,
      null,
      [
        { action: "unsubscribe", topic: true },
        {
          action: "subscribe",
          topic: [{ topic: "homie/#", qos: 1 }],
        },
      ],
    ]);
  });

  it("does not emit dynamic subscription messages when disabled", async () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.sent).toEqual([]);
  });

  it("cancels scheduled dynamic subscriptions when the node closes immediately", async () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, {
      ...baseConfig,
      emitSubscriptions: true,
    });

    node.emitClose();
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.sent).toEqual([]);
  });

  it("converts Homie input messages into Home Assistant discovery outputs", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, baseConfig);

    const error = node.emitInput({
      topic: "homie/5/kitchen/$description",
      payload: buildDescription(),
      retain: true,
    });

    expect(error).toBeUndefined();
    const output = node.sent.at(-1) as unknown[];
    expect(output[Output.Discovery]).toEqual([
      expect.objectContaining({
        topic: "homeassistant/device/homie_homie_5_kitchen/config",
        retain: true,
      }),
      expect.objectContaining({
        topic: "homeassistant/sensor/homie_homie_5_kitchen_homie_state/config",
        retain: true,
      }),
    ]);
    expect(output[Output.Diagnostics]).toEqual({
      payload: {
        warnings: [],
        logs: ["Generated Home Assistant discovery for 'kitchen'."],
      },
    });
    expect(node.logs).toEqual([]);
    expect(node.debugMessages).toEqual(["Generated Home Assistant discovery for 'kitchen'."]);
    expect(output[Output.Debug]).toEqual(
      expect.objectContaining({
        topic: "homie/5/kitchen/$description",
      }),
    );
    expect(node.statuses.at(-1)).toEqual({ fill: "green", shape: "dot", text: "published 2" });
  });

  it("accepts auto-detected JSON object payloads from Node-RED MQTT input nodes", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, baseConfig);

    const error = node.emitInput({
      topic: "homie/5/kitchen/$description",
      payload: JSON.parse(buildDescription()),
      retain: true,
    });

    expect(error).toBeUndefined();
    const output = node.sent.at(-1) as unknown[];
    expect(output[Output.Discovery]).toEqual([
      expect.objectContaining({
        topic: "homeassistant/device/homie_homie_5_kitchen/config",
      }),
      expect.objectContaining({
        topic: "homeassistant/sensor/homie_homie_5_kitchen_homie_state/config",
      }),
    ]);
  });

  it("handles ignored topics and scalar MQTT payloads without shifting outputs", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, {
      ...baseConfig,
      enableV5: false,
    });

    expect(node.emitInput({ payload: "missing topic" })).toBeUndefined();
    expect(node.warnings.at(-1)).toBe("Ignored message without a valid MQTT topic.");
    expect(node.sent.at(-1)).toEqual([
      null,
      {
        payload: {
          level: "warning",
          message: "Ignored message without a valid MQTT topic.",
        },
      },
      null,
      null,
    ]);

    expect(
      node.emitInput({
        topic: "homie/5/kitchen/$state",
        payload: true,
      }),
    ).toBeUndefined();
    expect(node.sent).toHaveLength(1);
  });

  it("applies compact override JSON from the editor configuration", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, {
      ...baseConfig,
      idPrefix: "acme",
      overridesJson: JSON.stringify({
        deviceDefaults: {
          objectId: "acme_{deviceId}",
        },
        namedNodeState: {
          exclusive: true,
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
    });

    const error = node.emitInput({
      topic: "homie/5/kitchen/$description",
      payload: JSON.stringify({
        homie: "5.0",
        version: 1,
        nodes: {
          relay: {
            properties: {
              state: { datatype: "boolean", settable: true },
            },
          },
          fan: {
            properties: {
              state: { datatype: "boolean", settable: true },
            },
          },
          spare: {
            properties: {
              state: { datatype: "boolean", settable: true },
            },
          },
        },
      }),
      retain: true,
    });

    expect(error).toBeUndefined();
    const output = node.sent.at(-1) as unknown[];
    expect(output[Output.Discovery]).toEqual([
      expect.objectContaining({
        topic: "homeassistant/device/acme_kitchen/config",
        payload: expect.objectContaining({
          components: expect.objectContaining({
            acme_kitchen_relay: expect.objectContaining({
              platform: "light",
              name: "Kitchen Ceiling",
            }),
            acme_kitchen_fan: expect.objectContaining({
              platform: "fan",
              name: "Extractor Fan",
            }),
          }),
        }),
      }),
      expect.objectContaining({
        topic: "homeassistant/sensor/acme_kitchen_homie_state/config",
      }),
    ]);
    const discoveryPayload = (output[Output.Discovery] as Array<{ payload: unknown }>)[0]
      ?.payload as { components: Record<string, unknown> };
    expect(discoveryPayload.components).not.toHaveProperty("acme_kitchen_spare_state");
  });

  it("emits diagnostics for invalid input payloads", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, baseConfig);

    node.emitInput({ topic: "homie/5/kitchen/$description", payload: null });

    expect(node.warnings).toEqual([
      "Ignored topic 'homie/5/kitchen/$description' because payload cannot be converted to MQTT text.",
    ]);
    const output = node.sent.at(-1) as unknown[];
    expect(output[Output.Diagnostics]).toEqual({
      payload: {
        level: "warning",
        message:
          "Ignored topic 'homie/5/kitchen/$description' because payload cannot be converted to MQTT text.",
      },
    });
  });

  it("forwards parser warnings from the core bridge", () => {
    const node = new FakeNode();
    new HomieHaDiscoveryNode(node as never, baseConfig);

    const error = node.emitInput({
      topic: "homie/5/kitchen/$description",
      payload: "{bad json",
      retain: true,
    });

    expect(error).toBeUndefined();
    expect(node.warnings[0]).toMatch(/not valid JSON/);
    const output = node.sent.at(-1) as unknown[];
    expect(output[Output.Diagnostics]).toEqual({
      payload: {
        warnings: [expect.stringMatching(/not valid JSON/)],
        logs: [],
      },
    });
    expect(output[Output.Debug]).toEqual(
      expect.objectContaining({
        topic: "homie/5/kitchen/$description",
      }),
    );
  });
});
