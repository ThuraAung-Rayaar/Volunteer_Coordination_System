"""
backend/ai/services/fallback_formatter.py

Deterministic, DTO-backed response formatter.
Used for no-data/clarification short-circuits and whenever an external or local
LLM provider fails, times out, hits quota (429), or returns empty/malformed text.
"""

from typing import Any, Dict, List


def format_deterministic_response(dto: Dict[str, Any]) -> str:
    """Render an accurate, plain-language explanation strictly from the supplied DTO."""
    intent = dto.get("intent", "")
    data = dto.get("data") or {}
    lang = str(dto.get("language") or "en").lower()
    is_my = lang.startswith("my")

    # Clarification or unavailable scope response
    if intent in ("clarification", "unavailable") or data.get("status") in ("clarification", "unavailable"):
        reason = data.get("reason") or (
            "Please select one of the available assistant prompts."
        )
        choices = data.get("choices") or []
        if choices:
            labels = "; ".join(c.get("label", c.get("key", "")) for c in choices if c.get("label") or c.get("key"))
            return f"{reason}\nAvailable options: {labels}"
        return str(reason)

    if data.get("clarification_needed"):
        choices = data.get("event_choices") or []
        if choices:
            lines = [
                f"- Event #{c['event_id']}: {c['event_title']} ({c.get('status')})"
                for c in choices
            ]
            header = (
                "ကျေးဇူးပြု၍ စစ်ဆေးလိုသော ပွဲတစ်ခုကို ရွေးချယ်ပါ-"
                if is_my
                else "Please specify which event you would like to inspect:"
            )
            return header + "\n" + "\n".join(lines)
        return str(data.get("reason") or "Please specify an event ID to continue.")

    if intent == "volunteer.next_steps":
        summary = data.get("summary") or {}
        apps = data.get("applications") or []
        assignments = data.get("assignments") or []
        if not apps and not assignments:
            return (
                "သင့်တွင် လက်ရှိလျှောက်လွှာ သို့မဟုတ် တာဝန်ပေးအပ်မှု မရှိသေးပါ။ အများပြည်သူဆိုင်ရာ ပွဲများကို ကြည့်ရှုပြီး လျှောက်ထားနိုင်ပါသည်။"
                if is_my
                else "You currently have no submitted applications or assignments. Browse upcoming public events to find a role that fits you."
            )
        lines: List[str] = [
            f"Summary: {summary.get('total_applications', 0)} application(s) "
            f"(pending: {summary.get('pending_applications', 0)}, "
            f"accepted: {summary.get('accepted_applications', 0)}, "
            f"waitlisted: {summary.get('waitlisted_applications', 0)}) and "
            f"{summary.get('active_assignments', 0)} active assignment(s)."
        ]
        if summary.get("accepted_without_assignment", 0) > 0:
            lines.append(
                f"{summary['accepted_without_assignment']} accepted application(s) do not have an active post assignment yet. "
                "Check My Applications for the coordinator's next update."
            )
        elif assignments:
            top = assignments[0]
            lines.append(
                f"Next assignment: {top.get('event_title')} "
                f"(assignment status: {top.get('assignment_status')}, "
                f"attendance: {top.get('attendance_status', 'expected')})."
            )
        elif summary.get("pending_applications", 0) > 0:
            lines.append("Your pending application(s) are awaiting coordinator review in My Applications.")
        return "\n".join(lines)

    if intent == "volunteer.my_applications":
        apps = data.get("applications") or []
        if not apps:
            return (
                "သင့်တွင် တင်သွင်းထားသော ပွဲလျှောက်လွှာ မရှိသေးပါ။"
                if is_my
                else "You currently have no submitted event applications."
            )
        lines = [f"You have {len(apps)} application(s):"]
        for app in apps[:5]:
            post = f" — {app['post_title']}" if app.get("post_title") else ""
            lines.append(f"- {app.get('event_title')}{post}: **{app.get('application_status')}**")
        return "\n".join(lines)

    if intent == "volunteer.my_assignments":
        assignments = data.get("assignments") or []
        if not assignments:
            return (
                "သင့်တွင် လက်ရှိတာဝန်ပေးအပ်မှု မရှိသေးပါ။"
                if is_my
                else "You currently have no assignments. An accepted application is separate from a confirmed shift assignment."
            )
        lines = [f"You have {len(assignments)} assignment(s):"]
        for asgn in assignments[:5]:
            post = f" ({asgn['post_title']})" if asgn.get("post_title") else ""
            att = asgn.get("attendance_status")
            att_text = f", attendance: {att}" if att else ""
            lines.append(
                f"- {asgn.get('event_title')}{post}: assignment **{asgn.get('assignment_status')}**{att_text}"
            )
        return "\n".join(lines)

    if intent == "volunteer.recommendations":
        results = data.get("results") or []
        if not results:
            return (
                "လက်ရှိသင့်ပရိုဖိုင်နှင့် ကိုက်ညီသော ပွဲမတွေ့သေးပါ။"
                if is_my
                else "No eligible matching events were returned for your current profile, availability, and open capacity filters."
            )
        lines = [f"Found {len(results)} matching event(s) ({data.get('policy_version', 'recommendation-v1')}):"]
        for item in results[:5]:
            reasons = "; ".join(item.get("reasons") or [])
            lines.append(
                f"- **{item.get('title')}** (Score: {item.get('match_score')}/100, {item.get('match_label')}) — {reasons}"
            )
        return "\n".join(lines)

    if intent == "volunteer.prepare_for_event":
        upcoming = data.get("upcoming_assignments") or []
        if not upcoming:
            return (
                "လာမည့် တာဝန်ပေးအပ်ထားသော ပွဲမရှိသေးပါ။"
                if is_my
                else "You have no upcoming active assignments to prepare for right now."
            )
        ev = upcoming[0]
        checkin_modes = []
        if ev.get("qr_registration_enabled"):
            checkin_modes.append("QR check-in")
        if ev.get("geo_checkin_enabled"):
            checkin_modes.append("geolocation check-in")
        modes_text = ", ".join(checkin_modes) if checkin_modes else "coordinator check-in"
        lines = [
            f"Upcoming assignment: **{ev.get('event_title')}**"
            + (f" ({ev['post_title']})" if ev.get("post_title") else ""),
            f"- Public location: {ev.get('location_name') or 'Not specified'}",
            f"- Shift window: {ev.get('schedule_start')} to {ev.get('schedule_end')}",
            f"- Check-in options: {modes_text} (opens {ev.get('geo_checkin_opens_before_min', 30)} min before start).",
        ]
        if ev.get("require_onboarding_ack"):
            lines.append("- Pre-shift onboarding acknowledgement is required before check-in.")
        return "\n".join(lines)

    if intent == "volunteer.checkin_help":
        policy = data.get("policy") or {}
        parts = [str(policy.get("content") or "")]
        ev = data.get("upcoming_event_checkin")
        if ev:
            geo_state = "enabled" if ev.get("geo_checkin_enabled") else "not enabled"
            qr_state = "enabled" if ev.get("qr_registration_enabled") else "not enabled"
            parts.append(
                f"For your next shift (**{ev.get('event_title')}**): geolocation check-in is {geo_state}, "
                f"QR registration is {qr_state}, and the check-in window opens "
                f"{ev.get('geo_checkin_opens_before_min', 30)} minutes before start."
            )
        return "\n\n".join(p for p in parts if p)

    if intent.endswith("policy_help"):
        policy = data.get("policy") or {}
        if not policy.get("verified", True):
            return "The assistant cannot verify this policy from current backend configuration."
        return str(policy.get("content") or "")

    if intent in ("public.events", "admin.public_events", "super_admin.public_events"):
        events = data.get("events") or []
        if not events:
            return "No upcoming public events are currently available."
        lines = [f"Found {len(events)} public upcoming event(s):"]
        for ev in events[:5]:
            lines.append(
                f"- **{ev.get('title')}** at {ev.get('location_name') or 'TBD'} "
                f"({ev.get('spots_remaining', 0)} spots remaining)"
            )
        return "\n".join(lines)

    if intent == "public.event_detail":
        ev = data.get("event") or {}
        posts = data.get("posts") or []
        return (
            f"**{ev.get('title')}** ({ev.get('status')}) — {ev.get('location_name') or 'Location TBD'}, "
            f"{ev.get('spots_remaining', 0)} spot(s) remaining across {len(posts)} post(s)."
        )

    if intent == "coordinator.my_events":
        events = data.get("events") or []
        if not events:
            return "You do not currently own or coordinate any events."
        lines = [f"You manage {len(events)} event(s):"]
        for ev in events[:5]:
            monitor_note = " [read-only owner monitor]" if ev.get("is_read_only_monitor") else ""
            lines.append(
                f"- **{ev.get('title')}** ({ev.get('status')}){monitor_note}: "
                f"{ev.get('assigned_count', 0)} assigned, {ev.get('pending_applications', 0)} pending"
            )
        return "\n".join(lines)

    if intent == "coordinator.next_steps":
        events = data.get("managed_events") or []
        if not events:
            return "You do not currently manage any active or upcoming events."
        lines = [f"Operational overview for {len(events)} managed event(s):"]
        for ev in events[:5]:
            monitor_note = " [read-only monitor]" if ev.get("is_read_only_monitor") else ""
            lines.append(
                f"- **{ev.get('event_title')}**{monitor_note} (readiness: {ev.get('readiness_status')}): "
                f"{ev.get('open_slots', 0)} open slot(s), {ev.get('pending_applications', 0)} pending application(s), "
                f"{ev.get('accepted_unassigned', 0)} accepted-unassigned"
            )
        return "\n".join(lines)

    if intent in ("coordinator.staffing", "coordinator.event_readiness", "super_admin.event_staffing"):
        if data.get("empty"):
            return "You do not currently manage any events."
        summary = data.get("summary") or {}
        signals = data.get("signals") or []
        title = data.get("event_title") or f"Event #{data.get('event_id')}"
        lines = [
            f"Staffing status for **{title}** (readiness indicator: {data.get('readiness_status')}):",
            f"- Required headcount: {summary.get('required_headcount', 0)}, "
            f"Assigned: {summary.get('assigned_count', 0)}, Open slots: {summary.get('open_slots', 0)}, "
            f"Coverage: {summary.get('coverage_percent', 0)}%",
            f"- Accepted unassigned: {summary.get('accepted_unassigned', 0)}, "
            f"Pending applications: {summary.get('pending_applications', 0)}, "
            f"Waitlisted: {summary.get('waitlisted_applications', 0)}",
            f"- Checked in: {summary.get('checked_in_count', 0)}, "
            f"Pending confirmations: {summary.get('pending_confirmations', 0)}",
        ]
        if data.get("is_read_only_monitor"):
            lines.append("- Note: You are viewing as a read-only owner monitor because coordination is delegated.")
        if signals:
            lines.append(
                "- Indicators: " + "; ".join(f"{s.get('title')} ({s.get('severity')})" for s in signals)
            )
        return "\n".join(lines)

    if intent == "coordinator.pending_applications":
        apps = data.get("pending_applications") or []
        waitlisted = data.get("waitlisted_count", 0)
        if not apps and not waitlisted:
            return "There are currently no pending or waitlisted applications across your managed events."
        lines = [f"You have {len(apps)} pending application(s) (plus {waitlisted} waitlisted):"]
        for item in apps[:5]:
            post = f" — {item['post_title']}" if item.get("post_title") else ""
            lines.append(f"- Application #{item.get('application_id')} for **{item.get('event_title')}**{post}")
        return "\n".join(lines)

    if intent == "coordinator.unassigned_accepted":
        rows = data.get("unassigned_accepted") or []
        if not rows:
            return "All accepted applications on your managed events already have an assignment."
        lines = [f"There are {len(rows)} accepted application(s) without an active post assignment:"]
        for item in rows[:5]:
            post = f" — {item['post_title']}" if item.get("post_title") else ""
            lines.append(f"- Application #{item.get('application_id')} for **{item.get('event_title')}**{post}")
        return "\n".join(lines)

    return "The assistant retrieved your current authorized information, but no summary template matched."
