import re
from typing import Any, Dict, List, Optional
from .base import BaseAIProvider


class MockAIProvider(BaseAIProvider):
    """
    Deterministic rule-based mock provider for offline development,
    CI test runs, and safe fallback when AI_API_KEY is not configured.
    """

    def __init__(self, model_name: str = "mock-vcs-assistant-v1"):
        self.model_name = model_name

    def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        system_instruction: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        available_tool_names = {t.get("name") for t in (tools or [])}

        # If tool results are provided, format them into an authoritative answer
        if tool_results:
            return self._format_tool_results_reply(tool_results)

        # Get latest user message
        user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                user_message = m.get("content", "").lower()
                break

        # Check for tool call triggers based on user intent
        tool_calls = []

        if ("recommend" in user_message or "fit" in user_message or "match" in user_message or "suitable" in user_message) and "get_recommendations" in available_tool_names:
            tool_calls.append({"name": "get_recommendations", "arguments": {"limit": 5}})
        elif ("staffing" in user_message or "gap" in user_message or "coverage" in user_message) and "get_staffing_insight" in available_tool_names:
            # Extract event ID if present in text
            match = re.search(r'\b(?:event\s*#?|id\s*#?)(\d+)\b', user_message)
            event_id = int(match.group(1)) if match else 1
            tool_calls.append({"name": "get_staffing_insight", "arguments": {"event_id": event_id}})
        elif ("my application" in user_message or "applied" in user_message or "status" in user_message) and "get_my_applications" in available_tool_names:
            tool_calls.append({"name": "get_my_applications", "arguments": {}})
        elif ("my assignment" in user_message or "my shifts" in user_message or "assigned" in user_message) and "get_my_assignments" in available_tool_names:
            tool_calls.append({"name": "get_my_assignments", "arguments": {}})
        elif ("event" in user_message or "search" in user_message or "find" in user_message or "upcoming" in user_message or "clean" in user_message) and "search_events" in available_tool_names:
            tool_calls.append({"name": "search_events", "arguments": {"query": user_message[:50].strip()}})
        elif ("how" in user_message or "rule" in user_message or "help" in user_message or "cancel" in user_message or "checkin" in user_message) and "get_system_help" in available_tool_names:
            topic = "cancellation" if "cancel" in user_message else "checkin" if "checkin" in user_message else "general"
            tool_calls.append({"name": "get_system_help", "arguments": {"topic": topic}})

        if tool_calls:
            return {
                "content": "",
                "tool_calls": tool_calls,
                "usage": {"prompt_tokens": 120, "completion_tokens": 30},
                "model": self.model_name,
            }

        # Fallback direct conversational response
        return {
            "content": (
                "Hello! I am the VCS Assistant. I can help you find volunteer events, "
                "check your application and assignment status, view event recommendations, "
                "or explain system workflows like check-ins and cancellations. What would you like to know?"
            ),
            "tool_calls": [],
            "usage": {"prompt_tokens": 80, "completion_tokens": 45},
            "model": self.model_name,
        }

    def _format_tool_results_reply(self, tool_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        parts = []
        for tr in tool_results:
            name = tr.get("name")
            res = tr.get("result", {})

            if name == "get_recommendations":
                items = res.get("results", [])
                if not items:
                    parts.append("I checked upcoming events against your interests and availability, but no open events currently match your profile.")
                else:
                    parts.append(f"I found {len(items)} event(s) matching your profile:")
                    for it in items[:3]:
                        ev = it.get("event", {})
                        reasons = ", ".join(it.get("reasons", []))
                        parts.append(f"- **{ev.get('title')}** (Score: {it.get('match_score')}/100) — {reasons}")

            elif name == "get_staffing_insight":
                summary = res.get("summary", {})
                signals = res.get("signals", [])
                title = res.get("event_title", f"Event #{res.get('event_id')}")
                parts.append(
                    f"Staffing insight for **{title}**:\n"
                    f"- Required: {summary.get('required_headcount', 0)}, Assigned: {summary.get('assigned_count', 0)}, Open: {summary.get('open_slots', 0)}\n"
                    f"- Coverage: {summary.get('coverage_percent', 0)}%\n"
                    f"- Accepted unassigned: {summary.get('accepted_unassigned', 0)}, Pending: {summary.get('pending_applications', 0)}"
                )
                if signals:
                    sig_titles = [f"{s.get('title')} ({s.get('severity')})" for s in signals]
                    parts.append("Signals detected: " + "; ".join(sig_titles))

            elif name == "get_my_applications":
                apps = res.get("applications", [])
                if not apps:
                    parts.append("You currently have no submitted event applications.")
                else:
                    parts.append(f"You have {len(apps)} application(s):")
                    for a in apps[:3]:
                        parts.append(f"- Application #{a.get('id')} for Event #{a.get('event_id')} — Status: **{a.get('status')}**")

            elif name == "get_my_assignments":
                assigns = res.get("assignments", [])
                if not assigns:
                    parts.append("You currently have no confirmed event assignments.")
                else:
                    parts.append(f"You have {len(assigns)} confirmed assignment(s):")
                    for a in assigns[:3]:
                        parts.append(f"- Assignment #{a.get('id')} for Event #{a.get('event_id')} — Status: **{a.get('status')}**")

            elif name == "search_events":
                events = res.get("events", [])
                if not events:
                    parts.append("No public upcoming events matched your search query.")
                else:
                    parts.append(f"Here are {len(events)} upcoming events:")
                    for e in events[:3]:
                        parts.append(f"- **{e.get('title')}** at {e.get('location_name', 'TBD')} ({e.get('spots_remaining', 0)} spots remaining)")

            elif name == "get_system_help":
                topic = res.get("topic", "System")
                content = res.get("content", "")
                parts.append(f"**{topic.title()} Guidance**:\n{content}")

            else:
                parts.append(f"Information retrieved successfully from {name}.")

        return {
            "content": "\n\n".join(parts),
            "tool_calls": [],
            "usage": {"prompt_tokens": 150, "completion_tokens": 120},
            "model": self.model_name,
        }
