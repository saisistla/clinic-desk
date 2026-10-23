const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'appointments.json');
const SLOT_DURATION_MINUTES = 30;

// Load appointments from fixture JSON file
function loadAppointments() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// Save appointments to fixture JSON file
function saveAppointments(appointments) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2));
}

// Get today's date string in YYYY-MM-DD
function todayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// Parse ISO datetime string and round to nearest slot start
function parseSlotStart(dateTimeStr) {
  const dt = new Date(dateTimeStr);
  if (isNaN(dt)) return null;
  // Round minutes down to nearest 30
  const minutes = dt.getMinutes();
  const roundedMinutes = minutes - (minutes % SLOT_DURATION_MINUTES);
  dt.setMinutes(roundedMinutes, 0, 0);
  return dt;
}

// Check if two slots overlap
function slotsOverlap(start1, start2) {
  const end1 = new Date(start1.getTime() + SLOT_DURATION_MINUTES * 60000);
  const end2 = new Date(start2.getTime() + SLOT_DURATION_MINUTES * 60000);
  return start1 < end2 && start2 < end1;
}

// Exported health check
function health() {
  return { status: 'ok' };
}

// Handle HTTP requests
async function handle(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;

  // CORS headers for frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health()));
    return;
  }

  if (method === 'GET' && pathname === '/appointments/today') {
    const appointments = loadAppointments();
    const today = todayDate();
    const todaysAppointments = appointments.filter(a => a.date === today);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(todaysAppointments));
    return;
  }

  if (method === 'POST' && pathname === '/appointments/book') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { patientName, datetime } = JSON.parse(body);
        if (!patientName || !datetime) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing patientName or datetime' }));
          return;
        }

        const slotStart = parseSlotStart(datetime);
        if (!slotStart) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid datetime format' }));
          return;
        }

        const dateStr = slotStart.toISOString().slice(0, 10);
        const appointments = loadAppointments();

        // Check for overlapping bookings
        const overlap = appointments.some(a => {
          if (a.date !== dateStr) return false;
          const existingStart = new Date(a.datetime);
          return slotsOverlap(existingStart, slotStart);
        });

        if (overlap) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Slot already booked' }));
          return;
        }

        // Create new appointment
        const newAppointment = {
          id: Date.now().toString(),
          patientName: patientName.trim(),
          datetime: slotStart.toISOString(),
          date: dateStr
        };

        appointments.push(newAppointment);
        saveAppointments(appointments);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newAppointment));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (method === 'DELETE' && pathname.startsWith('/appointments/cancel/')) {
    const id = pathname.split('/').pop();
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing appointment id' }));
      return;
    }

    const appointments = loadAppointments();
    const index = appointments.findIndex(a => a.id === id);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Appointment not found' }));
      return;
    }

    appointments.splice(index, 1);
    saveAppointments(appointments);

    res.writeHead(204);
    res.end();
    return;
  }

  // Serve frontend SPA
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Clinic Front Desk</title></head>
<body>
<h1>Clinic Front Desk Appointments</h1>
<div id="app">
  <h2>Today's Appointments</h2>
  <ul id="appointments"></ul>
  <h2>Book Appointment</h2>
  <form id="bookForm">
    <input type="text" id="patientName" placeholder="Patient Name" required />
    <input type="datetime-local" id="datetime" required />
    <button type="submit">Book</button>
  </form>
</div>
<script>
async function fetchAppointments() {
  const res = await fetch('/appointments/today');
  const data = await res.json();
  const ul = document.getElementById('appointments');
  ul.innerHTML = '';
  data.forEach(a => {
    const li = document.createElement('li');
    const dt = new Date(a.datetime);
    li.textContent = `${a.patientName} at ${dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    const btn = document.createElement('button');
    btn.textContent = 'Cancel';
    btn.onclick = async () => {
      if(confirm('Cancel this appointment?')) {
        await fetch('/appointments/cancel/' + a.id, { method: 'DELETE' });
        fetchAppointments();
      }
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

document.getElementById('bookForm').onsubmit = async e => {
  e.preventDefault();
  const patientName = document.getElementById('patientName').value.trim();
  const datetime = document.getElementById('datetime').value;
  if (!patientName || !datetime) return alert('Fill all fields');
  const res = await fetch('/appointments/book', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ patientName, datetime })
  });
  if (res.status === 201) {
    document.getElementById('bookForm').reset();
    fetchAppointments();
  } else {
    const err = await res.json();
    alert('Error: ' + (err.error || 'Unknown'));
  }
};

fetchAppointments();
</script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  http.createServer(handle).listen(PORT, () => {
    console.log(`Clinic front desk app listening on port ${PORT}`);
  });
}

module.exports = { health, handle };