import { describe, expect, it } from "vitest";
import { formatCurrency, setCurrencyFormatContext } from "../../src/lib/format";

describe("formatCurrency", () => {
  it("formats CLP without decimals by default", () => {
    setCurrencyFormatContext({ currency: "CLP", locale: "es-CL" });
    const value = formatCurrency(1234);
    expect(value).toContain("1.234");
    expect(value).not.toContain(",00");
  });

  it("formats USD with two decimals", () => {
    setCurrencyFormatContext({ currency: "USD", locale: "es-CL" });
    const value = formatCurrency(1234.5);
    expect(value).toContain("US$");
    expect(value).toContain(",50");
  });
});
