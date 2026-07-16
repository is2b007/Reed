import { describe, expect, it } from "vitest";
import { evaluatePlaytestCondition, globalShortcut, nextMenuIndex, promptValueIsValid } from "./ui-logic.js";

describe("editor keyboard behavior", () => {
  it("maps workspace and project shortcuts only when modified", () => {
    expect(globalShortcut("1", true)).toBe("graph");
    expect(globalShortcut("9", true)).toBe("read");
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

describe("in-app prompt validation", () => {
  it("requires useful text and exact destructive confirmation", () => {
    expect(promptValueIsValid("  ")).toBe(false);
    expect(promptValueIsValid("Harbour")).toBe(true);
    expect(promptValueIsValid("limani-123", "limani-123")).toBe(true);
    expect(promptValueIsValid("LIMANI-123", "limani-123")).toBe(false);
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
