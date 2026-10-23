import assert from 'assert';
import { execSync } from 'child_process';
import http from 'http';
import { once } from 'events';

// The backend server is assumed to be started by running `node src/app.js`
// We'll spawn it as a child process for integration testing

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess;

// Helper to make HTTP requests
async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } else {
            resolve({ statusCode: res.statusCode, body: data });
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Wait for server to be ready
async function waitForServer() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request('/health');
      if (res.statusCode === 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Server did not start in time');
}

// Reset fixture data before each test by copying fixtures/data.json to the app's data store
// Assuming app reads from fixtures/data.json directly or we can reset by restarting server

// Start server before tests
before(async () => {
  serverProcess = execSync('node src/app.js', { stdio: 'ignore', env: { ...process.env, PORT: PORT } });
  await waitForServer();
});

// Stop server after tests
after(() => {
  if (serverProcess) {
    serverProcess.kill && serverProcess.kill();
  }
});

describe('Clinic Front-Desk Appointment App Integration Tests', () => {
  // We will test the 3 acceptance criteria:
  // 1. Staff can see today's appointments
  // 2. Staff can book an appointment for a patient
  // 3. Staff can cancel an appointment

  it('should fetch today\'s appointments', async () => {
    const res = await request('/appointments/today', { method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body), 'Response body should be an array');
    // Each appointment should have id, patientName, startTime, endTime
    if (res.body.length > 0) {
      const appt = res.body[0];
      assert.ok(appt.id, 'Appointment should have id');
      assert.ok(appt.patientName, 'Appointment should have patientName');
      assert.ok(appt.startTime, 'Appointment should have startTime');
      assert.ok(appt.endTime, 'Appointment should have endTime');
    }
  });

  it('should book a new 30-minute appointment slot for a patient', async () => {
    // Fetch current appointments to find a free slot
    const todayRes = await request('/appointments/today', { method: 'GET' });
    assert.strictEqual(todayRes.statusCode, 200);
    const appointments = todayRes.body;

    // Clinic working hours assumed 9:00 to 17:00 local time
    // Find a free 30-minute slot between 9:00 and 17:00
    // We'll try 9:00, 9:30, 10:00, ... until 16:30
    const date = new Date();
    date.setHours(9, 0, 0, 0);

    function overlaps(start1, end1, start2, end2) {
      return start1 < end2 && start2 < end1;
    }

    let slotStart = null;
    for (let i = 0; i < 16; i++) { // 16 slots of 30 min from 9:00 to 17:00
      const start = new Date(date.getTime() + i * 30 * 60000);
      const end = new Date(start.getTime() + 30 * 60000);
      const conflict = appointments.some(appt => {
        const apptStart = new Date(appt.startTime);
        const apptEnd = new Date(appt.endTime);
        return overlaps(start, end, apptStart, apptEnd);
      });
      if (!conflict) {
        slotStart = start;
        break;
      }
    }

    assert.ok(slotStart, 'Should find a free 30-minute slot');

    const newAppointment = {
      patientName: 'Test Patient',
      startTime: slotStart.toISOString()
    };

    const bookRes = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAppointment)
    });

    assert.strictEqual(bookRes.statusCode, 201);
    assert.ok(bookRes.body.id, 'Booked appointment should have an id');
    assert.strictEqual(bookRes.body.patientName, newAppointment.patientName);
    assert.strictEqual(bookRes.body.startTime, newAppointment.startTime);

    // Verify appointment is now in today's list
    const updatedRes = await request('/appointments/today', { method: 'GET' });
    const found = updatedRes.body.find(a => a.id === bookRes.body.id);
    assert.ok(found, 'New appointment should appear in today\'s appointments');
  });

  it('should not allow booking overlapping appointments', async () => {
    // Book an appointment at 10:00
    const date = new Date();
    date.setHours(10, 0, 0, 0);
    const appt = {
      patientName: 'Overlap Test',
      startTime: date.toISOString()
    };

    // First booking should succeed
    const firstRes = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appt)
    });
    assert.strictEqual(firstRes.statusCode, 201);

    // Second booking at same time should fail
    const secondRes = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appt)
    });
    assert.strictEqual(secondRes.statusCode, 409, 'Should reject overlapping booking');
  });

  it('should cancel an existing appointment', async () => {
    // Book an appointment to cancel
    const date = new Date();
    date.setHours(11, 0, 0, 0);
    const appt = {
      patientName: 'Cancel Test',
      startTime: date.toISOString()
    };

    const bookRes = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appt)
    });
    assert.strictEqual(bookRes.statusCode, 201);
    const apptId = bookRes.body.id;

    // Cancel the appointment
    const cancelRes = await request(`/appointments/cancel/${apptId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(cancelRes.statusCode, 200);
    assert.strictEqual(cancelRes.body.message, 'Appointment cancelled');

    // Verify appointment no longer in today's list
    const todayRes = await request('/appointments/today', { method: 'GET' });
    const found = todayRes.body.find(a => a.id === apptId);
    assert.strictEqual(found, undefined);
  });

  it('should reject cancelling non-existent appointment', async () => {
    const cancelRes = await request('/appointments/cancel/nonexistent-id', { method: 'DELETE' });
    assert.strictEqual(cancelRes.statusCode, 404);
  });

  it('should reject booking with invalid data', async () => {
    // Missing patientName
    const res1 = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: new Date().toISOString() })
    });
    assert.strictEqual(res1.statusCode, 400);

    // Missing startTime
    const res2 = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName: 'No Time' })
    });
    assert.strictEqual(res2.statusCode, 400);

    // Invalid startTime format
    const res3 = await request('/appointments/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName: 'Bad Time', startTime: 'not-a-date' })
    });
    assert.strictEqual(res3.statusCode, 400);
  });
});
