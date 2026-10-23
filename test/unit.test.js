import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

const FIXTURE_PATH = path.resolve('./fixtures/data.json');

// Helper to reset fixture data before each test
async function resetFixture() {
  const initialData = [
    {
      "id": "a1",
      "patient": "John Doe",
      "time": "09:00",
      "date": new Date().toISOString().slice(0,10),
      "status": "booked"
    },
    {
      "id": "a2",
      "patient": "Jane Smith",
      "time": "09:30",
      "date": new Date().toISOString().slice(0,10),
      "status": "booked"
    }
  ];
  await fs.writeFile(FIXTURE_PATH, JSON.stringify(initialData, null, 2));
}

// Helper to run backend commands via curl
function request(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const curl = [
      'curl',
      '-s',
      '-X', method,
      'http://localhost:3000' + endpoint,
      '-H', 'Content-Type: application/json'
    ];
    if (data) {
      curl.push('-d', JSON.stringify(data));
    }
    exec(curl.join(' '), (error, stdout, stderr) => {
      if (error) return reject(error);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout);
      }
    });
  });
}

// Start backend server before tests
let serverProcess;
beforeEach(async () => {
  await resetFixture();
});

describe('Clinic Front-Desk Appointment App', () => {
  beforeEach((done) => {
    if (serverProcess) {
      serverProcess.kill();
    }
    serverProcess = exec('node src/app.js');
    // Wait for server to start
    setTimeout(done, 1000);
  });

  after(() => {
    if (serverProcess) serverProcess.kill();
  });

  it('should fetch today\'s appointments', async () => {
    const today = new Date().toISOString().slice(0,10);
    const res = await request('GET', `/appointments?date=${today}`);
    assert(Array.isArray(res));
    assert(res.length >= 2);
    assert(res.every(a => a.date === today));
    assert(res.some(a => a.patient === 'John Doe'));
  });

  it('should book a new appointment in a free 30-min slot', async () => {
    const today = new Date().toISOString().slice(0,10);
    const newAppointment = {
      patient: 'Alice Wonderland',
      date: today,
      time: '10:00'
    };
    const res = await request('POST', '/appointments', newAppointment);
    assert.strictEqual(res.patient, newAppointment.patient);
    assert.strictEqual(res.date, newAppointment.date);
    assert.strictEqual(res.time, newAppointment.time);
    assert(res.id);

    // Confirm it appears in today's appointments
    const all = await request('GET', `/appointments?date=${today}`);
    assert(all.find(a => a.id === res.id));
  });

  it('should reject booking overlapping appointment', async () => {
    const today = new Date().toISOString().slice(0,10);
    // Overlaps with 09:00-09:30 slot
    const overlap = {
      patient: 'Bob Overlap',
      date: today,
      time: '09:15'
    };
    try {
      await request('POST', '/appointments', overlap);
      assert.fail('Should have thrown error for overlapping slot');
    } catch (e) {
      // curl returns empty or error, so test backend returns error JSON
      // We expect JSON with error property
      const err = JSON.parse(e.message.match(/\{.*\}/s)[0]);
      assert(err.error.includes('overlapping'));
    }
  });

  it('should cancel an existing appointment', async () => {
    const today = new Date().toISOString().slice(0,10);
    // Cancel John Doe's appointment (id a1)
    const res = await request('DELETE', '/appointments/a1');
    assert.strictEqual(res.message, 'Appointment cancelled');

    // Confirm it is removed from today's appointments
    const all = await request('GET', `/appointments?date=${today}`);
    assert(!all.find(a => a.id === 'a1'));
  });

  it('should reject cancelling non-existing appointment', async () => {
    try {
      await request('DELETE', '/appointments/nonexistent');
      assert.fail('Should have thrown error for non-existing appointment');
    } catch (e) {
      const err = JSON.parse(e.message.match(/\{.*\}/s)[0]);
      assert(err.error.includes('not found'));
    }
  });

  it('should enforce 30-minute slot duration on booking', async () => {
    const today = new Date().toISOString().slice(0,10);
    // Invalid time slot (not on 30-min boundary)
    const invalidSlot = {
      patient: 'Charlie Invalid',
      date: today,
      time: '10:10'
    };
    try {
      await request('POST', '/appointments', invalidSlot);
      assert.fail('Should have thrown error for invalid slot duration');
    } catch (e) {
      const err = JSON.parse(e.message.match(/\{.*\}/s)[0]);
      assert(err.error.includes('30-minute slot'));
    }
  });
});
