import { describe, it, expect } from "vitest";
import { renderTemplateBody } from "@/lib/whatsapp/utils";

describe("renderTemplateBody", () => {
  it("renders the reported daytime-payment component JSON as readable text", () => {
    const raw = JSON.stringify({
      body_name: { type: "text", parameter_name: "name", text: "Rakhi" },
      body_orderno: { type: "text", parameter_name: "orderno", text: "171" },
      body_itemlist: { type: "text", parameter_name: "itemlist", text: "5...10pc" },
      body_orderamount: { type: "text", parameter_name: "orderamount", text: "149.00" },
      // Mixed shape: the URL button carries no parameter_name (why the webhook's
      // stricter echo-normalizer skips it) and its slug must be dropped.
      button_3: { subtype: "url", type: "text", text: "SJ28G5ny" },
    });
    expect(renderTemplateBody(raw)).toBe("Rakhi · 171 · 5...10pc · 149.00");
  });

  it("leaves genuine text messages untouched — even ones starting with {", () => {
    expect(renderTemplateBody("Ok 👍")).toBe("Ok 👍");
    expect(renderTemplateBody("{not json at all")).toBe("{not json at all");
    expect(renderTemplateBody('{"foo":"bar"}')).toBe('{"foo":"bar"}'); // not component shape
  });

  it("is null/empty safe", () => {
    expect(renderTemplateBody("")).toBe("");
    expect(renderTemplateBody(null)).toBe("");
    expect(renderTemplateBody(undefined)).toBe("");
  });

  it("falls back to a label for a component shape with no body text (image header only)", () => {
    const raw = JSON.stringify({ header_1: { type: "image", image: { link: "https://x/y.jpg" } } });
    expect(renderTemplateBody(raw)).toBe("Template message");
  });
});
