import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("offers an isolated demo mode through the URL", () => {
  assert.match(pageSource, /params\.get\("demo"\) === "1"/);
  assert.match(pageSource, /Vista de demostración: las acciones reales están desactivadas/);
  assert.match(pageSource, /const demoDashboard: DashboardData/);
});

test("masks the linked phone in every visible surface", () => {
  assert.match(pageSource, /function maskedPhone/);
  assert.equal((pageSource.match(/maskedPhone\(status\?\.runtime\.phoneJid\)/g) ?? []).length, 2);
  assert.doesNotMatch(pageSource, /<strong>\{status\?\.runtime\.phoneJid/);
  assert.doesNotMatch(pageSource, /<p>\{status\?\.runtime\.phoneJid/);
});
