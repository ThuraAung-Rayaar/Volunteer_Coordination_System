"""
backend/ai/services/prompt_catalog.py

Backend-owned, versioned, role-aware prompt catalogue.
Derived strictly from authenticated server actor scope (determine_actor_scope).
"""

from typing import Any, Dict, List

from django.db.models import Q
from django.utils import timezone

from ai.security.scope_policy import (
    ACTOR_SCOPE_ADMIN,
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_SUPER_ADMIN,
    ACTOR_SCOPE_VOLUNTEER,
    determine_actor_scope,
)
from apps.coordination.models import Assignments
from apps.events.models import Events

CATALOG_VERSION = "vcs.prompts.v1"

# Prompt catalog definitions per actor scope.
# Labels and descriptions are localized for English ('en') and Myanmar ('my').
PROMPT_DEFINITIONS_BY_SCOPE: Dict[str, List[Dict[str, Any]]] = {
    ACTOR_SCOPE_VOLUNTEER: [
        {
            "key": "volunteer.next_steps",
            "label": {
                "en": "What should I do next?",
                "my": "ကျွန်ုပ် ဘာဆက်လုပ်ရမည်နည်း?",
            },
            "description": {
                "en": "Review your current applications and assignments.",
                "my": "သင့်လျှောက်လွှာများနှင့် တာဝန်ပေးအပ်မှုများကို စစ်ဆေးပါ။",
            },
        },
        {
            "key": "volunteer.my_applications",
            "label": {
                "en": "Show me my applications.",
                "my": "ကျွန်ုပ်၏ လျှောက်လွှာများကို ပြပါ။",
            },
            "description": {
                "en": "See your submitted applications and current statuses.",
                "my": "တင်သွင်းထားသော လျှောက်လွှာများနှင့် လက်ရှိအခြေအနေများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "volunteer.my_assignments",
            "label": {
                "en": "Explain my assignments.",
                "my": "ကျွန်ုပ်၏ တာဝန်များကို ရှင်းပြပါ။",
            },
            "description": {
                "en": "Review your shift assignments and attendance state.",
                "my": "သင့်တာဝန်ကျအချိန်ဇယားနှင့် တက်ရောက်မှုအခြေအနေကို ကြည့်ပါ။",
            },
        },
        {
            "key": "volunteer.recommendations",
            "label": {
                "en": "Find events that fit me.",
                "my": "ကျွန်ုပ်နှင့် ကိုက်ညီသော ပွဲများရှာပါ။",
            },
            "description": {
                "en": "View upcoming events matched to your skills and availability.",
                "my": "သင့်ကျွမ်းကျင်မှုနှင့် အားလပ်ချိန်အလိုက် ကိုက်ညီသော ပွဲများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "volunteer.prepare_for_event",
            "label": {
                "en": "Help me prepare for my upcoming event.",
                "my": "လာမည့်ပွဲအတွက် ပြင်ဆင်ရန် ကူညီပါ။",
            },
            "description": {
                "en": "Check timing, public venue label, role, and check-in setup.",
                "my": "အချိန်၊ နေရာ၊ တာဝန်နှင့် Check-in လိုအပ်ချက်များကို စစ်ဆေးပါ။",
            },
            "requires": "upcoming_assignment",
        },
        {
            "key": "volunteer.checkin_help",
            "label": {
                "en": "How do I check in?",
                "my": "Check-in ဘယ်လိုလုပ်ရမည်နည်း?",
            },
            "description": {
                "en": "Review QR and geolocation check-in rules and shift settings.",
                "my": "QR နှင့် တည်နေရာ Check-in စည်းမျဉ်းများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "volunteer.policy_help",
            "label": {
                "en": "Explain a VCS policy.",
                "my": "VCS မူဝါဒတစ်ခုကို ရှင်းပြပါ။",
            },
            "description": {
                "en": "Read current cancellation, application, and check-in rules.",
                "my": "ပယ်ဖျက်ခြင်း၊ လျှောက်ထားခြင်းနှင့် Check-in စည်းမျဉ်းများကို ဖတ်ရှုပါ။",
            },
        },
    ],
    ACTOR_SCOPE_COORDINATOR: [
        {
            "key": "coordinator.next_steps",
            "label": {
                "en": "What needs my attention?",
                "my": "ကျွန်ုပ် အာရုံစိုက်ရန် လိုအပ်သည်များကား အဘယ်နည်း?",
            },
            "description": {
                "en": "Summarise pending reviews, unassigned accepted volunteers, and staffing gaps.",
                "my": "စိစစ်ရန် လျှောက်လွှာများနှင့် လူအင်အားလိုအပ်ချက်များကို အကျဉ်းချုပ်ကြည့်ပါ။",
            },
        },
        {
            "key": "coordinator.my_events",
            "label": {
                "en": "Summarise my managed events.",
                "my": "ကျွန်ုပ် စီမံခန့်ခွဲသော ပွဲများကို အကျဉ်းချုပ်ပါ။",
            },
            "description": {
                "en": "Review events you own or currently coordinate.",
                "my": "သင်ပိုင်ဆိုင်သော သို့မဟုတ် တာဝန်ယူထားသော ပွဲများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "coordinator.staffing",
            "label": {
                "en": "Show staffing status for my event.",
                "my": "ကျွန်ုပ်ပွဲ၏ လူအင်အားအခြေအနေကို ပြပါ။",
            },
            "description": {
                "en": "Inspect headcount coverage, open slots, and readiness signals.",
                "my": "လိုအပ်သော လူဦးရေ၊ လစ်လပ်နေရာနှင့် အဆင်သင့်ဖြစ်မှုကို ကြည့်ပါ။",
            },
            "requires": "managed_events",
        },
        {
            "key": "coordinator.pending_applications",
            "label": {
                "en": "Which applications need review?",
                "my": "မည်သည့်လျှောက်လွှာများကို စိစစ်ရန် လိုအပ်သနည်း?",
            },
            "description": {
                "en": "List pending applications across your managed events.",
                "my": "သင့်ပွဲများအတွက် စိစစ်ရန် ကျန်ရှိသော လျှောက်လွှာများကို ကြည့်ပါ။",
            },
            "requires": "managed_events",
        },
        {
            "key": "coordinator.unassigned_accepted",
            "label": {
                "en": "Which accepted volunteers still need a post?",
                "my": "လက်ခံပြီးသား စေတနာ့ဝန်ထမ်းများထဲမှ မည်သူတို့ တာဝန်ချရန် လိုသေးသနည်း?",
            },
            "description": {
                "en": "Find accepted applications without an active post assignment.",
                "my": "လက်ခံထားသော်လည်း တာဝန်မချရသေးသူများကို ကြည့်ပါ။",
            },
            "requires": "managed_events",
        },
        {
            "key": "coordinator.event_readiness",
            "label": {
                "en": "Is my event ready?",
                "my": "ကျွန်ုပ်၏ ပွဲသည် အဆင်သင့်ဖြစ်ပြီလား?",
            },
            "description": {
                "en": "Check readiness status and operational staffing indicators.",
                "my": "ပွဲအဆင်သင့်ဖြစ်မှုနှင့် လူအင်အားသတိပေးချက်များကို စစ်ဆေးပါ။",
            },
            "requires": "managed_events",
        },
    ],
    ACTOR_SCOPE_ADMIN: [
        {
            "key": "admin.public_events",
            "label": {
                "en": "Browse public upcoming events.",
                "my": "အများပြည်သူဆိုင်ရာ လာမည့်ပွဲများကို ကြည့်ပါ။",
            },
            "description": {
                "en": "View published and active public events and remaining spots.",
                "my": "ထုတ်ပြန်ထားသော ပွဲများနှင့် ကျန်ရှိနေရာများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "admin.policy_help",
            "label": {
                "en": "Explain VCS public workflows.",
                "my": "VCS လုပ်ငန်းစဉ်များကို ရှင်းပြပါ။",
            },
            "description": {
                "en": "Review documented cancellation, check-in, and public rules.",
                "my": "ပယ်ဖျက်ခြင်းနှင့် Check-in စည်းမျဉ်းများကို ဖတ်ရှုပါ။",
            },
        },
    ],
    ACTOR_SCOPE_SUPER_ADMIN: [
        {
            "key": "super_admin.public_events",
            "label": {
                "en": "Browse public upcoming events.",
                "my": "အများပြည်သူဆိုင်ရာ လာမည့်ပွဲများကို ကြည့်ပါ။",
            },
            "description": {
                "en": "View published and active public events and remaining spots.",
                "my": "ထုတ်ပြန်ထားသော ပွဲများနှင့် ကျန်ရှိနေရာများကို ကြည့်ပါ။",
            },
        },
        {
            "key": "super_admin.event_staffing",
            "label": {
                "en": "Inspect event staffing status.",
                "my": "ပွဲတစ်ခု၏ လူအင်အားအခြေအနေကို စစ်ဆေးပါ။",
            },
            "description": {
                "en": "View event-scoped staffing coverage and readiness for a selected event.",
                "my": "ရွေးချယ်ထားသော ပွဲတစ်ခု၏ လူအင်အားအခြေအနေကို ကြည့်ပါ။",
            },
            "requires": "any_events",
        },
        {
            "key": "super_admin.policy_help",
            "label": {
                "en": "Explain VCS public workflows.",
                "my": "VCS လုပ်ငန်းစဉ်များကို ရှင်းပြပါ။",
            },
            "description": {
                "en": "Review documented cancellation, check-in, and public rules.",
                "my": "ပယ်ဖျက်ခြင်းနှင့် Check-in စည်းမျဉ်းများကို ဖတ်ရှုပါ။",
            },
        },
    ],
}


def _normalize_language(language: str) -> str:
    code = str(language or "en").strip().lower()
    if code.startswith("my"):
        return "my"
    return "en"


def _check_availability_flags(actor: Any, scope: str) -> Dict[str, bool]:
    """Run lightweight existence checks only to determine prompt availability."""
    now = timezone.now()
    flags: Dict[str, bool] = {
        "upcoming_assignment": False,
        "managed_events": False,
        "any_events": False,
    }
    if scope in (ACTOR_SCOPE_VOLUNTEER, ACTOR_SCOPE_COORDINATOR):
        flags["upcoming_assignment"] = Assignments.objects.filter(
            user_id=actor.id,
            status__in=["assigned", "confirmed"],
            schedule_end__gt=now,
            event__deleted_at__isnull=True,
        ).exists()
    if scope == ACTOR_SCOPE_COORDINATOR:
        flags["managed_events"] = Events.objects.filter(
            deleted_at__isnull=True,
        ).filter(
            Q(owner_id=actor.id) | Q(current_coordinator_id=actor.id)
        ).exists()
    if scope == ACTOR_SCOPE_SUPER_ADMIN:
        flags["any_events"] = Events.objects.filter(deleted_at__isnull=True).exists()
    return flags


def get_prompt_catalog_for_actor(actor: Any, language: str = "en") -> Dict[str, Any]:
    """Return the versioned, role-scoped prompt catalogue for the authenticated actor."""
    scope = determine_actor_scope(actor)
    lang = _normalize_language(language)
    flags = _check_availability_flags(actor, scope)

    definitions = PROMPT_DEFINITIONS_BY_SCOPE.get(
        scope, PROMPT_DEFINITIONS_BY_SCOPE[ACTOR_SCOPE_VOLUNTEER]
    )
    prompts: List[Dict[str, Any]] = []
    for item in definitions:
        req = item.get("requires")
        available = True if not req else bool(flags.get(req, False))
        prompts.append({
            "key": item["key"],
            "label": item["label"].get(lang, item["label"]["en"]),
            "description": item["description"].get(lang, item["description"]["en"]),
            "available": available,
        })

    return {
        "role": scope,
        "language": lang,
        "prompts": prompts,
        "catalog_version": CATALOG_VERSION,
    }


def get_prompt_label(prompt_key: str, language: str = "en") -> str:
    """Look up the backend-owned display label for a prompt key."""
    lang = _normalize_language(language)
    for items in PROMPT_DEFINITIONS_BY_SCOPE.values():
        for item in items:
            if item["key"] == prompt_key:
                return item["label"].get(lang, item["label"]["en"])
    return prompt_key
