import { describe, expect, it } from "vitest";
import {
  GAME_LANGUAGE_CATALOG,
  GAME_LANGUAGE_PRESET,
  LanguageCodeSchema,
  canonicalizeLanguageCode,
  getLanguageDefinition,
  localeForGodot,
  localeForUnity,
} from "../src/index.js";

describe("game language catalog", () => {
  it("covers the common game market with unique language tags", () => {
    expect(GAME_LANGUAGE_CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(new Set(GAME_LANGUAGE_CATALOG.map((language) => language.code.toLowerCase())).size).toBe(GAME_LANGUAGE_CATALOG.length);
    expect(GAME_LANGUAGE_CATALOG.filter((language) => language.steamCode).length).toBeGreaterThanOrEqual(29);
    expect(GAME_LANGUAGE_PRESET.length).toBe(GAME_LANGUAGE_CATALOG.filter((language) => language.steamCode).length);
    for (const language of GAME_LANGUAGE_CATALOG) expect(LanguageCodeSchema.parse(language.code)).toBe(language.code);
  });

  it("accepts and canonicalizes BCP 47 tags while retaining legacy Griko", () => {
    expect(LanguageCodeSchema.parse("pt-br")).toBe("pt-BR");
    expect(LanguageCodeSchema.parse("pt_br")).toBe("pt-BR");
    expect(LanguageCodeSchema.parse("zh-hans")).toBe("zh-Hans");
    expect(LanguageCodeSchema.parse("x-studio-dialect")).toBe("x-studio-dialect");
    expect(LanguageCodeSchema.parse("griko")).toBe("griko");
    expect(() => LanguageCodeSchema.parse("not a locale")).toThrow();
  });

  it("provides engine mappings without changing stored project identity", () => {
    expect(canonicalizeLanguageCode("es-419")).toBe("es-419");
    expect(localeForGodot("pt-BR")).toBe("pt_BR");
    expect(localeForGodot("zh-Hans")).toBe("zh_CN");
    expect(localeForUnity("griko")).toBe("x-griko");
    expect(getLanguageDefinition("EL")?.englishName).toBe("Greek");
  });
});
