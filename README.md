# Clinic Front-Desk Appointment App

A simple single-page web app for clinic staff to manage today's appointments.

## Features
- View today's appointments
- Book 30-minute appointment slots
- Cancel existing appointments

## Architecture
- Node.js backend serves REST API and frontend
- Appointment data stored in `fixtures/data.json`
- Frontend: HTML/JavaScript single page
- Backend enforces 30-min slots and no overlaps

## API Endpoints
- `GET /api/appointments/today` - List today's appointments
- `POST /api/appointments` - Book a new appointment
- `DELETE /api/appointments/:id` - Cancel an appointment

## Setup
1. Install dependencies: `npm install`
2. Start server: `npm start`
3. Open browser at `http://localhost:3000`

## Testing
- Unit and integration tests included
- Run tests: `npm test`

## Health & Lint
- Health check endpoint: `/health`
- Linting configured per platform policy

## License
MIT