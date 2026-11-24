# 06 — AI and Analytics Consumer Readiness

## 1. Assistant Tool Dependency Matrix

| Tool Name | Backend Service / Query | Required DB Objects | Scope Boundary | Live Verified |
|---|---|---|---|:---:|
| `search_events` | `query_service.list_public_events()` | `VPublicEvents`, `charity_fields` | Public scope | **YES** |
| `get_event_detail` | `query_service.get_event_detail()` | `VPublicEvents`, `VEventPostCapacity` | Public scope | **YES** |
| `get_my_applications` | `EventApplications.objects.filter(user=actor)` | `event_applications`, `events` | Own user only | **YES** |
| `get_my_assignments` | `Assignments.objects.filter(user=actor)` | `assignments`, `events`, `event_posts` | Own user only | **YES** |
| `get_recommendations` | `get_recommendations_for_user(user)` | `VPublicEvents`, `VEventPostCapacity`, `EventPosts`, `user_charity_interests`, `volunteer_availability_rules` | Own user only | **YES** |
| `get_staffing_insight` | `get_staffing_insight(event_id)` | `Events`, `VEventSummary`, `VEventPostCapacity`, `Assignments`, `EventApplications` | Coordinator (own) / Super Admin | **YES** |
| `get_system_help` | `get_system_help_content(topic, role)` | Code content source | Role-filtered | **YES** |

## 2. Recommendation Engine Readiness (`recommendation-v1`)
- Authoritative availability checks delegate to PostgreSQL `fn_user_is_available_for_event()` and conflict checks.
- 1,367 availability rules and 298 exceptions present in the database.
- 1,583 user charity interests mapped across 13 charity fields.
- 475 open posts available across published/active events.
- Hard eligibility filters and 5 weighted dimensions (skills: 35, interests: 25, availability: 25, region: 10, role: 5) are supported by live relations.

## 3. Staffing Insight Engine Readiness
- `VEventSummary` view reconciles with base tables.
- `VEventPostCapacity` view reconciles with base posts and assignments.
- Confirmed status counts: 283 assigned, 1 confirmed, 681 completed.
- Identified defect DB-FIX-002: Service must include `completed` assignments when calculating accepted-unassigned backlog.
- Identified defect DB-FIX-003: Post coverage imbalance must recognize `status == 'full'` in addition to `remaining == 0`.
