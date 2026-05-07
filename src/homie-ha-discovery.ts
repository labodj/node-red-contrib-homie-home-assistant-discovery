import { HomieHaDiscoveryBridge } from "homie-home-assistant-discovery";
import type { DiscoveryMessage, HomieMajorVersion } from "homie-home-assistant-discovery";
import type { Node, NodeAPI, NodeMessage } from "node-red";

import {
  buildSubscriptionMessages,
  normalizeNodeConfig,
  parseDiscoveryOverridesJson,
  shouldProcessMessage,
} from "./config";
import { Output } from "./types";
import type { HomieHaDiscoveryNodeDef, MqttSubscriptionMessage } from "./types";
import { PACKAGE_VERSION } from "./version";

interface OutputMessages {
  [Output.Discovery]?: NodeMessage | NodeMessage[];
  [Output.Subscriptions]?: MqttSubscriptionMessage | MqttSubscriptionMessage[];
  [Output.Diagnostics]?: NodeMessage | NodeMessage[];
  [Output.Debug]?: NodeMessage | NodeMessage[];
}

const DISCOVERY_FLUSH_DELAY_MS = 250;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRemovalTransition = (message: DiscoveryMessage): boolean => {
  if (!isObjectRecord(message.payload)) {
    return false;
  }

  const components = message.payload.components;
  if (!isObjectRecord(components)) {
    return false;
  }

  return Object.values(components).some((component) => {
    if (!isObjectRecord(component)) {
      return false;
    }

    const keys = Object.keys(component);
    return keys.length === 1 && keys[0] === "platform";
  });
};

const canCoalesceDiscoveryMessage = (message: DiscoveryMessage): boolean =>
  message.payload !== "" && !isRemovalTransition(message);

export class HomieHaDiscoveryNode {
  private readonly node: Node;
  private readonly config: HomieHaDiscoveryNodeDef;
  private readonly bridge: HomieHaDiscoveryBridge;
  private initialSubscriptionHandle: NodeJS.Immediate | null = null;
  private discoveryFlushHandle: NodeJS.Timeout | null = null;
  private readonly pendingDiscoveryMessages: DiscoveryMessage[] = [];
  private discoveryCount = 0;

  public constructor(node: Node, config: HomieHaDiscoveryNodeDef) {
    this.node = node;
    this.config = normalizeNodeConfig(config);
    const overrides = parseDiscoveryOverridesJson(this.config.overridesJson);
    this.bridge = new HomieHaDiscoveryBridge({
      discoveryPrefix: this.config.discoveryPrefix,
      idPrefix: this.config.idPrefix,
      homieDomain: this.config.homieDomain,
      legacyRoot: this.config.legacyRoot,
      enabledVersions: this.getEnabledVersions(),
      includeStateSensor: this.config.includeStateSensor,
      includeAttributeDiagnostics: this.config.includeAttributeDiagnostics,
      defaultCommandableBooleanPlatform: this.config.defaultCommandableBooleanPlatform,
      manufacturer: this.config.manufacturer,
      model: this.config.model,
      overrides,
      origin: {
        name: "node-red-contrib-homie-home-assistant-discovery",
        sw_version: PACKAGE_VERSION,
        support_url: "https://github.com/labodj/node-red-contrib-homie-home-assistant-discovery",
      },
    });

    this.registerEventHandlers();
    this.scheduleInitialSubscriptions();
    this.updateStatus("ready");
  }

  private registerEventHandlers(): void {
    this.node.on("input", (msg, _send, done) => {
      try {
        this.handleInput(msg);
        done();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.node.error(message, msg);
        done(error instanceof Error ? error : new Error(message));
      }
    });

    this.node.on("close", (done: () => void) => {
      if (this.initialSubscriptionHandle) {
        clearImmediate(this.initialSubscriptionHandle);
        this.initialSubscriptionHandle = null;
      }
      this.flushDiscoveryMessages();
      done();
    });
  }

  private scheduleInitialSubscriptions(): void {
    this.initialSubscriptionHandle = setImmediate(() => {
      this.initialSubscriptionHandle = null;
      this.emitInitialSubscriptions();
    });
  }

  private emitInitialSubscriptions(): void {
    if (!this.config.emitSubscriptions) {
      return;
    }

    const subscriptions = buildSubscriptionMessages(this.config);
    this.send({
      [Output.Subscriptions]: subscriptions.map((message) => ({ ...message })),
    });
  }

  private getEnabledVersions(): HomieMajorVersion[] {
    const versions: HomieMajorVersion[] = [];
    if (this.config.enableV3) versions.push(3);
    if (this.config.enableV4) versions.push(4);
    if (this.config.enableV5) versions.push(5);
    return versions;
  }

  private handleInput(msg: NodeMessage): void {
    if (typeof msg.topic !== "string" || msg.topic.trim().length === 0) {
      this.emitDiagnostics("warning", "Ignored message without a valid MQTT topic.");
      return;
    }

    const payload = this.normalizePayload(msg.payload);
    if (payload === undefined) {
      this.emitDiagnostics(
        "warning",
        `Ignored topic '${msg.topic}' because payload cannot be converted to MQTT text.`,
      );
      return;
    }

    if (!shouldProcessMessage(this.config, msg.topic, msg.payload)) {
      return;
    }

    const result = this.bridge.ingest({
      topic: msg.topic,
      payload,
      retain: (msg as { retain?: unknown }).retain === true,
    });

    for (const warning of result.warnings) {
      this.node.warn(warning);
    }
    for (const log of result.logs) {
      this.node.debug(log);
    }

    const output: OutputMessages = {};
    if (result.messages.length > 0) {
      this.queueDiscoveryMessages(result.messages);
    }

    if (result.warnings.length > 0 || result.logs.length > 0) {
      output[Output.Diagnostics] = {
        payload: {
          warnings: result.warnings,
          logs: result.logs,
        },
      };
    }

    output[Output.Debug] = msg;
    this.send(output);
  }

  private queueDiscoveryMessages(messages: DiscoveryMessage[]): void {
    for (const message of messages) {
      if (!canCoalesceDiscoveryMessage(message)) {
        this.pendingDiscoveryMessages.push(message);
        continue;
      }

      const existingIndex = this.findPendingCoalescibleMessageIndex(message.topic);
      if (existingIndex >= 0) {
        this.pendingDiscoveryMessages[existingIndex] = message;
      } else {
        this.pendingDiscoveryMessages.push(message);
      }
    }

    this.scheduleDiscoveryFlush();
  }

  private findPendingCoalescibleMessageIndex(topic: string): number {
    for (let index = this.pendingDiscoveryMessages.length - 1; index >= 0; index--) {
      const pending = this.pendingDiscoveryMessages[index];
      if (pending && pending.topic === topic && canCoalesceDiscoveryMessage(pending)) {
        return index;
      }
    }

    return -1;
  }

  private scheduleDiscoveryFlush(): void {
    if (this.discoveryFlushHandle) {
      clearTimeout(this.discoveryFlushHandle);
    }

    this.discoveryFlushHandle = setTimeout(() => {
      this.discoveryFlushHandle = null;
      this.flushDiscoveryMessages();
    }, DISCOVERY_FLUSH_DELAY_MS);
  }

  private flushDiscoveryMessages(): void {
    if (this.discoveryFlushHandle) {
      clearTimeout(this.discoveryFlushHandle);
      this.discoveryFlushHandle = null;
    }

    if (this.pendingDiscoveryMessages.length === 0) {
      return;
    }

    const messages = this.pendingDiscoveryMessages.splice(0);
    this.discoveryCount += messages.length;
    this.send({
      [Output.Discovery]: messages.map((message) => this.toNodeMessage(message)),
    });
    this.updateStatus(`published ${this.discoveryCount}`);
  }

  private normalizePayload(payload: unknown): string | Buffer | Uint8Array | undefined {
    if (typeof payload === "string" || Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      return payload;
    }

    if (typeof payload === "number" || typeof payload === "boolean") {
      return String(payload);
    }

    if (payload && typeof payload === "object") {
      return JSON.stringify(payload);
    }

    return undefined;
  }

  private toNodeMessage(message: DiscoveryMessage): NodeMessage {
    return {
      topic: message.topic,
      payload: message.payload,
      qos: message.qos,
      retain: message.retain,
    };
  }

  private emitDiagnostics(level: "warning" | "info", message: string): void {
    if (level === "warning") {
      this.node.warn(message);
    } else {
      this.node.debug(message);
    }

    this.send({
      [Output.Diagnostics]: {
        payload: {
          level,
          message,
        },
      },
    });
  }

  private updateStatus(text: string): void {
    this.node.status({ fill: "green", shape: "dot", text });
  }

  private send(messages: OutputMessages): void {
    // Output order is the Node-RED contract. Keep it stable even when some outputs
    // are empty, otherwise existing flows would receive messages on the wrong wire.
    const outputArray = Array<
      NodeMessage | NodeMessage[] | MqttSubscriptionMessage | MqttSubscriptionMessage[] | null
    >(4).fill(null);

    outputArray[Output.Discovery] = messages[Output.Discovery] ?? null;
    outputArray[Output.Subscriptions] = messages[Output.Subscriptions] ?? null;
    outputArray[Output.Diagnostics] = messages[Output.Diagnostics] ?? null;
    outputArray[Output.Debug] = messages[Output.Debug] ?? null;

    if (outputArray.some((message) => message !== null)) {
      this.node.send(outputArray as unknown as NodeMessage[]);
    }
  }
}

const nodeRedModule = function registerHomieHaDiscoveryNode(RED: NodeAPI) {
  function HomieHaDiscoveryNodeWrapper(this: Node, config: HomieHaDiscoveryNodeDef) {
    RED.nodes.createNode(this, config);
    try {
      new HomieHaDiscoveryNode(this, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(`Invalid node configuration: ${message}`);
      this.status({ fill: "red", shape: "ring", text: "config error" });
    }
  }

  RED.nodes.registerType("homie-ha-discovery", HomieHaDiscoveryNodeWrapper);
};

module.exports = Object.assign(nodeRedModule, { HomieHaDiscoveryNode, Output });
