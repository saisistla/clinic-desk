import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { before, after, describe, it } from 'node:test';

const appPath = path.resolve('./src/app.js');
const fixturesPath = path.resolve('./fixtures/data.json');

// Helper to start the server as a child process
function startServer() {
  const server = execSync('node src/app.js', { stdio: 'pipe' });
  return server;
}

// We will spawn the app as a child process and test its REST API
// But node --test runs in a single process, so we spawn the app in a separate process

import fetch from 'node-fetch';

// We assume the app listens on port 3000
const BASE_URL = 'http://localhost:3000';

let serverProcess;

// Utility to wait for server to be ready
async function waitForServerReady() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

// Backup original fixture data
let originalFixtureData;

before(async () => {
  // Backup fixture
  originalFixtureData = fs.readFileSync(fixturesPath, 'utf-8');

  // Start the server as a child process
  serverProcess = execSync('node src/app.js', { stdio: 'pipe' });

  // Instead of execSync, we spawn the app in a child process
  // But node:test does not support async spawn easily, so we do a workaround
  // We'll spawn the app in a separate process using child_process.spawn
  const { spawn } = await import('child_process');
  serverProcess = spawn('node', ['src/app.js'], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Wait for server ready
  await waitForServerReady();
});

after(() => {
  // Restore fixture
  fs.writeFileSync(fixturesPath, originalFixtureData, 'utf-8');
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Helper to read today's appointments from fixture
function getTodayAppointments() {
  const data = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
  const today = new Date().toISOString().slice(0, 10);
  return data.appointments.filter(a => a.date === today && !a.canceled);
}

// Tests

describe('Clinic Front-Desk Appointment App', () => {
  it('should fetch today\'s appointments', async () => {
    const res = await fetch(`${BASE_URL}/appointments/today`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json));
    // All appointments must be for today and not canceled
    const today = new Date().toISOString().slice(0, 10);
    for (const appt of json) {
      assert.strictEqual(appt.date, today);
      assert.strictEqual(appt.canceled, false);
      assert.ok(appt.patient);
      assert.ok(appt.slot);
    }
  });

  it('should book a new appointment slot for a patient', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Find a free slot (e.g. 09:00) that is not booked
    const existing = getTodayAppointments();
    const bookedSlots = new Set(existing.map(a => a.slot));
    const candidateSlots = ['09:00', '09:30', '10:00', '10:30', '11:00'];
    const freeSlot = candidateSlots.find(s => !bookedSlots.has(s));
    assert.ok(freeSlot, 'No free slot available for test');

    const newBooking = {
      patient: 'Test Patient',
      date: today,
      slot: freeSlot
    };

    const res = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking)
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.patient, newBooking.patient);
    assert.strictEqual(json.date, newBooking.date);
    assert.strictEqual(json.slot, newBooking.slot);
    assert.strictEqual(json.canceled, false);

    // Verify it appears in today's appointments
    const res2 = await fetch(`${BASE_URL}/appointments/today`);
    const appts = await res2.json();
    assert.ok(appts.find(a => a.patient === newBooking.patient && a.slot === newBooking.slot));
  });

  it('should not allow booking overlapping slots', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Book a slot first
    const slot = '11:30';
    const booking1 = { patient: 'Overlap Test 1', date: today, slot };
    const res1 = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking1)
    });
    assert.strictEqual(res1.status, 201);

    // Try to book same slot again
    const booking2 = { patient: 'Overlap Test 2', date: today, slot };
    const res2 = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking2)
    });
    assert.strictEqual(res2.status, 409); // Conflict
  });

  it('should cancel an existing appointment', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Book a slot to cancel
    const slot = '12:00';
    const booking = { patient: 'Cancel Test', date: today, slot };
    const resBook = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking)
    });
    assert.strictEqual(resBook.status, 201);
    const bookedAppt = await resBook.json();

    // Cancel it
    const resCancel = await fetch(`${BASE_URL}/appointments/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookedAppt.id })
    });
    assert.strictEqual(resCancel.status, 200);
    const cancelJson = await resCancel.json();
    assert.strictEqual(cancelJson.canceled, true);

    // Verify it no longer appears in today's appointments
    const resToday = await fetch(`${BASE_URL}/appointments/today`);
    const appts = await resToday.json();
    assert.ok(!appts.find(a => a.id === bookedAppt.id));
  });

  it('should reject booking with invalid slot format', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const badBooking = { patient: 'Bad Slot', date: today, slot: '25:00' };
    const res = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badBooking)
    });
    assert.strictEqual(res.status, 400);
  });

  it('should reject canceling non-existent appointment', async () => {
    const res = await fetch(`${BASE_URL}/appointments/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'non-existent-id' })
    });
    assert.strictEqual(res.status, 404);
  });
});
