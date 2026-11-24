# Volunteer Coordination System (VCS)
# AI Chat Assistant, AI Features & Machine Learning Implementation Blueprint

**Source branch:** `main`  
**Reviewed commit:** `1cd22bd35f57b8983078c8e7d3445536e6b62e05`  
**Database contract:** v0.12.0 — Frozen / Immutable Schema  
**Backend:** Django 5.x, Django REST Framework  
**Database:** PostgreSQL 18.6  
**Mobile:** React Native 0.88.1  
**Admin interface:** Django templates, Tailwind CSS and Leaflet

---

## 1. Executive Summary

The VCS prototype already has a substantial business foundation:

- User accounts and identity verification.
- Volunteer profiles, skills, charity interests and availability.
- Event discovery, applications and invitations.
- Coordinator management and event operations.
- Volunteer assignments and capacity management.
- QR and GPS attendance.
- Feedback and moderation.
- Administrative dashboards, audit records and system maintenance.

The next opportunity is to introduce an intelligent assistance layer without disturbing the existing business architecture or frozen database.

The proposed system consists of:

1. **AI Chat Assistant:** A conversational interface for volunteers, coordinators and administrators.
2. **Intelligent Volunteer Matching:** Recommendations based on existing volunteer and event information.
3. **AI-Powered Operational Assistance:** Summaries, explanations and decision support for coordinators and administrators.
4. **Operational Anomaly Detection:** Identification of unusual attendance, check-in and operational patterns.
5. **Predictive Analytics:** Future staffing demand, volunteer engagement and retention insights, introduced only when sufficient data is available.

The database must remain unchanged throughout the initial implementation.

AI must operate through controlled backend services, not by connecting directly to PostgreSQL or executing arbitrary SQL.

---

## 2. Main Branch Analysis

### 2.1 Current architecture

The reviewed main branch uses the following architecture:

| Layer | Existing implementation |
|---|---|
| Mobile | React Native |
| Backend | Django 5.x |
| API | Django REST Framework |
| Database | PostgreSQL 18.6 |
| Admin UI | Django templates |
| Styling | Tailwind CSS |
| Mapping | Leaflet and offline MBTiles |
| Authentication | Tokenized OTP and DRF authentication |
| Business logic | Backend services and PostgreSQL functions |
| Database access | Database-first Django models |

The application already has distinct service areas:

- `backend/services/`
- `backend/bff/`
- `backend/admin_portal/`
- `backend/apps/`
- `backend/common/`

The AI implementation should follow this separation rather than introduce a second business-logic layer.

### 2.2 Existing business services

Important existing services that AI features can consume include:

| Service | Existing responsibility | AI opportunity |
|---|---|---|
| `application_service.py` | Applications and application decisions | Application assistance |
| `assignment_service.py` | Volunteer assignment | Matching recommendations |
| `availability_service.py` | Volunteer availability | Availability-aware recommendations |
| `attendance_service.py` | Attendance and confirmation | Attendance insights |
| `event_service.py` | Event operations | Event explanations |
| `coordinator_service.py` | Coordinator management | Coordinator assistance |
| `feedback_service.py` | Feedback and summaries | Feedback analysis |
| `geo_service.py` | GPS check-in | Operational anomaly analysis |
| `qr_service.py` | QR token operations | Check-in assistance |
| `query_service.py` | Read-oriented queries and dashboard data | Context retrieval |
| `verification_service.py` | Verification image handling | Verification workflow assistance |

These services should remain the authoritative source of business information.

### 2.3 Existing APIs

The current BFF is divided into four major API areas:

- Authentication: `backend/bff/auth/`
- Volunteer: `backend/bff/volunteer/`
- Check-in: `backend/bff/checkin/`
- Coordinator: `backend/bff/coordinator/`

The existing routes already cover many operations that an assistant may need to explain or retrieve information about.

Examples include:

- Public event discovery.
- Volunteer profile and availability.
- Applications and assignments.
- Coordinator event management.
- QR resolution and redemption.
- GPS check-in.
- Attendance history.
- Event feedback.

**Current gap:** I did not find a dedicated chat endpoint or a dedicated AI/ML module in the inspected main-branch API and dependency files.

The assistant therefore needs a new integration layer, not a replacement of the existing BFF.

---

## 3. Immutable Database Analysis

### 3.1 Database contract

The database specification explicitly declares:

**DATABASE FROZEN — Immutable Schema Contract as of v0.12.0 Stabilization.**

The database documentation reports:

| Database object | Existing quantity |
|---|---:|
| Base tables | 31 |
| SQL views | 11 |
| Stored procedures and trigger functions | 63, as reported in the admin architecture document |

The database specification also records a successful preflight audit on November 22, 2026.

Relevant source files:

- `docs/full_database_details.md`
- `postgres_sql/updated_volunteer_coordination_system_Database.sql`
- `scripts/db_preflight_check.py`
- `backend/common/schema.py`

### 3.2 Existing data that AI can use

The current schema already contains the information needed for several useful AI features.

| Existing data | Possible use |
|---|---|
| `users` | Volunteer profile and eligibility context |
| `user_charity_interests` | Interest-based event recommendations |
| `volunteer_availability_rules` | Schedule compatibility |
| `volunteer_availability_exceptions` | Date-specific availability |
| `coordinator_profiles` | Coordinator role and status |
| `events` | Event details and requirements |
| `event_posts` | Volunteer positions and required skills |
| `event_charity_fields` | Event category matching |
| `event_applications` | Application history |
| `assignments` | Existing allocation and commitment information |
| `attendance` | Attendance history |
| `attendance_geo_attempts` | GPS check-in evidence |
| `feedback` | Volunteer and coordinator feedback |
| `audit_logs` | Administrative audit history |
| `moderation_actions` | Moderation decisions |

This is sufficient to start building a useful recommendation and assistance system without creating new core database tables.

### 3.3 Important database constraints

The database is not simply a collection of ordinary editable tables.

It has database-enforced business rules, triggers, stored procedures and append-only records.

Examples include:

- `audit_logs` cannot be updated, deleted or truncated.
- `event_coordinator_history` is append-only.
- `moderation_actions` is append-only.
- `onboarding_acknowledgments` is append-only.
- `attendance_geo_attempts` preserves evidence and restricts changes.
- `users.phone_hash` is immutable.
- Uploaded verification images cannot be altered in place.
- Event ownership cannot be changed.
- Assignment identity and attendance identity have immutable fields.

The important distinction is:

**A frozen database schema does not mean all database records are immutable.** Existing business operations can still make permitted changes through their approved workflows.

AI must respect these rules and must never bypass the existing database enforcement.

### 3.4 Django database-first requirement

The existing Django models use `managed = False` for the database-owned entities.

This is important because Django should not attempt to manage or generate migrations for the frozen business schema.

The AI implementation must not:

- Add chat tables to the existing database.
- Add embedding columns.
- Add vector extensions.
- Add AI model metadata tables.
- Add conversation-history tables.
- Alter existing views.
- Replace stored procedures.
- Modify database triggers.
- Change existing business constraints.

Any future proposal that requires a database change must be treated as a separate architecture decision, not as part of the initial AI implementation.

---

## 4. Proposed AI System Architecture

### 4.1 Recommended architecture

Introduce a separate AI integration layer inside the existing Django backend.

```text
                 VCS CLIENT APPLICATIONS
       ┌──────────────────┬─────────────────────┐
       │ React Native App │ Django Admin Portal │
       └─────────┬────────┴──────────┬──────────┘
                 │                  │
                 └────────┬─────────┘
                          │
                    AI Chat Interface
                          │
                 POST /assistant/chat/
                          │
                 Django AI Integration
                          │
          ┌───────────────┼────────────────┐
          │               │                │
     Identity &       Context          AI Provider
     Permissions      Retrieval        Adapter
          │               │                │
          │       Existing Services        │
          │               │                │
          │       Existing BFF /           │
          │       Query Services           │
          │               │                │
          └───────────────┼────────────────┘
                          │
                    PostgreSQL
                 Frozen Database Contract
```

The diagram represents a proposed design, not an existing implementation.

### 4.2 Suggested backend structure

Create a separate package:

```text
backend/
    ai/
        __init__.py

        api/
            __init__.py
            urls.py
            views.py
            serializers.py

        services/
            chat_service.py
            context_service.py
            intent_service.py
            response_service.py

        providers/
            base_provider.py
            llm_provider.py

        tools/
            volunteer_tools.py
            coordinator_tools.py
            admin_tools.py

        matching/
            scoring_service.py
            matching_explanations.py

        analytics/
            anomaly_service.py
            prediction_service.py

        security/
            data_redaction.py
            permission_guard.py
            prompt_guard.py

        tests/
```

This structure is a proposal. It should be adjusted to match the actual import and application conventions in the repository before implementation.

### 4.3 AI provider abstraction

Do not tightly couple VCS to one AI vendor.

Create a provider interface so that the application can switch between:

- Hosted LLM APIs.
- Locally hosted models.
- Different model providers for different tasks.

The provider should support:

- Sending conversation context.
- Receiving structured responses.
- Tool/function calling where supported.
- Token and usage tracking.
- Timeouts and error handling.
- Model configuration.
- Provider-level rate limits.

The provider must not receive unrestricted database access.

The exact provider and model should be selected after reviewing cost, privacy, language support and hosting requirements.

---

## 5. AI Chat Box Implementation

### 5.1 Chat box purpose

The chat box should be an intelligent assistant integrated into the existing VCS application.

It should not be a generic chatbot that only answers unrelated questions.

It should understand the VCS business domain and help users perform and understand their existing workflows.

### 5.2 Role-aware assistant

The assistant should change its available context and capabilities according to the authenticated user's permissions.

| User role | Assistant responsibilities |
|---|---|
| General user | Explain events, registration and application workflows |
| Volunteer | Find suitable events, explain applications, assignments and availability |
| Coordinator | Summarize event operations, applicants, assignments and attendance |
| Administrator | Explain system metrics, identify operational concerns and summarize administrative information |

An account may have multiple roles. The assistant should use the authenticated account's actual permissions rather than assume that every account has exactly one role.

### 5.3 Volunteer assistant examples

A volunteer could ask:

- Which upcoming events match my interests?
- Why am I not eligible for this event?
- What events match my availability?
- What is the status of my applications?
- When is my next assignment?
- How do I check in using QR?
- Why did my GPS check-in fail?
- Can I cancel this assignment?
- What does my attendance history show?

The assistant retrieves the relevant information through existing backend services.

It explains the result but does not independently override business rules.

### 5.4 Coordinator assistant examples

A coordinator could ask:

- Summarize my current events.
- Which event positions still need volunteers?
- How many accepted applications are not assigned?
- Which applicants match this event's requirements?
- Which attendance confirmations are pending?
- Explain the attendance status of this event.
- What should I prioritize before the event starts?

The assistant should use event-specific permissions and should never expose information from events that the coordinator is not authorized to access.

### 5.5 Administrator assistant examples

An administrator could ask:

- Summarize the current system status.
- How many active events are there?
- Which events have staffing shortages?
- Show the current coordinator application situation.
- Summarize recent geo-check-in issues.
- Explain unusual attendance patterns.
- Summarize recent moderation activity.
- Explain the current dashboard metrics.

Administrative operations must remain under the existing admin authorization system.

The assistant should not perform sensitive actions merely because a user requested them in natural language.

### 5.6 Proposed chat API

A new endpoint can be introduced:

`POST /api/v1/assistant/chat/`

This is a proposed route; it does not currently exist.

Example request:

```json
{
  "message": "Find events that match my interests and availability.",
  "conversation": [
    {
      "role": "user",
      "content": "I prefer environmental activities."
    },
    {
      "role": "assistant",
      "content": "I can check suitable upcoming events."
    }
  ],
  "language": "en"
}
```

The server should derive the user's identity and roles from authenticated credentials.

Do not accept a client-provided role or user ID as authoritative.

Example response:

```json
{
  "success": true,
  "answer": "I found several upcoming events that match your interests.",
  "suggested_actions": [
    {
      "type": "open_event",
      "event_id": 102
    }
  ],
  "usage": {
    "input_tokens": 420,
    "output_tokens": 180
  }
}
```

The response structure is illustrative and must be finalized during API design.

### 5.7 Conversation history without database changes

For the first prototype, do not persist chat messages in PostgreSQL.

Use:

- Client-side conversation state in React Native.
- Client-side conversation state in the admin portal.
- A bounded conversation window sent with each request.
- Server-side context retrieval for relevant VCS information.

This allows the chat box to work without a new conversation table.

For the first version, conversation history can disappear when the user clears the session or starts a new conversation.

If persistent history becomes a requirement, consider an independent conversation storage service with its own security and retention policy. Do not quietly add it to the frozen VCS database.

---

## 6. Retrieval-Augmented Generation (RAG)

A useful VCS assistant needs accurate knowledge of the system.

RAG can provide that knowledge without modifying the database.

### 6.1 Knowledge sources

The assistant can retrieve information from:

1. VCS system documentation.
2. User guides.
3. Event policies and rules.
4. Existing API documentation.
5. Existing service-level read operations.
6. Authenticated user-specific business information.

### 6.2 Two different retrieval mechanisms

**Static knowledge retrieval**

Used for:

- Explaining application rules.
- Describing QR check-in.
- Explaining attendance statuses.
- Explaining event lifecycle.
- Answering system usage questions.

The documents can be indexed outside the core database or loaded through a lightweight document retrieval mechanism.

**Live business-data retrieval**

Used for:

- Application status.
- Upcoming assignments.
- Event capacity.
- Volunteer availability.
- Attendance status.
- Administrative metrics.

Live information must come from existing backend services and authorized query functions.

The LLM should not invent these values.

### 6.3 Why direct SQL access should be prohibited

Do not give the LLM:

- Database credentials.
- Direct SQL execution.
- Arbitrary ORM access.
- Unrestricted stored procedure execution.
- Direct access to private media paths.

Instead, expose a controlled set of backend tools.

For example:

```text
get_my_applications()
get_my_assignments()
get_my_availability()
list_public_events(filters)
get_event_summary(event_id)
get_event_capacity(event_id)
get_event_attendance(event_id)
get_admin_dashboard()
get_geo_attempt_summary(event_id)
```

These are conceptual tool names. Each must be mapped to an existing service or a new permission-checked read-only wrapper.

---

## 7. Intelligent Volunteer and Event Matching

### 7.1 Existing foundation

The VCS already contains the data needed for intelligent matching:

- Volunteer skills.
- Volunteer charity interests.
- Availability rules.
- Availability exceptions.
- Event categories.
- Event post requirements.
- Required skills.
- Physical requirements.
- Volunteer experience indicators.
- Event capacity.
- Application and assignment status.

The repository also has an existing assignment service and PostgreSQL auto-assignment workflow.

**Important:** The existing automatic assignment is a business-rule-based mechanism, not proof that a machine-learning model already exists.

### 7.2 Recommended first implementation

Build a deterministic recommendation engine before training an ML model.

For example, calculate a compatibility score:

| Factor | Example weight |
|---|---:|
| Skill compatibility | 30% |
| Availability compatibility | 25% |
| Charity interest compatibility | 20% |
| Physical and role eligibility | 15% |
| Experience compatibility | 10% |

These are initial proposed weights, not existing VCS business rules. They must be validated with actual event requirements and coordinator feedback.

The engine should:

1. Retrieve eligible volunteers.
2. Check existing business restrictions.
3. Calculate compatibility.
4. Rank suitable volunteers.
5. Explain why each volunteer matches.
6. Present recommendations to the coordinator.

The existing assignment workflow remains responsible for the final assignment.

### 7.3 Example recommendation

```text
Recommended Volunteer

Compatibility: 88%

Reasons:
- Matches the event's environmental category.
- Has the required skills.
- Availability overlaps with the event schedule.
- Meets the event's physical requirements.

Coordinator decision:
[Review] [Assign]
```

The recommendation score must never override eligibility, event capacity, schedule conflicts or authorization rules.

---

## 8. Additional AI and ML Opportunities

### 8.1 Operational anomaly detection

**Priority: High**

Use existing operational records to identify suspicious or unusual activity.

Potential signals:

- Repeated rejected GPS check-ins.
- Unusual location accuracy patterns.
- Excessive QR redemption attempts.
- Unexpected attendance patterns.
- Repeated failed application operations.
- Unusual changes in event staffing.

Start with deterministic rules and thresholds.

Later, introduce anomaly-detection models if the prototype produces enough historical data.

The system should produce an alert and supporting evidence, not automatically accuse or penalize a volunteer.

### 8.2 Volunteer engagement and retention analytics

**Priority: Medium**

Potential insights:

- Volunteers who have become inactive.
- Volunteers who regularly participate.
- Application-to-assignment conversion.
- Attendance consistency.
- Event participation trends.
- Changes in volunteer engagement.

Start with descriptive analytics and transparent rules.

Predictive churn models should wait until the dataset contains enough representative history.

### 8.3 Event staffing demand prediction

**Priority: Medium**

Use historical information to estimate:

- Expected application volume.
- Volunteer shortages.
- Event staffing requirements.
- Demand by charity category.
- Participation patterns over time.

A first version can use historical averages and simple statistical forecasts.

More advanced ML should only be introduced after model evaluation demonstrates meaningful improvement over those baselines.

### 8.4 Feedback intelligence

**Priority: Medium**

The existing feedback system can support:

- Feedback summaries.
- Common issue identification.
- Feedback trends.
- Coordinator performance summaries.
- Sentiment classification.

Begin with summarization and basic text classification.

Do not treat automated sentiment analysis as a final moderation decision.

### 8.5 AI document and verification assistance

**Priority: Low / Separate review**

Identity verification is sensitive.

The existing system already has verification image handling, encrypted storage and review workflows.

Do not send identity documents, selfies or decrypted verification images to a general-purpose external LLM.

Any future computer-vision verification system should have a separate privacy, security, accuracy and human-review assessment.

---

## 9. Database-Free AI Implementation Strategy

The recommended initial design keeps the existing PostgreSQL contract intact.

| Feature | Core database change? | Initial implementation |
|---|---|---|
| Chat interface | No | Client-side conversation state |
| LLM integration | No | Backend provider adapter |
| RAG | No | External/static document index |
| Volunteer matching | No | Existing data + deterministic scoring |
| Event recommendations | No | Existing query services |
| Operational summaries | No | Existing views and services |
| Anomaly detection | No | Read-only service calculations |
| Predictive analytics | No | External analysis/model runtime |
| Chat history persistence | Not in initial scope | Client-side state |

The first version should not introduce a vector extension, new database schema, or a database migration.

If an independent external service is introduced, it must not become an uncontrolled second source of truth for VCS business records.

---

## 10. Security, Privacy and Governance

AI must be treated as an untrusted decision-support component.

### 10.1 Identity and authorization

- Authenticate every chat request.
- Derive the actor from trusted authentication.
- Check permissions before retrieving data.
- Enforce event ownership and coordinator scope.
- Apply admin permissions to administrative tools.
- Do not trust role information supplied by the LLM.

### 10.2 Sensitive data

The current database protects phone information using `phone_hash` and `phone_enc`.

The AI integration must:

- Never expose phone hashes.
- Never send encrypted phone values to an LLM as useful context.
- Avoid sending emergency contact details.
- Avoid sending identity verification images.
- Redact sensitive personal information.
- Avoid transmitting exact GPS coordinates unless strictly necessary and explicitly approved.

Use aggregated or pseudonymized information whenever possible.

### 10.3 Action safety

Separate AI recommendations from business operations.

For example:

```text
User asks:
"Cancel this assignment."

Assistant:
Explains the cancellation policy.

Backend:
Checks the actual user's permissions and business rules.

Result:
The existing assignment service accepts or rejects the operation.

Assistant:
Reports the real backend result.
```

The LLM must never report that an operation succeeded before the backend confirms it.

### 10.4 Audit and observability

Record appropriate operational metadata:

- Request ID.
- Authenticated actor.
- Requested assistant capability.
- Provider and model identifier.
- Response status.
- Token usage.
- Duration.
- Tool invocation names.
- Error classification.

Do not use the append-only audit table as a general chat transcript store.

Avoid recording raw prompts containing personal data unless an explicit retention and privacy policy permits it.

---

## 11. Recommended Implementation Phases

### Phase 1 — AI foundation

**Objective:** Establish a secure AI integration layer.

Tasks:

1. Review current Django application registration and API conventions.
2. Create the AI package.
3. Define the provider interface.
4. Configure provider credentials through environment variables.
5. Implement authenticated chat request handling.
6. Add permission checks and data redaction.
7. Add usage limits and timeout handling.
8. Write unit tests using mocked AI responses.

No database changes.

### Phase 2 — Basic chat box

**Objective:** Make the assistant usable from mobile and admin.

Tasks:

1. Build reusable React Native chat UI.
2. Build an admin portal chat panel.
3. Connect the chat UI to the proposed endpoint.
4. Implement conversation state.
5. Add loading, timeout and error states.
6. Add clear-conversation functionality.
7. Add role-specific initial prompts.
8. Add language selection.

Start with English and introduce additional supported languages after response quality is evaluated.

### Phase 3 — Context-aware assistant

**Objective:** Let the assistant understand actual VCS business data.

Tasks:

1. Implement controlled context tools.
2. Connect volunteer tools to existing services.
3. Connect coordinator tools to authorized event services.
4. Connect admin tools to existing dashboard and monitoring services.
5. Add static documentation retrieval.
6. Add response grounding and source references.
7. Test authorization boundaries.

### Phase 4 — Intelligent recommendations

**Objective:** Add useful matching and recommendations.

Tasks:

1. Implement a deterministic scoring service.
2. Use existing volunteer and event information.
3. Apply existing eligibility checks.
4. Return compatibility explanations.
5. Present recommendations to coordinators.
6. Compare recommendations against actual assignments.
7. Tune weights using coordinator feedback.

Do not replace the existing assignment engine.

### Phase 5 — Operational intelligence

**Objective:** Introduce analytical capabilities.

Tasks:

1. Build operational summary services.
2. Add rule-based anomaly detection.
3. Add staffing shortage indicators.
4. Add participation and attendance reports.
5. Build model evaluation datasets using approved, minimized data.
6. Establish baseline metrics.
7. Introduce predictive models only when justified.

### Phase 6 — Model improvement

**Objective:** Move from deterministic intelligence to validated ML.

Potential models:

- Volunteer-event ranking.
- Staffing demand forecasting.
- Volunteer engagement prediction.
- Attendance anomaly detection.
- Feedback classification.

Every model must have a measurable baseline, test dataset, evaluation criteria, monitoring and a fallback mechanism.

---

## 12. Recommended Technology Choices

The initial implementation should reuse the existing technology stack.

| Component | Recommendation |
|---|---|
| Backend | Existing Django and DRF |
| Mobile UI | Existing React Native |
| Admin UI | Existing Django templates |
| Database | Existing PostgreSQL, unchanged |
| LLM integration | Provider adapter |
| Knowledge retrieval | Static documents and controlled live-service retrieval |
| Matching | Python deterministic scoring |
| Data processing | Python |
| ML experimentation | Separate offline model-development environment |
| Model serving | Separate service or isolated backend adapter |
| Chat transport | HTTP request/response first |
| Real-time updates | Consider SSE/WebSockets later if needed |

The current base Python requirements do not include a dedicated ML framework or LLM SDK. The mobile dependency list also does not include an AI/chat SDK.

Do not install large ML packages in the main backend just to support the first chat prototype.

Use a provider adapter and keep optional ML dependencies isolated.

---

## 13. Testing and Acceptance Criteria

### Chat assistant

- Authenticated users can access the assistant.
- Unauthorized users cannot retrieve protected information.
- The assistant respects multi-role accounts.
- Conversation state works without database persistence.
- Provider failures produce understandable errors.
- The assistant does not invent application or attendance statuses.
- Sensitive fields are redacted before provider requests.
- Token usage and response duration are measurable.

### Recommendations

- Eligibility is checked before ranking.
- Availability conflicts are respected.
- Event capacity is respected.
- Scores have understandable explanations.
- Existing assignment workflows remain authoritative.
- Recommendations can be disabled without breaking normal VCS operations.

### ML analytics

- Models are evaluated against a baseline.
- Small datasets do not produce unjustified confidence.
- Sensitive attributes are not used without an explicit approved purpose.
- Model output is advisory.
- A deterministic fallback exists.
- Model quality is monitored after deployment.

### Database

- No new core tables.
- No schema migrations.
- No new triggers.
- No new stored procedures.
- No changes to existing database views.
- No direct LLM database connection.
- Frozen database preflight continues to pass.

---

## 14. Main Risks and Decisions

| Risk | Recommended response |
|---|---|
| LLM invents business information | Retrieve live data through controlled services |
| LLM exposes private information | Permission checks and redaction |
| Provider costs increase | Token limits, rate limits and usage monitoring |
| Small dataset produces unreliable ML | Start with rules and descriptive analytics |
| AI conflicts with database rules | Existing services and PostgreSQL remain authoritative |
| Persistent chat requires new schema | Use client-side history first |
| External provider processes sensitive data | Privacy review and minimized context |
| AI action is reported incorrectly | Require backend confirmation |

### Decisions required before implementation

1. **Assistant availability:** Should the first assistant be available to volunteers, coordinators and administrators, or should the prototype begin with administrators only?
2. **AI provider:** Should the first version use a hosted LLM provider or a locally hosted model?
3. **Conversation history:** Is temporary client-side history sufficient, or is persistent history an essential requirement?
4. **Language support:** Should English be the first supported language, followed by Myanmar language support?
5. **First intelligent feature:** Should volunteer-event matching or the general-purpose chat assistant be the first functional AI feature?

---

## 15. Final Recommendation

Do not start by building several machine-learning models.

The best implementation sequence for this prototype is:

1. Build the secure AI integration foundation.
2. Add a role-aware chat box to the mobile application and admin portal.
3. Connect the assistant to existing VCS services through controlled tools.
4. Add documentation retrieval so the assistant understands VCS rules.
5. Build deterministic volunteer-event matching.
6. Add operational anomaly detection.
7. Introduce predictive ML after collecting sufficient, approved data.

This approach makes the prototype intelligent without destabilizing the existing system.

**The central architectural rule is:**

> AI understands, explains, recommends and assists. The existing VCS backend and frozen PostgreSQL business rules remain responsible for authorization, validation, decisions and actual operations.

The database remains unchanged, and the existing mobile, backend and admin architecture remains the foundation of the product.