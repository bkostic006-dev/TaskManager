# Senior Full Stack Engineer — Test Brief

> **Verbatim transcription** of the PDF issued by Catena Media. Wording is unchanged; only headings and lists are reformatted as markdown. **This is the requirements source of truth — where it conflicts with any plan document, the brief wins.**

---

## Project Title: SaaS-style Task Manager

Build a full-stack Task Manager web application. The app must allow users to sign up, log in, and manage tasks, with strong emphasis on modular architecture, clean domain modeling, and scalable code organization. The feature set is minimal but must be implemented with professional standards in mind.

## Tech Stack Overview

### Frontend
- React with TypeScript
- Next.js
- Tailwind CSS, Mantine UI, or any modern CSS framework of your choice

### Backend
- Node.js with NestJS
- PostgreSQL
- Prisma or TypeORM

Microservice-based architecture using:
- API Gateway
- Auth Service
- Task Service
- Services should communicate via any transport layer such as HTTP, TCP, or gRPC

### Infrastructure & Tooling
- Docker and docker-compose for local orchestration
- Git for version control with a clear and meaningful commit history

## Functional Requirements

### User Authentication
- Users must be able to sign up and log in via the API Gateway
- Authentication should be handled with JWTs using access and refresh tokens
- Support for refresh token rotation must be included

### Task Management
- Users should be able to create, view, update, delete, and mark tasks as complete
- Tasks must support pagination with page size and page selector
- Filtering should be available by completion status and keyword
- Sorting should be implemented by date and completion status

### Frontend Requirements
- The layout must be fully responsive and include loading indicators for user interactions
- Toasts or equivalent feedback mechanisms should inform users of actions or errors
- API interaction should be abstracted using reusable hooks or service functions

## Backend Service Responsibilities

### Auth Service
- Encapsulates all user-related logic
- Provides authentication via JWTs with both access and refresh tokens

### Task Service
- Handles full CRUD operations for tasks
- Includes business logic related to task completion
- Supports basic pagination, filtering, and sorting
- Only accessible to authenticated users via the API Gateway

### API Gateway
- Acts as the central entry point for all client requests
- Forwards requests to the appropriate microservice
- Handles global validation, request logging, authentication guards, and exception filtering

## Design and Architecture Guidelines
- All services should follow clean architecture principles
- Make sure to use DTO's and the necessary validators
- HTTP status codes must be used consistently
- Use global exception error handling

## Bonus Considerations (Optional)
- Implement NestJS rate limiting and caching where applicable
- Use RxJS to handle service-to-service communication or implement retry logic

## Submission Instructions

Host the project in a GitHub repository (public or private)

Include a README file explaining:
- How to run the application locally
- Key design decisions and trade-offs
- Known limitations and potential future improvements

Grant repository access to: Matthew Farrugia (GitHub: MFarrugiaCatena) & Ricardo Gomes

> Their email addresses appeared here in the original document and have been redacted: this repository is public, and publishing two people's work addresses is not something they agreed to. The GitHub handle is kept because it is already a public identifier and is what the invitation needs.

---

# ⚠️ Not part of the brief — read before asking

The transcription above is complete. Everything below is orientation, added to prevent re-litigating what the document does and doesn't contain.

**The brief is silent on all of these. Silence = your decision to make, not a gap to fill with assumptions:**

| Question | Answer |
|---|---|
| Grading rubric or weights? | **None.** "Design and Architecture Guidelines" is the closest thing to one |
| Time expectation / hour cap? | **None stated.** Not a single hour figure appears |
| Deadline date? | **Not in the document.** Came via recruiter — ask the human |
| AI tool use — required, forbidden, disclosed? | **Completely silent.** Committing agent config is a judgment call, and it's the human's |
| Deployed URL or demo video? | **Not required.** GitHub repo + README + reviewer access is the whole deliverable |
| Will reviewers run it or only read it? | **Not stated**, but a required "how to run locally" section plus mandated docker-compose implies they intend to run it |
| Library versions? | **Unspecified.** Nothing requires latest majors — pin to stable |
| Due dates on tasks? | **Not mentioned.** Any `dueDate` field is an addition, not a requirement |
| Visual design standard? | **None.** Responsive + loading indicators + toasts + hooks abstraction are specified; aesthetics are not |

**Fixed by the brief (not negotiable):** microservice split into API Gateway + Auth Service + Task Service · React + TypeScript + Next.js · NestJS + Node · PostgreSQL · Prisma or TypeORM · Docker + docker-compose · Git with meaningful commit history · access + refresh tokens **with rotation** ("must be included" — the only *must* in the document).

**Explicitly free choices:** transport layer (HTTP / TCP / gRPC) · CSS framework (Mantine is named as acceptable) · Prisma vs TypeORM · public vs private repo.
