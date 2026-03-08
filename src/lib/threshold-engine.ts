/**
 * Centralized Thresholds Engine.
 * Evaluates numeric values against ordered threshold steps
 * and returns the appropriate colors for fill and text.
 */

export interface ThresholdStep {
  value: number;
  color: string;       // fill / background color
  textColor?: string;  // optional text color override
  label?: string;      // optional label (e.g. "Warning")
}

export interface ThresholdConfig {
  mode: "absolute" | "percentage";
  steps: ThresholdStep[];
}

export interface ThresholdResult {
  bgColor: string;
  textColor: string;
  label?: string;
  stepIndex: number;
}

const DEFAULT_BG = "transparent";
const DEFAULT_TEXT = "inherit";

/**
 * Evaluate a numeric value against threshold steps.
 * Steps are evaluated in ascending order — last matching step wins.
 */
export function evaluateThresholds(
  value: number | null | undefined,
  config: ThresholdConfig | undefined,
): ThresholdResult {
  if (value == null || !config || !config.steps.length) {
    return { bgColor: DEFAULT_BG, textColor: DEFAULT_TEXT, stepIndex: -1 };
  }

  // Sort steps ascending by value
  const sorted = [...config.steps].sort((a, b) => a.value - b.value);

  let matched: ThresholdStep | null = null;
  let matchedIdx = -1;

  for (let i = sorted.length - 1; i >= 0; i--) {
    if (value >= sorted[i].value) {
      matched = sorted[i];
      matchedIdx = i;
      break;
    }
  }

  if (!matched) {
    return { bgColor: DEFAULT_BG, textColor: DEFAULT_TEXT, stepIndex: -1 };
  }

  return {
    bgColor: matched.color,
    textColor: matched.textColor || DEFAULT_TEXT,
    label: matched.label,
    stepIndex: matchedIdx,
  };
}

/** Create a default threshold config with 3 steps (green/yellow/red) */
export function createDefaultThresholds(): ThresholdConfig {
  return {
    mode: "absolute",
    steps: [
      { value: 0, color: "#22C55E", label: "OK" },
      { value: 50, color: "#F59E0B", label: "Warning" },
      { value: 80, color: "#EF4444", label: "Critical" },
    ],
  };
}
