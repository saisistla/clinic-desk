# SCRUM-2 — Add Surname Column

## Intent
Add patient surname on the front-desk list and booking form.

This file is the approved architecture. Code is written from this document. Revise it until you approve.

## System context

```mermaid
flowchart LR
  Staff[Staff] --> StaffUI[Web UI]
  StaffUI --> AppAPI[HTTP API]
  AppAPI --> FixtureStore[Fixture JSON]
  AppAPI --> Health[GET /health]
```

## Components

```mermaid
flowchart TB
  AppAPI[HTTP API]
  FrontDeskAppointmentTabl["Front-Desk Appointment Table"]
  BookingForm["Booking Form"]
  BackendAPI["Backend API"]
  FixtureData["Fixture Data"]
  HealthCheckEndpoint["Health Check Endpoint"]
  Linting["Linting"]
  AppAPI --> FrontDeskAppointmentTabl
  AppAPI --> BookingForm
  AppAPI --> BackendAPI
  AppAPI --> FixtureData
  AppAPI --> HealthCheckEndpoint
  AppAPI --> Linting
```

- **Front-Desk Appointment Table** (node) — Display patient details including surname in the appointment list
- **Booking Form** (node) — Collect patient surname along with other booking details
- **Backend API** (python) — Handle surname data in appointment-related API endpoints
- **Fixture Data** (python) — Provide sample data including surnames for testing
- **Health Check Endpoint** (python) — Provide GET /health endpoint for system health monitoring
- **Linting** (node) — Ensure code quality and style compliance
- **Unit Tests** (python) — Test individual components including surname handling
- **Integration Tests** (python) — Test end-to-end functionality including surname addition
- **Fixture store** — JSON under `fixtures/`. No production database.

## APIs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Deploy verify — report ok |
| GET | `/api/appointment-table-shows-surn` | Appointment table shows surname |
| GET | `/api/booking-form-collects-surnam` | Booking form collects surname |
| DELETE | `/api/cancel-and-today-s-list-stil/:id` | Cancel and today’s list still work |

## Request flow

```mermaid
sequenceDiagram
  actor Staff
  participant UI as Web UI
  participant API as HTTP API
  participant Store as Fixtures
  Staff->>UI: Open the app
  UI->>API: GET /health
  API-->>UI: ok
  Staff->>API: GET /health
  Staff->>API: GET /api/appointment-table-shows-surn
  Staff->>API: GET /api/booking-form-collects-surnam
  Staff->>API: DELETE /api/cancel-and-today-s-list-stil/:id
  API->>Store: read or write fixture JSON
  Store-->>API: records
  API-->>UI: JSON
```

## Technologies
- node
- python

After approval, this is implemented as a Node application. Allow-list: node, python. Packages: https://registry.npmjs.org, https://pypi.org. License: MIT.

## In scope
- Appointment table shows surname
- Booking form collects surname
- Cancel and today’s list still work

## Out of scope
- Production data access
- Work outside this ticket
- A pull request unless auto-open is enabled

## Assumptions
- The existing data model supports adding a surname field or can be extended without major refactoring.
- UI changes will be minimal and limited to adding a surname column and input field.
- No changes are required to cancel and today's list logic beyond ensuring compatibility with surname data.
- The repository uses node for frontend and python for backend components.

## Deploy
After lint, unit, and integration, and after deploy approval, pick Git and a cloud, then run the pipeline. Target **dev**. Rollback owner: **Platform on-call**.

## Planner notes
### Front-Desk List
- Display patient surname alongside existing patient details in the appointment table.

### Booking Form
- Add input field to collect patient surname.
- Validate surname input as required.

### Backend
- Ensure APIs support surname field for appointments.

### Platform Policy Compliance
- Include fixture data for testing surname field.
- Implement GET /health endpoint.
- Apply linting, unit, and integration tests.

