import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("test harness loads jsdom", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  assert.equal(dom.window.document.body.children.length, 0);
});
