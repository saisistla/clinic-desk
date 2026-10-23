const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Data file path
const DATA_FILE = path.join(__dirname, 'appointments.json');

// Load appointments fixture or initialize empty
let appointments = [];
try {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  appointments = JSON.parse(data);
} catch (e) {
  appointments = [];
}

// Save appointments to file
function saveAppointments() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2));
}

// Helpers
function todayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseISODateTime(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatISODateTime(date) {
  return date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

// Business rules
const SLOT_DURATION_MINUTES = 30;

function slotsOverlap(startA, startB) {
  const endA = new Date(startA.getTime() + SLOT_DURATION_MINUTES * 60000);
  const endB = new Date(startB.getTime() + SLOT_DURATION_MINUTES * 60000);
  return startA < endB && startB < endA;
}

function getTodaysAppointments() {
  const today = todayDate();
  return appointments.filter(a => a.date === today);
}

function health() {
  return { status: 'ok' };
}

function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        resolve(data);
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;

  if (method === 'GET' && parsedUrl.pathname === '/health') {
    sendJSON(res, 200, health());
    return;
  }

  if (method === 'GET' && parsedUrl.pathname === '/appointments/today') {
    const todayAppts = getTodaysAppointments();
    sendJSON(res, 200, todayAppts);
    return;
  }

  if (method === 'POST' && parsedUrl.pathname === '/appointments/book') {
    try {
      const data = await parseRequestBody(req);
      const { patientName, date, time } = data;
      if (!patientName || !date || !time) {
        sendJSON(res, 400, { error: 'Missing patientName, date or time' });
        return;
      }
      // Validate date is today
      if (date !== todayDate()) {
        sendJSON(res, 400, { error: 'Can only book appointments for today' });
        return;
      }
      // Validate time format HH:mm
      if (!/^\d{2}:\d{2}$/.test(time)) {
        sendJSON(res, 400, { error: 'Invalid time format, expected HH:mm' });
        return;
      }
      // Construct start datetime
      const startDateTime = new Date(`${date}T${time}:00`);
      if (isNaN(startDateTime.getTime())) {
        sendJSON(res, 400, { error: 'Invalid date/time' });
        return;
      }
      // Check slot is on 30-minute boundary
      if (startDateTime.getMinutes() % SLOT_DURATION_MINUTES !== 0) {
        sendJSON(res, 400, { error: 'Appointment must start on 30-minute boundary' });
        return;
      }
      // Check for overlapping appointments
      const todayAppts = getTodaysAppointments();
      for (const appt of todayAppts) {
        const apptStart = new Date(`${appt.date}T${appt.time}:00`);
        if (slotsOverlap(startDateTime, apptStart)) {
          sendJSON(res, 409, { error: 'Appointment slot overlaps with existing booking' });
          return;
        }
      }
      // Create new appointment
      const newId = appointments.length > 0 ? Math.max(...appointments.map(a => a.id)) + 1 : 1;
      const newAppt = {
        id: newId,
        patientName: patientName.trim(),
        date,
        time
      };
      appointments.push(newAppt);
      saveAppointments();
      sendJSON(res, 201, newAppt);
    } catch (e) {
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  if (method === 'DELETE' && parsedUrl.pathname.startsWith('/appointments/cancel/')) {
    const idStr = parsedUrl.pathname.split('/').pop();
    const id = Number(idStr);
    if (!id || isNaN(id)) {
      sendJSON(res, 400, { error: 'Invalid appointment id' });
      return;
    }
    const idx = appointments.findIndex(a => a.id === id);
    if (idx === -1) {
      sendJSON(res, 404, { error: 'Appointment not found' });
      return;
    }
    appointments.splice(idx, 1);
    saveAppointments();
    sendJSON(res, 200, { message: 'Appointment cancelled' });
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(handle);
  server.listen(PORT, () => {
    console.log(`Clinic front-desk app listening on port ${PORT}`);
  });
}

module.exports = { health, handle };