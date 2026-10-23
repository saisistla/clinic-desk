import test from "node:test";
import assert from "node:assert/strict";
import { createServer, handle, health } from "../src/app.js";

function invoke(method, url, body) {
  return new Promise((resolve) => {
    const headers = {};
    let status = 200;
    const req = {
      method,
      url,
      on(event, cb) {
        if (event === "data" && body) cb(JSON.stringify(body));
        if (event === "end") cb();
        return req;
      },
    };
    handle(req, {
      setHeader(name, value) {
        headers[name] = value;
      },
      writeHead(code) {
        status = code;
      },
      end(data) {
        let parsed = data;
        try {
          parsed = data ? JSON.parse(String(data)) : null;
        } catch {
          parsed = String(data ?? "");
        }
        resolve({ status, body: parsed });
      },
    });
  });
}

test("health export and http health match", async () => {
  assert.equal(health().status, "ok");
  const res = await invoke("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("today list, book, and cancel use fixtures", async () => {
  const listed = await invoke("GET", "/api/appointments/today");
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body));
  const booked = await invoke("POST", "/api/appointments/book", { patientName: "Test Patient", time: "15:00" });
  assert.equal(booked.status, 201);
  assert.equal(booked.body.patientName, "Test Patient");
  const overlap = await invoke("POST", "/api/appointments/book", { patientName: "Clash", time: "15:00" });
  assert.equal(overlap.status, 409);
  const cancelled = await invoke("DELETE", "/api/appointments/cancel/" + booked.body.id);
  assert.ok(cancelled.status === 200 || cancelled.status === 204);
  assert.ok(createServer());
});
