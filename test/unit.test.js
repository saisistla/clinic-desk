import test from "node:test";
import assert from "node:assert/strict";
import { health } from "../src/app.js";

test("health reports ok", () => {
  assert.equal(health().status, "ok");
});
