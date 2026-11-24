import { describe, expect, it, afterEach } from "vitest";
import { BrowserOSAdapterStub, BrowserOSHttpAdapter, createBrowserAdapter } from "./browser-adapter.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("browser adapter factory", () => {
  it("defaults to playwright", () => {
    delete process.env.BROWSER_ADAPTER;
    expect(createBrowserAdapter().kind).toBe("playwright");
  });
  it("returns browseros stub when endpoint/token missing", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_BASE_URL;
    delete process.env.BROWSEROS_TOKEN;
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSAdapterStub);
  });
  it("returns browseros http adapter when endpoint/token present", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_BASE_URL = "http://127.0.0.1:9999";
    process.env.BROWSEROS_TOKEN = "tok";
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSHttpAdapter);
  });
});
