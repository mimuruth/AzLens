import { describe, it, expect } from "vitest";
import { initialsFrom, colorFrom } from "../profile";

describe("initialsFrom", () => {
  it("uses first+last initials of a two-part name", () => {
    expect(initialsFrom("Michael M")).toBe("MM");
    expect(initialsFrom("Ada Lovelace")).toBe("AL");
    expect(initialsFrom("jane q public")).toBe("JP"); // first + last
  });

  it("uses the first two letters of a single name", () => {
    expect(initialsFrom("Prince")).toBe("PR");
  });

  it("falls back to the email local-part", () => {
    expect(initialsFrom(null, "mimuruth@example.com")).toBe("MI");
    expect(initialsFrom("", "ada.lovelace@x.io")).toBe("AL");
    expect(initialsFrom(undefined, "first_last@x.io")).toBe("FL");
  });

  it("returns '?' when nothing is available", () => {
    expect(initialsFrom()).toBe("?");
    expect(initialsFrom("", "")).toBe("?");
  });
});

describe("colorFrom", () => {
  it("is deterministic and returns an hsl colour", () => {
    const a = colorFrom("Michael M");
    expect(a).toMatch(/^hsl\(\d+ 52% 45%\)$/);
    expect(colorFrom("Michael M")).toBe(a);
    expect(colorFrom("Ada Lovelace")).not.toBe(a);
  });
});
