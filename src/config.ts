import {
  validateDiscoveryOverrides,
  type DiscoveryOverrideConfig,
} from "homie-home-assistant-discovery";

import type { HomieHaDiscoveryNodeDef, MqttSubscriptionMessage } from "./types";

const MQTT_WILDCARD_PATTERN = /[+#]/;

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
  return normalized;
};

const normalizeTopicPrefix = (value: string, fieldName: string): string => {
  const normalized = normalizeRequiredString(value, fieldName);
  if (MQTT_WILDCARD_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must not contain MQTT wildcards.`);
  }
  if (normalized.startsWith("/") || normalized.endsWith("/")) {
    throw new Error(`${fieldName} must not start or end with '/'.`);
  }
  if (normalized.split("/").some((segment) => segment.length === 0)) {
    throw new Error(`${fieldName} must not contain empty MQTT topic segments.`);
  }
  return normalized;
};

const normalizeCommandableBooleanPlatform = (
  value: unknown,
): HomieHaDiscoveryNodeDef["defaultCommandableBooleanPlatform"] => {
  if (value === undefined || value === null || value === "") {
    return "auto";
  }
  if (value === "auto" || value === "switch" || value === "light" || value === "fan") {
    return value;
  }
  throw new Error("Default Commandable Boolean Platform must be auto, switch, light or fan.");
};

const topicPrefixCovers = (coveringPrefix: string, coveredPrefix: string): boolean =>
  coveredPrefix === coveringPrefix || coveredPrefix.startsWith(`${coveringPrefix}/`);

export const normalizeNodeConfig = (config: HomieHaDiscoveryNodeDef): HomieHaDiscoveryNodeDef => {
  const normalized = {
    ...config,
    name: config.name?.trim() ?? "",
    discoveryPrefix: normalizeTopicPrefix(config.discoveryPrefix, "Discovery Prefix"),
    idPrefix: normalizeRequiredString(config.idPrefix || "homie", "ID Prefix"),
    homieDomain: normalizeTopicPrefix(config.homieDomain, "Homie v5 Domain"),
    legacyRoot: normalizeTopicPrefix(config.legacyRoot, "Legacy Homie Root"),
    enableV3: config.enableV3 !== false,
    enableV4: config.enableV4 !== false,
    enableV5: config.enableV5 !== false,
    emitSubscriptions: config.emitSubscriptions !== false,
    includeStateSensor: config.includeStateSensor !== false,
    includeAttributeDiagnostics: config.includeAttributeDiagnostics !== false,
    defaultCommandableBooleanPlatform: normalizeCommandableBooleanPlatform(
      config.defaultCommandableBooleanPlatform,
    ),
    manufacturer: normalizeRequiredString(config.manufacturer || "Homie", "Manufacturer"),
    model: normalizeRequiredString(config.model || "Homie MQTT Device", "Model"),
    overridesJson: config.overridesJson?.trim() ?? "",
  };

  if (!normalized.enableV3 && !normalized.enableV4 && !normalized.enableV5) {
    throw new Error("At least one Homie version must be enabled.");
  }

  return normalized;
};

export const parseDiscoveryOverridesJson = (value: string): DiscoveryOverrideConfig | undefined => {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Discovery overrides JSON is invalid: ${message}`, { cause: error });
  }

  return validateDiscoveryOverrides(parsed);
};

export const buildSubscriptionMessages = (
  config: HomieHaDiscoveryNodeDef,
): MqttSubscriptionMessage[] => {
  const topics = new Set<string>();
  const hasLegacy = config.enableV3 || config.enableV4;
  const legacyCoversV5 = hasLegacy && topicPrefixCovers(config.legacyRoot, config.homieDomain);

  if (config.enableV5 && !legacyCoversV5) {
    if (config.includeAttributeDiagnostics) {
      topics.add(`${config.homieDomain}/5/+/#`);
    } else {
      topics.add(`${config.homieDomain}/5/+/$state`);
      topics.add(`${config.homieDomain}/5/+/$description`);
    }
  }

  if (hasLegacy) {
    topics.add(`${config.legacyRoot}/#`);
  }

  const sortedTopics = Array.from(topics).sort((left, right) => left.localeCompare(right));
  return [
    {
      action: "unsubscribe",
      topic: true,
    },
    ...(sortedTopics.length > 0
      ? [
          {
            action: "subscribe" as const,
            topic: sortedTopics.map((topic) => ({ topic, qos: 1 as const })),
          },
        ]
      : []),
  ];
};

export const shouldProcessMessage = (
  config: HomieHaDiscoveryNodeDef,
  topic: string,
  payload: unknown,
): boolean => {
  if (topic.startsWith(`${config.homieDomain}/5/`)) {
    return config.enableV5;
  }

  if (!topic.startsWith(`${config.legacyRoot}/`)) {
    return false;
  }

  if (typeof payload === "string") {
    if (payload.startsWith("3.")) {
      return config.enableV3;
    }
    if (payload.startsWith("4.")) {
      return config.enableV4;
    }
  }

  return config.enableV3 || config.enableV4;
};
