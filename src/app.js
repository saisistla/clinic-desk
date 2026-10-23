import http from 'http';
import url from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const FIXTURE_PATH = path.resolve(process.cwd(), 'fixtures', 'appointments.json');

function loadAppointments() {
  if (!existsSync(FIXTURE_PATH)) {
    return [];
  }
  try {
    const data = readFileSync(FIXTURE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveAppointments(appointments) {
  writeFileSync(FIXTURE_PATH, JSON.stringify(appointments, null, 2), 'utf-8');
}

export function health() {
  return { status: 'ok' };
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function parseIdFromPath(pathname) {
  const parts = pathname.split('/');
  return parts.length > 3 ? parts[3] : null;
}

export function handle(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, health());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/appointment-table-shows-surn') {
    // Return appointment list with surname included
    const appointments = loadAppointments();
    // Each appointment must have surname field
    const data = appointments.map(({ id, patientName, patientSurname, time, status }) => ({
      id,
      patientName,
      patientSurname,
      time,
      status
    }));
    sendJson(res, 200, data);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/booking-form-collects-surnam') {
    // Return booking form schema including surname field
    // Simulate form fields
    const form = {
      fields: [
        { name: 'patientName', type: 'string', required: true },
        { name: 'patientSurname', type: 'string', required: true },
        { name: 'time', type: 'string', required: true }
      ]
    };
    sendJson(res, 200, form);
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/cancel-and-today-s-list-stil/')) {
    // Cancel appointment by id and return today's appointments
    const id = parseIdFromPath(pathname);
    if (!id) {
      sendJson(res, 400, { error: 'Missing appointment id' });
      return;
    }
    let appointments = loadAppointments();
    const index = appointments.findIndex(a => a.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: 'Appointment not found' });
      return;
    }
    // Mark appointment as cancelled
    appointments[index].status = 'cancelled';
    saveAppointments(appointments);

    // Return today's appointments (assume today is current date in ISO yyyy-mm-dd)
    const today = new Date().toISOString().slice(0, 10);
    const todaysAppointments = appointments.filter(a => a.time.startsWith(today) && a.status !== 'cancelled');
    sendJson(res, 200, todaysAppointments);
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}`);
  });
}
