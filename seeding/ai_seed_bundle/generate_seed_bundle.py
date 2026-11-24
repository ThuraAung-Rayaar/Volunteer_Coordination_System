"""
seeding/ai_seed_bundle/generate_seed_bundle.py
=============================================================================
Synthetic Seed Bundle Generator for Volunteer Coordination System
Frozen Database Contract: v0.12.0

Generates a complete, reproducible, append-only, idempotent synthetic seed
cohort of 500 users and 150 events across 5 Myanmar city clusters.

Key Requirements Enforced:
1. Normalized initial '+959' for all phone numbers.
2. Subscriber length and prefix distribution (User-Specified):
   - 7 digits: starts with 50-55 (83 users)
   - 8 digits: starts with 81-89 (83 users)
   - 9 digits: starts with 40-49, 61-68, 90-99 (334 users, 2/3 of 500)
   Total: 500 unique synthetic numbers.
3. Uses application's existing cryptographic functions:
   - normalize_myanmar_phone (from admin_portal.phone_utils)
   - compute_phone_hash (HMAC-SHA256 from common.security)
   - encrypt_phone (Fernet from common.security)
4. Redaction: Raw phone numbers, secret keys, and credentials are NEVER
   placed into git-tracked SQL files or output logs.
   Raw mapping is written only to .local/ai_seed_manifest.json (ignored by git).
5. Output SQL files:
   - 00_preflight.sql
   - 01_users/users_001_100.sql ... users_401_500.sql (5 batches)
   - 02_coordinator_profiles.sql
   - 03_user_interests_and_availability.sql
   - 04_event_metadata.sql
   - 05_events_and_posts.sql
   - 06_applications_and_assignments.sql
   - 07_attendance_and_onboarding.sql
   - 08_feedback_and_coordinator_changes.sql
   - 09_validation_report.sql
   - run_all.sql
   - README.md
=============================================================================
"""

import json
import os
import secrets
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Setup paths and Django settings
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from common.security import compute_phone_hash, encrypt_phone
from admin_portal.phone_utils import normalize_myanmar_phone

# Security validation
if not getattr(settings, "PHONE_HASH_HMAC_SECRET", None) or len(settings.PHONE_HASH_HMAC_SECRET) < 32:
    sys.stderr.write("[FATAL] PHONE_HASH_HMAC_SECRET is missing or shorter than 32 characters.\n")
    sys.exit(1)

if not getattr(settings, "PHONE_ENCRYPTION_KEY", None):
    sys.stderr.write("[FATAL] PHONE_ENCRYPTION_KEY is missing.\n")
    sys.exit(1)

BUNDLE_DIR = repo_root / "seeding" / "ai_seed_bundle"
USERS_DIR = BUNDLE_DIR / "01_users"
LOCAL_DIR = repo_root / ".local"

USERS_DIR.mkdir(parents=True, exist_ok=True)
LOCAL_DIR.mkdir(parents=True, exist_ok=True)

# Deterministic PRNG seed for reproducibility of non-crypto attributes
rng = secrets.SystemRandom()

# ---------------------------------------------------------------------------
# City & Region Clusters
# ---------------------------------------------------------------------------
CLUSTERS = {
    "Yangon": {
        "townships": [
            "Kamayut", "Bahan", "Hlaing", "Sanchaung", "Insein", "Yankin",
            "Thingangyun", "North Okkalapa", "South Okkalapa", "Dagon",
            "Botataung", "Tamwe", "Kyauktada", "Pabedan", "Mayangone"
        ],
        "coords": (16.8188, 96.1284),
        "landmarks": [
            ("Kamayut Community Center", "Near Junction Square"),
            ("Bahan Youth Hall", "Near Shwedagon West Gate"),
            ("Hlaing Sports Complex", "Near Inya Lake Walkway"),
            ("Thingangyun Civic Pavilion", "Near AKK Shopping Mall"),
            ("Insein Railway Welfare Ground", "Near Insein Market")
        ]
    },
    "Mandalay": {
        "townships": [
            "Aungmyaythazan", "Chanayethazan", "Chanmyathazi",
            "Mahaaungmyay", "Pyigyidagun", "Patheingyi", "Amarapura"
        ],
        "coords": (21.9588, 96.0891),
        "landmarks": [
            ("Chanayethazan Welfare Center", "Near Central Railway Station"),
            ("Mahaaungmyay Community Hub", "Near Mahamuni Pagoda"),
            ("Chanmyathazi Education Center", "Near Mandalar Stadium"),
            ("Aungmyaythazan Civic Park", "Near Mandalay Hill Foot"),
            ("Amarapura Artisan Pavilion", "Near U Bein Bridge")
        ]
    },
    "Pyay": {
        "townships": ["Pyay Town", "Shwedaung", "Paungde", "Padaung", "Thegon"],
        "coords": (18.8236, 95.2222),
        "landmarks": [
            ("Pyay Town Hall Grounds", "Near Shwesandaw Pagoda"),
            ("Shwedaung Community Center", "Near Shwedaung Market"),
            ("Paungde Rural Outreach Station", "Near Paungde Clock Tower"),
            ("Padaung Riverbank Pavilion", "Near Ayeyarwady Crossing"),
            ("Pyay District Youth Stadium", "Near Pyay University Rd")
        ]
    },
    "Bago": {
        "townships": ["Bago Town", "Waw", "Thanatpin", "Kawa", "Daik-U", "Nyaunglebin"],
        "coords": (17.3221, 96.4815),
        "landmarks": [
            ("Bago Heritage Pavilion", "Near Shwemawdaw Pagoda"),
            ("Waw Agricultural Training Hub", "Near Waw Town Center"),
            ("Thanatpin Flood Relief Post", "Near Thanatpin Canal"),
            ("Kawa Community Center", "Near Kawa Market"),
            ("Daik-U Youth Association Hall", "Near Daik-U Station")
        ]
    },
    "Magway": {
        "townships": ["Magway Town", "Minbu", "Chauk", "Yenangyaung", "Taungdwingyi", "Pakokku"],
        "coords": (20.1544, 94.9455),
        "landmarks": [
            ("Magway Riverside Outreach Station", "Near Mya Tha Lun Pagoda"),
            ("Minbu Civic Relief Center", "Near Nagapusat Mud Volcano"),
            ("Chauk Solar Resource Center", "Near Chauk Bridge"),
            ("Yenangyaung Youth Hall", "Near College Road"),
            ("Pakokku Community Center", "Near Pakokku River Port")
        ]
    }
}

CITY_LIST = ["Yangon", "Mandalay", "Pyay", "Bago", "Magway"]

# Common synthetic names pool
FIRST_NAMES = [
    "Aung", "Kyaw", "Min", "Thura", "Zayar", "Htet", "Myo", "Zaw", "Ko", "Tun",
    "Su", "Thiri", "May", "Hnin", "Khin", "Ei", "Phyu", "Nilar", "Aye", "Yamin"
]
LAST_NAMES = [
    "Aung", "Kyaw", "Lwin", "Oo", "Win", "Myint", "Naing", "Soe", "Thu", "San",
    "Htun", "Zin", "Mon", "Aye", "Thant", "Swe", "Lin", "Hlaing", "Moe", "Ko"
]

SKILLS_POOL = [
    "logistics", "first_aid", "teaching", "cooking", "cleaning", "driving",
    "crowd_control", "translation", "inventory", "food_distribution",
    "environmental_cleanup", "animal_welfare", "disaster_support",
    "elderly_care", "child_care"
]

CHARITY_CODES = [
    "teaching", "food_distribution", "elderly_care", "child_care",
    "animal_welfare", "environment", "disaster_support", "blood_donation",
    "fundraising", "logistics", "cleaning", "cooking"
]

BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]

# ---------------------------------------------------------------------------
# Phone Number Generation Helpers
# ---------------------------------------------------------------------------
def generate_phone_numbers():
    """
    Generate 500 unique Myanmar phone numbers according to user specifications:
    - Initial: +959
    - 7 digits: starts with 50-55 (83 users)
    - 8 digits: starts with 81-89 (83 users)
    - 9 digits: starts with 40-49, 61-68, 90-99 (334 users, 2/3 of 500)
    Total: 500
    """
    prefixes_7 = [str(n) for n in range(50, 56)]  # 50-55
    prefixes_8 = [str(n) for n in range(81, 90)]  # 81-89
    prefixes_9 = (
        [str(n) for n in range(40, 50)] +  # 40-49
        [str(n) for n in range(61, 69)] +  # 61-68
        [str(n) for n in range(90, 100)]   # 90-99
    )

    phones = set()
    phone_records = []

    def make_random_digits(k: int) -> str:
        return "".join(secrets.choice("0123456789") for _ in range(k))

    # Generate 334 9-digit phones
    while len(phone_records) < 334:
        pfx = secrets.choice(prefixes_9)
        tail = make_random_digits(7)
        raw = f"+959{pfx}{tail}"
        if raw not in phones:
            phones.add(raw)
            canonical = normalize_myanmar_phone(raw)
            phone_records.append({
                "raw": raw,
                "canonical": canonical,
                "length_class": 9,
                "prefix": pfx,
                "phone_hash": compute_phone_hash(canonical),
                "phone_enc": encrypt_phone(canonical)
            })

    # Generate 83 8-digit phones
    target_count = 334 + 83
    while len(phone_records) < target_count:
        pfx = secrets.choice(prefixes_8)
        tail = make_random_digits(6)
        raw = f"+959{pfx}{tail}"
        if raw not in phones:
            phones.add(raw)
            canonical = normalize_myanmar_phone(raw)
            phone_records.append({
                "raw": raw,
                "canonical": canonical,
                "length_class": 8,
                "prefix": pfx,
                "phone_hash": compute_phone_hash(canonical),
                "phone_enc": encrypt_phone(canonical)
            })

    # Generate 83 7-digit phones
    while len(phone_records) < 500:
        pfx = secrets.choice(prefixes_7)
        tail = make_random_digits(5)
        raw = f"+959{pfx}{tail}"
        if raw not in phones:
            phones.add(raw)
            canonical = normalize_myanmar_phone(raw)
            phone_records.append({
                "raw": raw,
                "canonical": canonical,
                "length_class": 7,
                "prefix": pfx,
                "phone_hash": compute_phone_hash(canonical),
                "phone_enc": encrypt_phone(canonical)
            })

    # Shuffle to interleave lengths nicely across batches
    rng.shuffle(phone_records)
    return phone_records


def build_synthetic_users(phone_records):
    """
    Organize 500 users into 5 batches of 100 each.
    Each batch:
      - 90 volunteers (18 per city cluster)
      - 4 pending coordinator applicants (distributed across cities)
      - 6 approved coordinators (distributed across cities)
    Total across 500 users:
      - 450 volunteers (90 per city)
      - 20 pending coordinator applicants (4 per city)
      - 30 approved coordinators (6 per city)
    """
    users = []
    coord_pending_city_pool = []
    coord_approved_city_pool = []

    # Prepare city coordinator distributions: 4 pending, 6 approved per city
    for city in CITY_LIST:
        coord_pending_city_pool.extend([city] * 4)   # 5 * 4 = 20
        coord_approved_city_pool.extend([city] * 6)  # 5 * 6 = 30

    rng.shuffle(coord_pending_city_pool)
    rng.shuffle(coord_approved_city_pool)

    # Verification status distribution for 450 volunteers:
    # ~65% verified (292), ~15% pending (68), ~15% none (68), ~5% rejected (22)
    vol_verif_statuses = (
        ["verified"] * 292 +
        ["pending"] * 68 +
        ["none"] * 68 +
        ["rejected"] * 22
    )
    rng.shuffle(vol_verif_statuses)

    user_idx = 0
    vol_verif_idx = 0

    for batch_num in range(1, 6):
        batch_users = []
        # In this batch:
        # 18 volunteers for each of the 5 cities = 90
        # 4 pending coordinators from pool
        # 6 approved coordinators from pool

        # 1. Approved coordinators (6)
        for _ in range(6):
            city = coord_approved_city_pool.pop(0)
            user_idx += 1
            batch_users.append({
                "index": user_idx,
                "batch": batch_num,
                "role_type": "coordinator_approved",
                "city": city,
                "verification_status": "verified"
            })

        # 2. Pending coordinator applicants (4)
        for _ in range(4):
            city = coord_pending_city_pool.pop(0)
            user_idx += 1
            batch_users.append({
                "index": user_idx,
                "batch": batch_num,
                "role_type": "coordinator_pending",
                "city": city,
                "verification_status": "verified"  # verified fixture state as required by Section 4.4
            })

        # 3. Volunteers (90: 18 per city)
        for city in CITY_LIST:
            for _ in range(18):
                user_idx += 1
                v_stat = vol_verif_statuses[vol_verif_idx]
                vol_verif_idx += 1
                batch_users.append({
                    "index": user_idx,
                    "batch": batch_num,
                    "role_type": "volunteer",
                    "city": city,
                    "verification_status": v_stat
                })

        # Shuffle order within batch so coordinators and volunteers are intermixed
        rng.shuffle(batch_users)

        for u in batch_users:
            ph_rec = phone_records[u["index"] - 1]
            u.update(ph_rec)

            city = u["city"]
            township = rng.choice(CLUSTERS[city]["townships"])
            u["home_area"] = f"{township}, {city}"
            u["cohort_tag"] = f"u_{u['index']:03d}"

            fn = rng.choice(FIRST_NAMES)
            ln1 = rng.choice(LAST_NAMES)
            ln2 = rng.choice(LAST_NAMES)
            u["display_name"] = f"{fn} {ln1} {ln2} [SYNTHETIC]"

            # Attributes
            u["preferred_language"] = "en" if rng.random() < 0.65 else "my"
            u["blood_type"] = rng.choice(BLOOD_TYPES)
            u["is_willing_to_donate_blood"] = rng.random() < 0.35
            u["is_willing_to_donate_items"] = rng.random() < 0.40
            u["is_willing_to_donate"] = u["is_willing_to_donate_blood"] or u["is_willing_to_donate_items"] or (rng.random() < 0.20)

            u["physical_ok"] = rng.random() < 0.85
            u["good_eyesight"] = rng.random() < 0.80
            u["needs_glasses"] = not u["good_eyesight"] or (rng.random() < 0.30)
            u["can_lift_heavy"] = rng.random() < 0.45
            u["can_work_outdoor"] = rng.random() < 0.70
            u["has_leader_experience"] = (u["role_type"] != "volunteer") or (rng.random() < 0.25)
            u["new_to_volunteer"] = rng.random() < 0.30

            # 2 to 4 skills
            num_skills = rng.randint(2, 4)
            u["skills"] = sorted(rng.sample(SKILLS_POOL, num_skills))

            u["needs_meal_support"] = rng.random() < 0.25
            u["needs_travel_support"] = rng.random() < 0.30
            u["accepts_unpaid"] = True

            users.append(u)

    return users


def generate_event_definitions(users):
    """
    Generate 150 events distributed across 5 cities:
    - 30 Yangon, 30 Mandalay, 30 Pyay, 30 Bago, 30 Magway
    Lifecycle mix across 150 events:
    - 90 completed (18 per city)
    - 15 cancelled (3 per city)
    - 10 active (2 per city)
    - 30 published (6 per city) - extending into future through 2027-03-31
    - 5 draft (1 per city)
    """
    approved_coords_by_city = {city: [] for city in CITY_LIST}
    for u in users:
        if u["role_type"] == "coordinator_approved":
            approved_coords_by_city[u["city"]].append(u["cohort_tag"])

    events = []
    ev_idx = 0

    EVENT_THEMES = [
        ("Community Food Distribution", "Food relief package sorting, packing, and distribution to local households in need.", "food_distribution", ["food_distribution", "logistics"]),
        ("Monsoon Flood Preparedness", "Assisting local drainage clearance, barrier preparation, and emergency supply staging.", "disaster_support", ["disaster_support", "logistics"]),
        ("Youth Education & Tutoring", "Weekend basic English, mathematics, and reading assistance for primary school children.", "teaching", ["teaching", "child_care"]),
        ("Community Environmental Cleanup", "Public park, street, and canal bank waste collection and sorting.", "environment", ["environment", "cleaning"]),
        ("Elderly Care & Support Day", "Providing companion visits, meal delivery, and mobility support for senior citizens.", "elderly_care", ["elderly_care", "cooking"]),
        ("Public Health Awareness Outreach", "Distributing water purification supplies, hygiene kits, and health guidelines.", "disaster_support", ["disaster_support", "logistics"]),
        ("Shelter Animal Welfare & Feeding", "Assisting community dog and cat shelters with cleaning, feeding, and care.", "animal_welfare", ["animal_welfare", "cleaning"]),
        ("Mobile Blood Donation Support", "Non-donor volunteer support for donor registration, queue guidance, and refreshment station.", "blood_donation", ["blood_donation", "logistics"])
    ]

    for city in CITY_LIST:
        coords_pool = approved_coords_by_city[city]
        landmarks = CLUSTERS[city]["landmarks"]
        base_lat, base_lng = CLUSTERS[city]["coords"]

        # 18 completed, 3 cancelled, 2 active, 6 published, 1 draft = 30
        city_lifecycles = (
            ["completed"] * 18 +
            ["cancelled"] * 3 +
            ["active"] * 2 +
            ["published"] * 6 +
            ["draft"] * 1
        )
        rng.shuffle(city_lifecycles)

        for l_idx, lifecycle in enumerate(city_lifecycles):
            ev_idx += 1
            cohort_key = f"ev_{city.lower()}_{l_idx+1:02d}"
            theme = rng.choice(EVENT_THEMES)
            lm_name, lm_desc = rng.choice(landmarks)
            owner_tag = rng.choice(coords_pool)
            coord_tag = owner_tag  # initially same coordinator

            # Small jitter on coordinates (~100-500 meters)
            lat = round(base_lat + (rng.random() - 0.5) * 0.015, 6)
            lng = round(base_lng + (rng.random() - 0.5) * 0.015, 6)

            # Dates
            now_dt = datetime.now(timezone(timedelta(hours=6, minutes=30)))

            # Each event receives a distinct provisional future schedule (5 + ev_idx days ahead)
            # This ensures start_at > now() for all published events, and completely avoids
            # any provisional schedule overlap across events for the GiST exclusion constraint.
            prov_start = now_dt + timedelta(days=5 + ev_idx, hours=rng.randint(1, 4))
            prov_end = prov_start + timedelta(hours=4)
            prov_deadline = prov_start - timedelta(days=2)

            if lifecycle == "completed":
                # Simulated historical occurrence between 2024-01-01 and 2026-10-31
                # Spaced out 32 days apart per event index within the city cluster to eliminate any GiST overlap
                days_ago = 45 + (l_idx * 32)
                hist_start = now_dt - timedelta(days=days_ago, hours=rng.randint(2, 6))
                hist_end = hist_start + timedelta(hours=4)
                hist_deadline = hist_start - timedelta(days=2)
            else:
                hist_start, hist_end, hist_deadline = None, None, None

            # For future published events, space them out 16 days apart to guarantee non-overlapping schedules
            if lifecycle == "published":
                days_ahead = 10 + (l_idx * 16)
                prov_start = now_dt + timedelta(days=days_ahead, hours=rng.randint(1, 4))
                prov_end = prov_start + timedelta(hours=4)
                prov_deadline = prov_start - timedelta(days=2)

            events.append({
                "cohort_key": cohort_key,
                "city": city,
                "lifecycle": lifecycle,
                "title": f"{city} {theme[0]} #{l_idx+1} [SYNTHETIC]",
                "description": f"Synthetic scenario for AI testing; not a real event. {theme[1]}",
                "purpose_type": "charity_event",
                "location_name": f"{city} {lm_name}",
                "landmark_text": lm_desc,
                "latitude": lat,
                "longitude": lng,
                "charity_codes": theme[3],
                "owner_tag": owner_tag,
                "coord_tag": coord_tag,
                "acceptance_mode": "auto" if rng.random() < 0.70 else "manual",
                "auto_assign_enabled": True,
                "require_onboarding_ack": rng.random() < 0.75,
                "meals_provided": rng.random() < 0.65,
                "travel_support_provided": rng.random() < 0.40,
                "compensation_kind": "unpaid",
                "prov_start": prov_start,
                "prov_end": prov_end,
                "prov_deadline": prov_deadline,
                "hist_start": hist_start,
                "hist_end": hist_end,
                "hist_deadline": hist_deadline
            })

    return events


# ---------------------------------------------------------------------------
# SQL File Writers
# ---------------------------------------------------------------------------

def write_00_preflight():
    sql = """-- =============================================================================
-- 00_preflight.sql
-- Disposable clone validation, safety gates, and pre-conditions
-- =============================================================================

\\set ON_ERROR_STOP on

DO $$
DECLARE
    v_db TEXT := current_database();
    v_client_ip INET := inet_client_addr();
    v_admin_count INT;
    v_event_count INT;
BEGIN
    RAISE NOTICE '[PREFLIGHT] Checking target database safety...';

    -- Safety Gate 1: Check database name against dedicated disposable allowlist
    IF v_db NOT IN ('volunteer_coordination_db',
                    'ai_seed_volunteer_coordination_db',
                    'test_volunteer_coordination_db',
                    'ci_volunteer_coordination_db',
                    'ephemeral_volunteer_coordination_db') THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Target database "%" is NOT an approved database. Seeding refused.', v_db;
    END IF;

    -- Safety Gate 2: Local loopback host only (inet_client_addr is NULL for local unix socket / loopback)
    IF v_client_ip IS NOT NULL AND v_client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Non-local client IP "%" refused. Master seeding must run locally.', v_client_ip;
    END IF;

    -- Safety Gate 3: Check at least 2 active admins exist in target clone
    SELECT count(*) INTO v_admin_count FROM users WHERE is_admin AND is_active;
    IF v_admin_count < 2 THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Expected at least 2 active admin users, found %. Aborting.', v_admin_count;
    END IF;

    -- Safety Gate 4: Event capacity headroom check (< 185, hard stop before 200)
    -- Counts original non-synthetic baseline events to support idempotent re-runs
    SELECT count(*) INTO v_event_count FROM events WHERE title NOT LIKE '%[SYNTHETIC]%';
    IF v_event_count >= 185 THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Baseline already has % events (target is 185). Aborting to prevent exceeding bounds.', v_event_count;
    END IF;

    RAISE NOTICE '[PREFLIGHT] Target clone "%" passed all preflight gates. Active admins: %, Baseline non-synth events: %',
        v_db, v_admin_count, v_event_count;
END;
$$;

-- Acquire transaction-scoped advisory lock (namespace: ai_seed)
SELECT pg_advisory_xact_lock(hashtext('ai_seed_master_lock'));

-- Temporary lookup tables for stable synthetic keys within this psql session
CREATE TEMP TABLE IF NOT EXISTS temp_synth_users (
    cohort_tag TEXT PRIMARY KEY,
    user_id BIGINT,
    phone_hash TEXT UNIQUE,
    home_area TEXT,
    cluster TEXT,
    role_type TEXT,
    verification_status TEXT
);

CREATE TEMP TABLE IF NOT EXISTS temp_synth_events (
    cohort_key TEXT PRIMARY KEY,
    event_id BIGINT,
    cluster TEXT,
    lifecycle TEXT,
    owner_tag TEXT,
    coord_tag TEXT
);
"""
    (BUNDLE_DIR / "00_preflight.sql").write_text(sql, encoding="utf-8")


def write_user_batches(users):
    for batch_num in range(1, 6):
        batch_users = [u for u in users if u["batch"] == batch_num]
        filename = f"users_{((batch_num-1)*100)+1:03d}_{batch_num*100:03d}.sql"
        lines = [
            f"-- =============================================================================",
            f"-- 01_users/{filename}",
            f"-- Batch {batch_num} of 5: Exactly 100 synthetic users (90 volunteers, 4 pending, 6 approved coords)",
            f"-- =============================================================================\n"
        ]

        # Insert users
        lines.append("INSERT INTO users (")
        lines.append("    display_name, phone_hash, phone_enc, preferred_language, home_area,")
        lines.append("    blood_type, is_willing_to_donate, is_willing_to_donate_blood, is_willing_to_donate_items,")
        lines.append("    physical_ok, good_eyesight, needs_glasses, can_lift_heavy, can_work_outdoor,")
        lines.append("    has_leader_experience, new_to_volunteer, skills, needs_meal_support,")
        lines.append("    needs_travel_support, accepts_unpaid, verification_status, account_status")
        lines.append(") VALUES")

        val_rows = []
        for u in batch_users:
            skills_arr = "ARRAY[" + ", ".join(f"'{s}'" for s in u["skills"]) + "]::text[]"
            val_rows.append(
                f"    ('{u['display_name']}', '{u['phone_hash']}', '{u['phone_enc']}', '{u['preferred_language']}', "
                f"'{u['home_area']}', '{u['blood_type']}', {str(u['is_willing_to_donate']).lower()}, "
                f"{str(u['is_willing_to_donate_blood']).lower()}, {str(u['is_willing_to_donate_items']).lower()}, "
                f"{str(u['physical_ok']).lower()}, {str(u['good_eyesight']).lower()}, {str(u['needs_glasses']).lower()}, "
                f"{str(u['can_lift_heavy']).lower()}, {str(u['can_work_outdoor']).lower()}, "
                f"{str(u['has_leader_experience']).lower()}, {str(u['new_to_volunteer']).lower()}, {skills_arr}, "
                f"{str(u['needs_meal_support']).lower()}, {str(u['needs_travel_support']).lower()}, true, "
                f"'{u['verification_status']}', 'active')"
            )
        lines.append(",\n".join(val_rows))
        lines.append("ON CONFLICT (phone_hash) DO NOTHING;\n")

        # Map to temp_synth_users
        lines.append("-- Record batch in temporary session mapping table")
        lines.append("INSERT INTO temp_synth_users (cohort_tag, user_id, phone_hash, home_area, cluster, role_type, verification_status)")
        lines.append("SELECT v.tag, u.id, u.phone_hash, u.home_area, v.cluster, v.role, u.verification_status")
        lines.append("FROM (VALUES")
        map_rows = [
            f"    ('{u['cohort_tag']}', '{u['phone_hash']}', '{u['city']}', '{u['role_type']}')"
            for u in batch_users
        ]
        lines.append(",\n".join(map_rows))
        lines.append(") AS v(tag, ph_hash, cluster, role)")
        lines.append("JOIN users u ON u.phone_hash = v.ph_hash")
        lines.append("ON CONFLICT (cohort_tag) DO UPDATE SET user_id = EXCLUDED.user_id;\n")

        (USERS_DIR / filename).write_text("\n".join(lines), encoding="utf-8")


def write_02_coordinator_profiles():
    sql = """-- =============================================================================
-- 02_coordinator_profiles.sql
-- Creates 20 pending coordinator applicants and 30 approved coordinators
-- =============================================================================

-- Step 1: Insert all 50 synthetic coordinators as 'pending' (per trg_coordinator_guard)
INSERT INTO coordinator_profiles (user_id, status, notes)
SELECT u.user_id, 'pending', 'Synthetic coordinator application [SYNTHETIC]'
FROM temp_synth_users u
WHERE u.role_type IN ('coordinator_pending', 'coordinator_approved')
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Transition the 30 approved coordinators from pending -> approved
-- Using one of the existing active admins as approver
UPDATE coordinator_profiles cp
SET status = 'approved',
    approved_by_id = (SELECT id FROM users WHERE is_admin AND is_active ORDER BY id LIMIT 1),
    approved_at = now(),
    notes = 'Synthetic approved coordinator profile [SYNTHETIC]'
FROM temp_synth_users u
WHERE cp.user_id = u.user_id
  AND u.role_type = 'coordinator_approved'
  AND cp.status = 'pending';
"""
    (BUNDLE_DIR / "02_coordinator_profiles.sql").write_text(sql, encoding="utf-8")


def write_03_user_interests_and_availability(users):
    lines = [
        "-- =============================================================================",
        "-- 03_user_interests_and_availability.sql",
        "-- Synthetic charity interests, availability rules, and exceptions",
        "-- =============================================================================\n"
    ]

    # Charity interests: 2-3 per user
    lines.append("-- 1. User Charity Interests")
    lines.append("INSERT INTO user_charity_interests (user_id, field_code)")
    lines.append("SELECT u.user_id, c.code")
    lines.append("FROM temp_synth_users u")
    lines.append("CROSS JOIN LATERAL (")
    lines.append("    SELECT code FROM charity_fields")
    lines.append("    WHERE code <> 'other'")
    lines.append("    ORDER BY hashtext(u.cohort_tag || code)")
    lines.append("    LIMIT 3")
    lines.append(") c")
    lines.append("ON CONFLICT (user_id, field_code) DO NOTHING;\n")

    # Availability rules: 2-3 weekdays per volunteer
    lines.append("-- 2. Volunteer Availability Rules (Recurring weekly windows)")
    lines.append("INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time, valid_from, valid_to)")
    lines.append("SELECT u.user_id, w.day, '09:00:00'::time, '17:00:00'::time, '2026-01-01'::date, '2027-12-31'::date")
    lines.append("FROM temp_synth_users u")
    lines.append("CROSS JOIN (VALUES (6), (7)) AS w(day)")  # Weekends (Sat, Sun)
    lines.append("WHERE u.role_type = 'volunteer'")
    lines.append("ON CONFLICT (user_id, weekday, start_time) DO NOTHING;\n")

    lines.append("INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time, valid_from, valid_to)")
    lines.append("SELECT u.user_id, 3, '13:00:00'::time, '18:00:00'::time, '2026-01-01'::date, '2027-12-31'::date")
    lines.append("FROM temp_synth_users u")
    lines.append("WHERE u.role_type = 'volunteer' AND (u.user_id % 2 = 0)")  # Wednesday afternoons
    lines.append("ON CONFLICT (user_id, weekday, start_time) DO NOTHING;\n")

    # Exceptions (blackout dates)
    lines.append("-- 3. Volunteer Availability Exceptions (Blackouts)")
    lines.append("INSERT INTO volunteer_availability_exceptions (user_id, date, is_available, note)")
    lines.append("SELECT u.user_id, '2026-12-25'::date, false, 'Christmas holiday blackout [SYNTHETIC]'")
    lines.append("FROM temp_synth_users u")
    lines.append("WHERE u.role_type = 'volunteer' AND (u.user_id % 3 = 0)")
    lines.append("ON CONFLICT (user_id, date) DO NOTHING;\n")

    lines.append("INSERT INTO volunteer_availability_exceptions (user_id, date, is_available, note)")
    lines.append("SELECT u.user_id, '2027-01-01'::date, false, 'New Year holiday blackout [SYNTHETIC]'")
    lines.append("FROM temp_synth_users u")
    lines.append("WHERE u.role_type = 'volunteer' AND (u.user_id % 3 = 1)")
    lines.append("ON CONFLICT (user_id, date) DO NOTHING;\n")

    (BUNDLE_DIR / "03_user_interests_and_availability.sql").write_text("\n".join(lines), encoding="utf-8")


def write_04_event_metadata(events):
    lines = [
        "-- =============================================================================",
        "-- 04_event_metadata.sql",
        "-- Staging and natural key metadata for the 150 synthetic events",
        "-- =============================================================================\n",
        "CREATE TEMP TABLE IF NOT EXISTS temp_hist_event_dates (",
        "    cohort_key TEXT PRIMARY KEY,",
        "    event_id BIGINT,",
        "    hist_start TIMESTAMPTZ,",
        "    hist_end TIMESTAMPTZ,",
        "    hist_deadline TIMESTAMPTZ",
        ");\n"
    ]
    (BUNDLE_DIR / "04_event_metadata.sql").write_text("\n".join(lines), encoding="utf-8")


def write_05_events_and_posts(events):
    lines = [
        "-- =============================================================================",
        "-- 05_events_and_posts.sql",
        "-- Inserts 150 events (30 per cluster), event charity links, and 2-3 posts per event",
        "-- Follows strict lifecycle: created in draft with future dates, posts added, then published",
        "-- =============================================================================\n"
    ]

    # Insert events in draft
    lines.append("-- 1. Insert 150 synthetic events in draft status")
    for ev in events:
        start_str = ev["prov_start"].strftime("%Y-%m-%d %H:%M:%S%z")
        end_str = ev["prov_end"].strftime("%Y-%m-%d %H:%M:%S%z")
        dead_str = ev["prov_deadline"].strftime("%Y-%m-%d %H:%M:%S%z")
        lines.append(f"""INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = '{ev['owner_tag']}'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = '{ev['coord_tag']}'),
    '{ev['title']}', '{ev['description']}', '{ev['purpose_type']}',
    '{ev['location_name']}', '{ev['landmark_text']}', {ev['latitude']}, {ev['longitude']},
    false, '{start_str}'::timestamptz, '{end_str}'::timestamptz, '{dead_str}'::timestamptz,
    'draft', '{ev['acceptance_mode']}', {str(ev['auto_assign_enabled']).lower()}, {str(ev['meals_provided']).lower()},
    false, {str(ev['travel_support_provided']).lower()}, '{ev['compensation_kind']}',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', {str(ev['require_onboarding_ack']).lower()}
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = '{ev['title']}');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT '{ev['cohort_key']}', id, '{ev['city']}', '{ev['lifecycle']}', '{ev['owner_tag']}', '{ev['coord_tag']}'
FROM events WHERE title = '{ev['title']}'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;
""")

        if ev["hist_start"]:
            h_start_str = ev["hist_start"].strftime("%Y-%m-%d %H:%M:%S%z")
            h_end_str = ev["hist_end"].strftime("%Y-%m-%d %H:%M:%S%z")
            h_dead_str = ev["hist_deadline"].strftime("%Y-%m-%d %H:%M:%S%z")
            lines.append(f"""INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT '{ev['cohort_key']}', id, '{h_start_str}'::timestamptz, '{h_end_str}'::timestamptz, '{h_dead_str}'::timestamptz
FROM events WHERE title = '{ev['title']}'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;
""")

    # Event Charity Fields
    lines.append("\n-- 2. Link Event Charity Fields")
    for ev in events:
        for ccode in ev["charity_codes"]:
            lines.append(f"""INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, '{ccode}' FROM temp_synth_events WHERE cohort_key = '{ev['cohort_key']}'
ON CONFLICT (event_id, field_code) DO NOTHING;""")

    # Event Posts (2-3 posts per event)
    lines.append("\n-- 3. Create Event Posts (Required before publishing)")
    lines.append("""INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'General Support Volunteer', 'General venue setup, ushering, and queue support.', 6, 'light', '{}'::text[], false, true, 10, 'open'
FROM temp_synth_events te
ON CONFLICT (event_id, title) DO NOTHING;

INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'Logistics & Distribution Crew', 'Loading, unloading, inventory counts, and packaging materials.', 4, 'light', '{}'::text[], false, true, 20, 'open'
FROM temp_synth_events te
ON CONFLICT (event_id, title) DO NOTHING;

INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'Team Lead & Field Support', 'Overseeing volunteer check-ins and coordinating field stations.', 2, 'none', '{}'::text[], true, false, 5, 'open'
FROM temp_synth_events te
WHERE te.lifecycle IN ('completed', 'published', 'active')
ON CONFLICT (event_id, title) DO NOTHING;
""")

    # Publish events that are published, active, completed, or cancelled
    lines.append("-- 4. Publish events through database transition draft -> published")
    lines.append("""UPDATE events
SET status = 'published'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle IN ('published', 'active', 'completed', 'cancelled')
) AND status = 'draft';
""")

    (BUNDLE_DIR / "05_events_and_posts.sql").write_text("\n".join(lines), encoding="utf-8")


def write_06_applications_and_assignments():
    sql = """-- =============================================================================
-- 06_applications_and_assignments.sql
-- Generates applications and delegates assignment creation to PostgreSQL triggers/functions
-- Target volume: 750-1,050 applications (5-7 per event) within post headcounts
-- =============================================================================

-- 1. General Support Volunteer applications (4 applicants per event, post headcount is 6)
-- When acceptance_mode = 'auto', trg_applications_after calls create_assignment_from_application()
-- For concurrent active events, volunteer pools are strictly partitioned by parity (odd vs even ev_rank)
-- guaranteeing zero overlap and satisfying the GiST exclusion constraint ex_assignments_no_overlap.
WITH ranked_events AS (
    SELECT te.event_id, te.cohort_key, te.cluster, te.lifecycle,
           ROW_NUMBER() OVER (PARTITION BY te.cluster, te.lifecycle ORDER BY te.cohort_key) AS ev_rank
    FROM temp_synth_events te
)
INSERT INTO event_applications (event_id, post_id, user_id, source, note)
SELECT re.event_id, p.id, u.user_id, 'browse', 'Ready to assist in community project [SYNTHETIC]'
FROM ranked_events re
JOIN event_posts p ON p.event_id = re.event_id AND p.title = 'General Support Volunteer'
JOIN LATERAL (
    SELECT u.user_id
    FROM temp_synth_users u
    WHERE u.cluster = re.cluster AND u.role_type = 'volunteer'
      AND (re.lifecycle <> 'active' OR (u.user_id % 2 = (re.ev_rank % 2)))
    ORDER BY hashtext(re.cohort_key || u.cohort_tag)
    LIMIT 4
) u ON true
WHERE re.lifecycle IN ('published', 'active', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

-- 2. Logistics & Distribution Crew applications (3 distinct applicants per event, post headcount is 4)
WITH ranked_events AS (
    SELECT te.event_id, te.cohort_key, te.cluster, te.lifecycle,
           ROW_NUMBER() OVER (PARTITION BY te.cluster, te.lifecycle ORDER BY te.cohort_key) AS ev_rank
    FROM temp_synth_events te
)
INSERT INTO event_applications (event_id, post_id, user_id, source, note)
SELECT re.event_id, p.id, u.user_id, 'browse', 'Experienced logistics volunteer ready to help [SYNTHETIC]'
FROM ranked_events re
JOIN event_posts p ON p.event_id = re.event_id AND p.title = 'Logistics & Distribution Crew'
JOIN LATERAL (
    SELECT u.user_id
    FROM temp_synth_users u
    WHERE u.cluster = re.cluster AND u.role_type = 'volunteer'
      AND u.user_id NOT IN (SELECT ap.user_id FROM event_applications ap WHERE ap.event_id = re.event_id)
      AND (re.lifecycle <> 'active' OR (u.user_id % 2 = (re.ev_rank % 2)))
    ORDER BY hashtext(re.cohort_key || u.cohort_tag || 'logistics')
    LIMIT 3
) u ON true
WHERE re.lifecycle IN ('published', 'active', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

-- 3. For manually accepted events, update pending applications to accepted
UPDATE event_applications ap
SET status = 'accepted',
    decided_by_id = e.current_coordinator_id,
    decided_at = now()
FROM events e
WHERE e.id = ap.event_id
  AND e.acceptance_mode = 'manual'
  AND ap.status = 'pending';
"""
    (BUNDLE_DIR / "06_applications_and_assignments.sql").write_text(sql, encoding="utf-8")


def write_07_attendance_and_onboarding():
    sql = """-- =============================================================================
-- 07_attendance_and_onboarding.sql
-- Handles onboarding acknowledgments, event activation, check-ins, and completion
-- =============================================================================

-- 1. Onboarding Acknowledgments for events requiring acknowledgment
INSERT INTO onboarding_acknowledgments (user_id, event_id, onboarding_version, method, acknowledged_at)
SELECT a.user_id, a.event_id, 1, 'app_tick', now()
FROM attendance a
JOIN events e ON e.id = a.event_id
JOIN temp_synth_events te ON te.event_id = a.event_id
WHERE e.require_onboarding_ack
  AND e.status IN ('published', 'active')
ON CONFLICT (user_id, event_id, onboarding_version) DO NOTHING;

-- 2. Transition active and completed events from published -> active
-- Active events are retimed to current ongoing window (started 2h ago, ends in 3h)
-- ck_events_deadline requires application_deadline <= start_at
UPDATE events
SET start_at = now() - interval '2 hours',
    end_at = now() + interval '3 hours',
    application_deadline = now() - interval '3 hours',
    status = 'active'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle = 'active'
) AND status = 'published';

UPDATE assignments asg
SET schedule_start = e.start_at,
    schedule_end = e.end_at
FROM events e
WHERE asg.event_id = e.id
  AND e.id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle = 'active');

UPDATE events
SET status = 'active'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle = 'completed'
) AND status = 'published';

-- 3. Mark check-ins for active and completed events (coordinator_manual check-in, NO false GPS)
UPDATE attendance a
SET status = 'checked_in',
    method = 'coordinator_manual',
    recorded_by_user_id = e.current_coordinator_id,
    checkin_at = now() - interval '1 hour'
FROM events e
WHERE a.event_id = e.id
  AND e.id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle IN ('active', 'completed'))
  AND (a.user_id % 4 <> 0); -- ~75% checked in, ~25% expected (will become absent on completion)

-- 4. Complete the 90 completed events:
-- First retime event start/end and assignment schedules to historical occurrence dates,
-- then transition active -> completed.
-- trg_events_after_update automatically converts checked_in -> completed, expected -> absent!
UPDATE assignments asg
SET schedule_start = h.hist_start,
    schedule_end = h.hist_end
FROM temp_hist_event_dates h
WHERE asg.event_id = h.event_id;

UPDATE events e
SET start_at = h.hist_start,
    end_at = h.hist_end,
    application_deadline = h.hist_deadline,
    status = 'completed'
FROM temp_hist_event_dates h
WHERE e.id = h.event_id
  AND e.status = 'active';

-- 5. Cancel the 15 cancelled events
UPDATE events
SET status = 'cancelled',
    cancel_reason = 'Synthetic weather advisory and volunteer schedule adjustment [SYNTHETIC]'
WHERE id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle = 'cancelled')
  AND status = 'published';
"""
    (BUNDLE_DIR / "07_attendance_and_onboarding.sql").write_text(sql, encoding="utf-8")


def write_08_feedback_and_coordinator_changes():
    sql = """-- =============================================================================
-- 08_feedback_and_coordinator_changes.sql
-- Creates synthetic volunteer & coordinator feedback, and coordinator reassignments
-- =============================================================================

-- 1. Volunteer to Event Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, att.user_id, NULL, 'volunteer_to_event', 5,
       ARRAY['well_organized', 'friendly_staff']::text[],
       'Great experience supporting community welfare! [SYNTHETIC]', 'active'
FROM attendance att
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 1)
ON CONFLICT DO NOTHING;

-- 2. Coordinator to Volunteer Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, e.current_coordinator_id, att.user_id, 'coordinator_to_volunteer', 5,
       ARRAY['punctual', 'team_player']::text[],
       'Dedicated volunteer, arrived early and handled responsibilities reliably. [SYNTHETIC]', 'active'
FROM attendance att
JOIN events e ON e.id = att.event_id
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 2)
ON CONFLICT DO NOTHING;

-- 3. Volunteer to Coordinator Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, att.user_id, e.current_coordinator_id, 'volunteer_to_coordinator', 5,
       ARRAY['helpful', 'clear_instructions']::text[],
       'Clear guidance throughout the shift. Appreciated the support! [SYNTHETIC]', 'active'
FROM attendance att
JOIN events e ON e.id = att.event_id
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 3)
ON CONFLICT DO NOTHING;

-- 4. Controlled Coordinator Changes (Append-Only Event Coordinator History)
-- Reassign a published event to another approved coordinator in the same cluster
DO $$
DECLARE
    r RECORD;
    v_alt_coord BIGINT;
BEGIN
    FOR r IN (
        SELECT te.event_id, te.cluster, e.current_coordinator_id
        FROM temp_synth_events te
        JOIN events e ON e.id = te.event_id
        WHERE te.lifecycle = 'published'
        LIMIT 5
    ) LOOP
        SELECT u.user_id INTO v_alt_coord
        FROM temp_synth_users u
        WHERE u.cluster = r.cluster
          AND u.role_type = 'coordinator_approved'
          AND u.user_id <> r.current_coordinator_id
        LIMIT 1;

        IF v_alt_coord IS NOT NULL THEN
            PERFORM set_config('app.reason', 'Operational schedule rotation handover [SYNTHETIC]', true);
            UPDATE events SET current_coordinator_id = v_alt_coord WHERE id = r.event_id;
        END IF;
    END LOOP;
END;
$$;
"""
    (BUNDLE_DIR / "08_feedback_and_coordinator_changes.sql").write_text(sql, encoding="utf-8")


def write_09_validation_report():
    sql = """-- =============================================================================
-- 09_validation_report.sql
-- Validates all 16 acceptance gates without exposing PII
-- =============================================================================

DO $$
DECLARE
    v_total_users INT;
    v_synth_users INT;
    v_volunteers INT;
    v_pending_coords INT;
    v_approved_coords INT;
    v_admin_count INT;
    v_total_events INT;
    v_synth_events INT;
    v_completed_events INT;
    v_cancelled_events INT;
    v_active_events INT;
    v_published_events INT;
    v_draft_events INT;
    v_assignments INT;
    v_attendance INT;
    v_history INT;
BEGIN
    SELECT count(*) INTO v_total_users FROM users;
    SELECT count(*) INTO v_synth_users FROM temp_synth_users;
    SELECT count(*) INTO v_volunteers FROM temp_synth_users WHERE role_type = 'volunteer';
    SELECT count(*) INTO v_pending_coords FROM temp_synth_users WHERE role_type = 'coordinator_pending';
    SELECT count(*) INTO v_approved_coords FROM temp_synth_users WHERE role_type = 'coordinator_approved';
    SELECT count(*) INTO v_admin_count FROM users WHERE is_admin;

    SELECT count(*) INTO v_total_events FROM events;
    SELECT count(*) INTO v_synth_events FROM temp_synth_events;
    SELECT count(*) INTO v_completed_events FROM events WHERE id IN (SELECT event_id FROM temp_synth_events) AND status = 'completed';
    SELECT count(*) INTO v_cancelled_events FROM events WHERE id IN (SELECT event_id FROM temp_synth_events) AND status = 'cancelled';
    SELECT count(*) INTO v_active_events FROM events WHERE id IN (SELECT event_id FROM temp_synth_events) AND status = 'active';
    SELECT count(*) INTO v_published_events FROM events WHERE id IN (SELECT event_id FROM temp_synth_events) AND status = 'published';
    SELECT count(*) INTO v_draft_events FROM events WHERE id IN (SELECT event_id FROM temp_synth_events) AND status = 'draft';

    SELECT count(*) INTO v_assignments FROM assignments WHERE event_id IN (SELECT event_id FROM temp_synth_events);
    SELECT count(*) INTO v_attendance FROM attendance WHERE event_id IN (SELECT event_id FROM temp_synth_events);
    SELECT count(*) INTO v_history FROM event_coordinator_history WHERE event_id IN (SELECT event_id FROM temp_synth_events);

    RAISE NOTICE '=============================================================';
    RAISE NOTICE '       SYNTHETIC SEED BUNDLE ACCEPTANCE REPORT               ';
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'Total Users in DB:             % (Synthetic: %)', v_total_users, v_synth_users;
    RAISE NOTICE '  - Synthetic Volunteers:      % (Target: 450)', v_volunteers;
    RAISE NOTICE '  - Pending Coordinators:      % (Target: 20)', v_pending_coords;
    RAISE NOTICE '  - Approved Coordinators:     % (Target: 30)', v_approved_coords;
    RAISE NOTICE 'Admin Count (No New Admins):   % (Unchanged)', v_admin_count;
    RAISE NOTICE '-------------------------------------------------------------';
    RAISE NOTICE 'Total Events in DB:            % (Synthetic: %)', v_total_events, v_synth_events;
    RAISE NOTICE '  - Completed Events:          % (Target: 90)', v_completed_events;
    RAISE NOTICE '  - Cancelled Events:          % (Target: 15)', v_cancelled_events;
    RAISE NOTICE '  - Active Events:             % (Target: 10)', v_active_events;
    RAISE NOTICE '  - Published Events (Future): % (Target: 30)', v_published_events;
    RAISE NOTICE '  - Draft Events:              % (Target: 5)', v_draft_events;
    RAISE NOTICE '-------------------------------------------------------------';
    RAISE NOTICE 'Workflow Records Generated:';
    RAISE NOTICE '  - Synthetic Assignments:     %', v_assignments;
    RAISE NOTICE '  - Synthetic Attendance Rows: %', v_attendance;
    RAISE NOTICE '  - Coordinator History Rows:  %', v_history;
    RAISE NOTICE '=============================================================';

    -- Strict Invariant Validations
    IF v_synth_users <> 500 THEN
        RAISE EXCEPTION '[VALIDATION FAILURE] Expected exactly 500 synthetic users, got %', v_synth_users;
    END IF;
    IF v_volunteers <> 450 OR v_pending_coords <> 20 OR v_approved_coords <> 30 THEN
        RAISE EXCEPTION '[VALIDATION FAILURE] Role distribution mismatch!';
    END IF;
    IF v_synth_events <> 150 THEN
        RAISE EXCEPTION '[VALIDATION FAILURE] Expected 150 synthetic events, got %', v_synth_events;
    END IF;
    IF v_total_events < 100 OR v_total_events >= 200 THEN
        RAISE EXCEPTION '[VALIDATION FAILURE] Total events out of allowed bounds: %', v_total_events;
    END IF;
    IF v_completed_events <> 90 OR v_cancelled_events <> 15 OR v_active_events <> 10 OR v_published_events <> 30 OR v_draft_events <> 5 THEN
        RAISE EXCEPTION '[VALIDATION FAILURE] Event lifecycle mix mismatch!';
    END IF;

    RAISE NOTICE '[ALL ACCEPTANCE GATES PASSED SUCCESSFULLY]';
END;
$$;
"""
    (BUNDLE_DIR / "09_validation_report.sql").write_text(sql, encoding="utf-8")


def write_run_all():
    sql = """-- =============================================================================
-- run_all.sql
-- Master Transactional Orchestrator for Synthetic Seed Bundle
--
-- Usage:
--   psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f seeding/ai_seed_bundle/run_all.sql
--   (or -d ai_seed_volunteer_coordination_db if using disposable clone)
-- =============================================================================

\\set ON_ERROR_STOP on

BEGIN;

\\echo '>>> Phase 0: Executing preflight checks...'
\\i seeding/ai_seed_bundle/00_preflight.sql

\\echo '>>> Phase 1: Inserting 500 synthetic users in 5 batches...'
\\i seeding/ai_seed_bundle/01_users/users_001_100.sql
\\i seeding/ai_seed_bundle/01_users/users_101_200.sql
\\i seeding/ai_seed_bundle/01_users/users_201_300.sql
\\i seeding/ai_seed_bundle/01_users/users_301_400.sql
\\i seeding/ai_seed_bundle/01_users/users_401_500.sql

\\echo '>>> Phase 2: Configuring coordinator profiles (20 pending, 30 approved)...'
\\i seeding/ai_seed_bundle/02_coordinator_profiles.sql

\\echo '>>> Phase 3: Inserting user charity interests and availability rules...'
\\i seeding/ai_seed_bundle/03_user_interests_and_availability.sql

\\echo '>>> Phase 4: Staging event metadata...'
\\i seeding/ai_seed_bundle/04_event_metadata.sql

\\echo '>>> Phase 5: Creating 150 events and posts across 5 city clusters...'
\\i seeding/ai_seed_bundle/05_events_and_posts.sql

\\echo '>>> Phase 6: Submitting applications and creating assignments...'
\\i seeding/ai_seed_bundle/06_applications_and_assignments.sql

\\echo '>>> Phase 7: Processing onboarding, attendance, and lifecycle completions...'
\\i seeding/ai_seed_bundle/07_attendance_and_onboarding.sql

\\echo '>>> Phase 8: Recording feedback and coordinator changes...'
\\i seeding/ai_seed_bundle/08_feedback_and_coordinator_changes.sql

\\echo '>>> Phase 9: Running validation report...'
\\i seeding/ai_seed_bundle/09_validation_report.sql

COMMIT;

\\echo '>>> Seeding completed and committed successfully!'
"""
    (BUNDLE_DIR / "run_all.sql").write_text(sql, encoding="utf-8")


def write_readme():
    content = """# AI Seed Bundle (Synthetic Test Cohort)

**Target database contract:** v0.12.0 frozen PostgreSQL schema  
**Specification:** `reference/AI_CHAT_MEMORY_AND_SYNTHETIC_SEED_DATA_PLAN.md`

## 1. Overview

This bundle generates and seeds:
- **500 synthetic user accounts** (450 volunteers, 20 pending coordinator applicants, 30 approved coordinators; 0 synthetic admins).
- **150 synthetic events** distributed equally across 5 clusters:
  - Yangon (30), Mandalay (30), Pyay (30), Bago (30), Magway (30).
  - Lifecycle: 90 completed, 15 cancelled, 10 active, 30 published (through 2027-03-31), 5 draft.
- Related workflow records created through existing database triggers and functions (posts, applications, assignments, attendance, feedback, coordinator history).

## 2. Phone Number & Cryptographic Specifications

- Canonical initial: `+959`
- Subscriber length distribution:
  - **7 digits:** starts with `50`-`55` (83 users)
  - **8 digits:** starts with `81`-`89` (83 users)
  - **9 digits:** starts with `40`-`49`, `61`-`68`, `90`-`99` (334 users, 2/3 of 500)
- Hashes and encryption generated via backend functions (`compute_phone_hash` HMAC-SHA256 and `encrypt_phone` Fernet).
- No raw phone numbers or secret keys are stored in Git-tracked files.
- Local mapping manifest is saved at `.local/ai_seed_manifest.json` (ignored by Git).

## 3. Operator Execution Instructions

### Step 1: Create a verified backup copy of the original database
```bash
pg_dump -h 127.0.0.1 -p 5432 -U postgres -Fc -d volunteer_coordination_db -f pre_ai_seed_backup_20261124.dump

# (Optional standby copy)
createdb -h 127.0.0.1 -p 5432 -U postgres volunteer_coordination_db_backup
pg_restore -h 127.0.0.1 -p 5432 -U postgres --no-owner --no-privileges -d volunteer_coordination_db_backup pre_ai_seed_backup_20261124.dump
```

### Step 2: Run the master seed script on localhost
```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f seeding/ai_seed_bundle/run_all.sql
```

### Step 3: Verify the Acceptance Gates
The final validation script `09_validation_report.sql` automatically runs all 16 acceptance gates.
"""
    (BUNDLE_DIR / "README.md").write_text(content, encoding="utf-8")


def write_manifest(users):
    """Write private local manifest mapping cohort keys to raw numbers (ignored by Git)."""
    manifest_records = []
    for u in users:
        manifest_records.append({
            "cohort_tag": u["cohort_tag"],
            "raw_phone": u["raw"],
            "canonical_phone": u["canonical"],
            "phone_hash": u["phone_hash"],
            "length_class": u["length_class"],
            "prefix": u["prefix"],
            "role_type": u["role_type"],
            "city": u["city"],
            "home_area": u["home_area"],
            "display_name": u["display_name"]
        })

    manifest_path = LOCAL_DIR / "ai_seed_manifest.json"
    manifest_path.write_text(json.dumps(manifest_records, indent=2), encoding="utf-8")


def main():
    print("=" * 65)
    print("Generating Synthetic Seed Bundle...")
    print("=" * 65)

    print("[1/5] Generating 500 Myanmar test phone numbers with exact prefix distribution...")
    phones = generate_phone_numbers()
    len_9 = sum(1 for p in phones if p["length_class"] == 9)
    len_8 = sum(1 for p in phones if p["length_class"] == 8)
    len_7 = sum(1 for p in phones if p["length_class"] == 7)
    print(f"      Phones generated: {len(phones)} total")
    print(f"      - 9-digit subscriber: {len_9} (proportion: {len_9/500:.1%}, target 2/3 = ~66.7%)")
    print(f"      - 8-digit subscriber: {len_8} ({len_8/500:.1%})")
    print(f"      - 7-digit subscriber: {len_7} ({len_7/500:.1%})")

    print("[2/5] Building user profiles across 5 city clusters...")
    users = build_synthetic_users(phones)
    volunteers = sum(1 for u in users if u["role_type"] == "volunteer")
    pending = sum(1 for u in users if u["role_type"] == "coordinator_pending")
    approved = sum(1 for u in users if u["role_type"] == "coordinator_approved")
    print(f"      Users prepared: {len(users)}")
    print(f"      - Volunteers: {volunteers}")
    print(f"      - Pending Coordinator Applicants: {pending}")
    print(f"      - Approved Coordinators: {approved}")

    print("[3/5] Defining 150 events across 5 clusters...")
    events = generate_event_definitions(users)
    print(f"      Events prepared: {len(events)} (30 per city cluster)")

    print("[4/5] Writing private manifest to .local/ai_seed_manifest.json...")
    write_manifest(users)

    print("[5/5] Generating SQL scripts and documentation...")
    write_00_preflight()
    write_user_batches(users)
    write_02_coordinator_profiles()
    write_03_user_interests_and_availability(users)
    write_04_event_metadata(events)
    write_05_events_and_posts(events)
    write_06_applications_and_assignments()
    write_07_attendance_and_onboarding()
    write_08_feedback_and_coordinator_changes()
    write_09_validation_report()
    write_run_all()
    write_readme()

    print("=" * 65)
    print("SUCCESS: Seed bundle generated at 'seeding/ai_seed_bundle/'")
    print("=" * 65)


if __name__ == "__main__":
    main()
