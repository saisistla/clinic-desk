# SCRUM-2 — Add Surname Column

## Intent
Add patient surname on the front-desk list and booking form.

## System Context

Staff users interact with the Web UI, which communicates with the HTTP API. The API reads and writes fixture JSON data and exposes a health check endpoint.

## Components

- **Front-Desk Appointment Table**: Displays patient details including surname.
- **Booking Form**: Collects patient surname along with other booking details.
- **Backend API**: Handles surname data in appointment-related API endpoints.
- **Fixture Data**: Provides sample data including surnames for testing.
- **Health Check Endpoint**: GET /health returns system status.
- **Linting**: Ensures code quality.
- **Unit and Integration Tests**: Verify surname handling and overall functionality.

## APIs

| Method | Path                               | Purpose                              |
|--------|----------------------------------|------------------------------------|
| GET    | /health                          | Deploy verify — report ok           |
| GET    | /api/appointment-table-shows-surn | Appointment table shows surname     |
| GET    | /api/booking-form-collects-surnam | Booking form collects surname       |
| DELETE | /api/cancel-and-today-s-list-stil/:id | Cancel and today’s list still work |

## Request Flow

1. Staff opens the app.
2. UI requests GET /health, receives "ok".
3. Staff requests appointment table data with surnames.
4. Staff requests booking form data including surname.
5. Staff cancels an appointment via DELETE endpoint.
6. API reads/writes fixture JSON accordingly.

## Technologies

- Node.js for frontend and API server.
- Python for backend components and fixture data handling.

## In Scope

- Display surname in appointment table.
- Collect surname in booking form.
- Ensure cancel and today’s list endpoints work with surname data.

## Out of Scope

- Production database integration.
- Changes beyond this ticket.

## Assumptions

- Data model supports adding surname without major refactoring.
- UI changes limited to adding surname column and input field.
- Cancel and today’s list logic remains compatible with surname.
- Node used for frontend and API; Python for backend.

## Deploy

After linting, unit, and integration tests pass and deploy approval, deploy to **dev** environment. Rollback owner: **Platform on-call**.

## Planner Notes

- Front-Desk List: Add surname column.
- Booking Form: Add required surname input field.
- Backend: Support surname field in APIs.
- Platform Policy: Include fixture data, health check endpoint, linting, and tests.

---

License: MIT
