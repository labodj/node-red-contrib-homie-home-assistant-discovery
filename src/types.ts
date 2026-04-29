import type { NodeDef } from "node-red";

export interface HomieHaDiscoveryNodeDef extends NodeDef {
  name: string;
  discoveryPrefix: string;
  idPrefix: string;
  homieDomain: string;
  legacyRoot: string;
  enableV3: boolean;
  enableV4: boolean;
  enableV5: boolean;
  emitSubscriptions: boolean;
  includeStateSensor: boolean;
  includeAttributeDiagnostics: boolean;
  defaultCommandableBooleanPlatform: "auto" | "switch" | "light" | "fan";
  manufacturer: string;
  model: string;
  overridesJson: string;
}

export enum Output {
  Discovery = 0,
  Diagnostics = 1,
  Debug = 2,
  Subscriptions = 3,
}

export interface MqttSubscriptionMessage {
  action: "subscribe" | "unsubscribe";
  topic: string | Array<string | { topic: string; qos: 0 | 1 | 2 }> | true;
  qos?: 0 | 1 | 2;
}
