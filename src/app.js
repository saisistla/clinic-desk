import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(root, "../fixtures/data.json");

function load() {
  if (!fs.existsSync(fixturePath)) return [];
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return Array.isArray(raw) ? raw : raw.appointments ?? raw.items ?? [];
}

function save(rows) {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify({ appointments: rows }, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function minutes(value) {
  const text = String(value || "");
  if (text.includes("T")) {
    const date = new Date(text);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
  const [hours, mins] = text.split(":").map(Number);
  return hours * 60 + mins;
}

function normalize(row) {
  const patient = row.patient && typeof row.patient === "object" ? row.patient : {};
  return {
    id: String(row.id),
    patientName: row.patientName || patient.name || row.patient || row.name || "",
    patientSurname: row.patientSurname || row.surname || patient.surname || "",
    time: row.time || (row.datetime ? new Date(row.datetime).toISOString().slice(11, 16) : ""),
    date: row.date || (row.time && String(row.time).includes("T") ? String(row.time).slice(0, 10) : today()),
  };
}

export function health() {
  return { status: "ok" };
}

function send(res, status, body, type = "application/json") {
  if (typeof res.setHeader === "function") res.setHeader("content-type", type);
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function handle(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "GET" && route === "/health") return send(res, 200, health());

  if (req.method === "GET" && (route === "/appointments/today" || route === "/api/appointments/today" || route === "/appointments")) {
    return send(res, 200, load().map(normalize).filter((row) => row.date === today()));
  }

  if (req.method === "POST" && (route === "/appointments/book" || route === "/api/appointments/book" || route === "/appointments")) {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const patientName = String(body.patientName || body.firstName || body.patient || "").trim();
        const patientSurname = String(body.patientSurname || body.surname || "").trim();
        const time = body.time || (body.datetime ? new Date(body.datetime).toISOString().slice(11, 16) : "");
        const date = body.date || today();
        if (!patientName || !time) return send(res, 400, { error: "Missing patientName or time" });
        if (minutes(time) % 30 !== 0) return send(res, 400, { error: "30-minute slot required" });
        const rows = load();
        const clash = rows.map(normalize).some((row) => row.date === date && Math.abs(minutes(row.time) - minutes(time)) < 30);
        if (clash) return send(res, 409, { error: "overlapping slot" });
        const created = {
          id: Date.now().toString(),
          patientName,
          patientSurname,
          surname: patientSurname,
          patient: { name: patientName, surname: patientSurname },
          time,
          date,
        };
        rows.push(created);
        save(rows);
        return send(res, 201, created);
      } catch {
        return send(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  const cancel = route.match(/^\/(?:api\/)?appointments\/(?:cancel\/)?([^/]+)$/);
  if (req.method === "DELETE" && cancel && cancel[1] !== "today" && cancel[1] !== "book") {
    const rows = load();
    const index = rows.findIndex((row) => String(row.id) === cancel[1]);
    if (index < 0) return send(res, 404, { error: "Appointment not found" });
    rows.splice(index, 1);
    save(rows);
    return send(res, 200, { message: "Appointment cancelled" });
  }

  if (req.method === "GET" && (route === "/" || route === "/index.html")) {
    return send(res, 200, fs.readFileSync(path.join(root, "../public/index.html"), "utf8"), "text/html");
  }

  return send(res, 404, { error: "Not found" });
}

export function createServer() {
  return http.createServer(handle);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(Number(process.env.PORT || 3000), () => {
    console.log("clinic desk listening");
  });
}
