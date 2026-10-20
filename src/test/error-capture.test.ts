import { describe, expect, it, vi } from "vitest";
import { consumeLastCapturedError, isClientAbortError } from "@/lib/error-capture";

describe("isClientAbortError", () => {
  it("reconhece abort do cliente", () => {
    expect(isClientAbortError(new Error("aborted"))).toBe(true);
    expect(isClientAbortError(new Error("  Aborted "))).toBe(true);
    const abort = new Error("x");
    abort.name = "AbortError";
    expect(isClientAbortError(abort)).toBe(true);
    expect(isClientAbortError(new Error("wrapper", { cause: new Error("aborted") }))).toBe(true);
    expect(
      isClientAbortError(Object.assign(new Error("socket"), { code: "ECONNRESET" })),
    ).toBe(true);
  });

  it("não classifica erro de aplicação como abort", () => {
    expect(
      isClientAbortError(
        new Error("Could not load /models/house/WoodHouse.obj: Failed to fetch"),
      ),
    ).toBe(false);
    expect(isClientAbortError(new Error("abortou o cálculo"))).toBe(false);
    expect(isClientAbortError(undefined)).toBe(false);
    expect(isClientAbortError("aborted")).toBe(false);
  });
});

describe("console.error wrapper", () => {
  it("abort não é gravado e vira warn; erro normal continua gravado", () => {
    consumeLastCapturedError();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    console.error(new Error("wrapper", { cause: new Error("aborted") }));
    expect(consumeLastCapturedError()).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);

    const real = new Error("falha real");
    const origError = vi.fn();
    // o wrapper chama o console.error original capturado no import; só garante o registro
    console.error(real);
    expect(consumeLastCapturedError()).toBe(real);
    void origError;
    warn.mockRestore();
  });
});
