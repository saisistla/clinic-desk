import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { before, after, describe, it } from 'node:test';

const BASE_URL = 'http://localhost:3000';
const FIXTURE_PATH = path.resolve('fixtures/data.json');

// Helper to reset fixture data before each test run
function resetFixture() {
  const initialData = {
    appointments: [
      {
        id: 'a1',
        patient: 'John Doe',
        time: '09:00',
        date: new Date().toISOString().slice(0, 10)
      },
      {
        id: 'a2',
        patient: 'Jane Smith',
        time: '09:30',
        date: new Date().toISOString().slice(0, 10)
      }
    ]
  };
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(initialData, null, 2));
}

// Helper to make HTTP requests
function request(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Start the app server before tests
let serverProcess;
before(() => {
  resetFixture();
  serverProcess = execSync('node src/app.js', { stdio: 'ignore', timeout: 1000, killSignal: 'SIGTERM' });
});

after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

describe('Clinic Front-Desk Appointment App Integration Tests', () => {
  before(() => resetFixture());

  it('should fetch today\'s appointments', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request('GET', `/appointments?date=${today}`);
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
    assert(res.body.length >= 2);
    assert(res.body.some(a => a.patient === 'John Doe'));
  });

  it('should book a new appointment slot for a patient', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const newAppointment = {
      patient: 'Alice Johnson',
      date: today,
      time: '10:00'
    };

    const res = await request('POST', '/appointments', newAppointment);
    assert.strictEqual(res.status, 201);
    assert(res.body.id);
    assert.strictEqual(res.body.patient, newAppointment.patient);
    assert.strictEqual(res.body.time, newAppointment.time);

    // Confirm it appears in today's appointments
    const listRes = await request('GET', `/appointments?date=${today}`);
    assert(listRes.body.some(a => a.patient === 'Alice Johnson' && a.time === '10:00'));
  });

  it('should reject booking overlapping appointment slots', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Existing slot at 09:00, try to book 09:15 (overlaps 09:00-09:30)
    const overlappingAppointment = {
      patient: 'Bob Overlap',
      date: today,
      time: '09:15'
    };

    const res = await request('POST', '/appointments', overlappingAppointment);
    assert.strictEqual(res.status, 400);
    assert(res.body.error.includes('overlap'));
  });

  it('should cancel an existing appointment', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Cancel John Doe's appointment (id: a1)
    const res = await request('DELETE', '/appointments/a1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Appointment cancelled');

    // Confirm it no longer appears
    const listRes = await request('GET', `/appointments?date=${today}`);
    assert(!listRes.body.some(a => a.id === 'a1'));
  });

  it('should return 404 when cancelling non-existent appointment', async () => {
    const res = await request('DELETE', '/appointments/nonexistent');
    assert.strictEqual(res.status, 404);
    assert(res.body.error.includes('not found'));
  });

  it('should enforce 30-minute slot duration and reject invalid times', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Try booking at 09:10 (not on 30-minute boundary)
    const invalidTimeAppointment = {
      patient: 'Invalid Time',
      date: today,
      time: '09:10'
    };

    const res = await request('POST', '/appointments', invalidTimeAppointment);
    assert.strictEqual(res.status, 400);
    assert(res.body.error.includes('30-minute slot'));
  });
});
