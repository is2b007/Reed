import { describe, expect, it } from "vitest";
import { conditionVariableNames, createPickerPosition, evaluatePlaytestCondition, globalShortcut, nextAppearancePreference, nextMenuIndex, nodeKindOptions, nodePositionForConnectionDrop, parseLanguageList, promptValueIsValid, speakerAccent, variableInitialValueLabel } from "./ui-logic.js";

describe("editor keyboard behavior", () => {
  it("maps workspace and project shortcuts only when modified", () => {
    expect(globalShortcut("1", true)).toBe("graph");
    expect(globalShortcut("9", true)).toBe("read");
    expect(globalShortcut("0", true)).toBe("variables");
    expect(globalShortcut("k", true)).toBe("toggle-project");
    expect(globalShortcut("K", true)).toBe("toggle-project");
    expect(globalShortcut("1", false)).toBeNull();
  });

  it("wraps menu navigation and supports boundaries", () => {
    expect(nextMenuIndex(0, 5, "ArrowUp")).toBe(4);
    expect(nextMenuIndex(4, 5, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(2, 5, "Home")).toBe(0);
    expect(nextMenuIndex(2, 5, "End")).toBe(4);
    expect(nextMenuIndex(2, 5, "Enter")).toBeNull();
  });
});

describe("project and production display helpers", () => {
  it("cycles appearance in a predictable three-state order", () => {
    expect(nextAppearancePreference("system")).toBe("light");
    expect(nextAppearancePreference("light")).toBe("dark");
    expect(nextAppearancePreference("dark")).toBe("system");
  });

  it("normalizes language settings and gives every permanent actor ID a stable accent", () => {
    expect(parseLanguageList("EN, el  it,el")).toEqual(["en", "el", "it"]);
    expect(speakerAccent(1)).toBe(speakerAccent(1));
    expect(speakerAccent(1)).not.toBe(speakerAccent(2));
  });

  it("extracts and formats variable metadata", () => {
    expect(conditionVariableNames("Variable['Trust'] > 2 and Variable[\"MetEleni\"] == true and Variable['Trust'] < 5"))
      .toEqual(["Trust", "MetEleni"]);
    expect(variableInitialValueLabel("boolean", true)).toBe("True");
    expect(variableInitialValueLabel("text", "")).toBe("Empty text");
    expect(variableInitialValueLabel("text", "Marco")).toBe("“Marco”");
  });
});

describe("in-app prompt validation", () => {
  it("requires useful text and exact destructive confirmation", () => {
    expect(promptValueIsValid("  ")).toBe(false);
    expect(promptValueIsValid("Harbour")).toBe(true);
    expect(promptValueIsValid("limani-123", "limani-123")).toBe(true);
    expect(promptValueIsValid("LIMANI-123", "limani-123")).toBe(false);
  });
});

describe("connection-drop node creation", () => {
  it("defines useful explanations for every addable node kind", () => {
    expect(nodeKindOptions.map(({ kind, label }) => ({ kind, label }))).toEqual([
      { kind: "line", label: "Line" },
      { kind: "choice", label: "Choice" },
      { kind: "group", label: "Junction" },
    ]);
    for (const option of nodeKindOptions) expect(option.description.length).toBeGreaterThan(30);
  });

  it("centers created nodes on the release point and keeps the picker onscreen", () => {
    expect(nodePositionForConnectionDrop({ x: 411.6, y: 207.4 }, "line")).toEqual({ x: 412, y: 153 });
    expect(nodePositionForConnectionDrop({ x: 411.6, y: 207.4 }, "group")).toEqual({ x: 412, y: 174 });
    expect(createPickerPosition({ x: 780, y: 580 }, { width: 800, height: 600 })).toEqual({ x: 448, y: 268 });
    expect(createPickerPosition({ x: 30, y: 30 }, { width: 800, height: 600 })).toEqual({ x: 42, y: 42 });
  });
});

describe("playtest conditions", () => {
  const variables = { MetEleni: false, Trust: 3, Name: "Marco", "Έτοιμος": true };

  it("evaluates Pixel Crushers variable comparisons", () => {
    expect(evaluatePlaytestCondition("Variable['MetEleni'] == true", variables)).toEqual({ allowed: false, supported: true });
    expect(evaluatePlaytestCondition("Variable['Trust'] >= 3", variables)).toEqual({ allowed: true, supported: true });
    expect(evaluatePlaytestCondition("Variable['Trust'] >= 3   ", variables)).toEqual({ allowed: true, supported: true });
    expect(evaluatePlaytestCondition('Variable["Name"] ~= "Eleni"', variables)).toEqual({ allowed: true, supported: true });
    expect(evaluatePlaytestCondition("Variable['Έτοιμος'] == true", variables)).toEqual({ allowed: true, supported: true });
  });

  it("supports boolean groups and fails closed for unsupported expressions", () => {
    expect(evaluatePlaytestCondition("not Variable['MetEleni'] and (Variable['Trust'] > 2 or false)", variables)).toEqual({ allowed: true, supported: true });
    expect(evaluatePlaytestCondition("LuaFunction('unsafe')", variables)).toEqual({ allowed: false, supported: false });
    expect(evaluatePlaytestCondition("Variable['Missing'] == true", variables)).toEqual({ allowed: false, supported: false });
  });
});
