"""
backend/ai/tests/test_role_prompts.py

Unit and integration tests for role-specific prompt templates, version IDs,
scope determination, and privilege boundaries conforming to Section 10 of
docs/VCS_AI_UNIFIED_HANDOFF.md.
"""

from django.test import SimpleTestCase, TestCase
from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from common.security import compute_phone_hash, encrypt_phone
from ai.security.scope_policy import (
    determine_actor_scope,
    ALLOWED_TOOLS_BY_SCOPE,
    ACTOR_SCOPE_VOLUNTEER,
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_ADMIN,
    ACTOR_SCOPE_SUPER_ADMIN,
)
from ai.prompts.role_prompts import (
    SHARED_POLICY_VERSION,
    VOLUNTEER_PROMPT_VERSION,
    COORDINATOR_PROMPT_VERSION,
    ADMIN_PROMPT_VERSION,
    SUPER_ADMIN_PROMPT_VERSION,
    SHARED_SYSTEM_POLICY,
    VOLUNTEER_PROMPT_V1,
    COORDINATOR_PROMPT_V1,
    ADMIN_PROMPT_V1,
    SUPER_ADMIN_PROMPT_V1,
    get_role_prompt,
    build_role_system_instruction,
)


class RolePromptTemplateTests(SimpleTestCase):
    """Verify template contents, version strings, and assembly rules."""

    def test_version_constants(self):
        self.assertEqual(SHARED_POLICY_VERSION, "vcs.shared.v1")
        self.assertEqual(VOLUNTEER_PROMPT_VERSION, "vcs.volunteer.v1")
        self.assertEqual(COORDINATOR_PROMPT_VERSION, "vcs.coordinator.v1")
        self.assertEqual(ADMIN_PROMPT_VERSION, "vcs.admin.v1")
        self.assertEqual(SUPER_ADMIN_PROMPT_VERSION, "vcs.super_admin.v1")

    def test_shared_policy_contents(self):
        self.assertIn("You are the Volunteer Coordination System assistant", SHARED_SYSTEM_POLICY)
        self.assertIn("AUTHORIZED_DATA", SHARED_SYSTEM_POLICY)
        self.assertIn("The assistant is read-only", SHARED_SYSTEM_POLICY)
        self.assertIn("Never invent counts", SHARED_SYSTEM_POLICY)

    def test_volunteer_prompt_contents(self):
        prompt, version = get_role_prompt(ACTOR_SCOPE_VOLUNTEER)
        self.assertEqual(version, VOLUNTEER_PROMPT_VERSION)
        self.assertIn("ROLE: VOLUNTEER", prompt)
        self.assertIn("discover public opportunities", prompt)
        self.assertIn("Never reveal another volunteer's identity", prompt)

    def test_coordinator_prompt_contents(self):
        prompt, version = get_role_prompt(ACTOR_SCOPE_COORDINATOR)
        self.assertEqual(version, COORDINATOR_PROMPT_VERSION)
        self.assertIn("ROLE: APPROVED_COORDINATOR", prompt)
        self.assertIn("readiness signals", prompt)
        self.assertIn("Never reveal volunteer contact", prompt)

    def test_admin_prompt_contents(self):
        prompt, version = get_role_prompt(ACTOR_SCOPE_ADMIN)
        self.assertEqual(version, ADMIN_PROMPT_VERSION)
        self.assertIn("ROLE: ADMIN", prompt)
        self.assertIn("Do not assume access to private volunteer profiles", prompt)

    def test_super_admin_prompt_contents(self):
        prompt, version = get_role_prompt(ACTOR_SCOPE_SUPER_ADMIN)
        self.assertEqual(version, SUPER_ADMIN_PROMPT_VERSION)
        self.assertIn("ROLE: SUPER_ADMIN", prompt)
        self.assertIn("Do not claim a system-wide report exists", prompt)

    def test_build_system_instruction_includes_shared_and_role(self):
        for scope in [ACTOR_SCOPE_VOLUNTEER, ACTOR_SCOPE_COORDINATOR, ACTOR_SCOPE_ADMIN, ACTOR_SCOPE_SUPER_ADMIN]:
            instruction, version = build_role_system_instruction(scope, language="my")
            self.assertIn(SHARED_SYSTEM_POLICY, instruction)
            self.assertIn("Reply in language code 'my'", instruction)
            self.assertIn(version, [
                VOLUNTEER_PROMPT_VERSION, COORDINATOR_PROMPT_VERSION,
                ADMIN_PROMPT_VERSION, SUPER_ADMIN_PROMPT_VERSION
            ])

    def test_prompt_cannot_grant_tool_access(self):
        """Prompt text must not expand ALLOWED_TOOLS_BY_SCOPE."""
        self.assertNotIn("get_staffing_insight", ALLOWED_TOOLS_BY_SCOPE[ACTOR_SCOPE_VOLUNTEER])
        self.assertNotIn("get_staffing_insight", ALLOWED_TOOLS_BY_SCOPE[ACTOR_SCOPE_ADMIN])


class RoleScopeAuthorizationTests(TestCase):
    """Verify actor scope resolution and privilege boundaries against database state."""

    def setUp(self):
        phone = "+959777123456"
        self.user = Users.objects.create(
            phone_hash=compute_phone_hash(phone),
            phone_enc=encrypt_phone(phone),
            display_name="Standard User",
            is_active=True,
            is_admin=False,
            account_status="active",
        )
        admin_phone = "+959888123456"
        self.admin = Users.objects.create(
            phone_hash=compute_phone_hash(admin_phone),
            phone_enc=encrypt_phone(admin_phone),
            display_name="Approver Admin",
            is_active=True,
            is_admin=True,
            account_status="active",
        )

    def test_standard_user_resolves_to_volunteer_scope(self):
        scope = determine_actor_scope(self.user)
        self.assertEqual(scope, ACTOR_SCOPE_VOLUNTEER)

    def test_pending_coordinator_remains_volunteer_scope(self):
        CoordinatorProfiles.objects.create(user=self.user, status="pending")
        scope = determine_actor_scope(self.user)
        self.assertEqual(scope, ACTOR_SCOPE_VOLUNTEER)

    def test_approved_coordinator_resolves_to_coordinator_scope(self):
        self.user.verification_status = "verified"
        self.user.save()
        CoordinatorProfiles.objects.create(user=self.user, status="pending")
        CoordinatorProfiles.objects.filter(user=self.user).update(
            status="approved",
            approved_by=self.admin,
        )
        scope = determine_actor_scope(self.user)
        self.assertEqual(scope, ACTOR_SCOPE_COORDINATOR)

    def test_ordinary_admin_resolves_to_admin_scope(self):
        self.user.is_admin = True
        self.user.is_superuser = False
        self.user.save()
        scope = determine_actor_scope(self.user)
        self.assertEqual(scope, ACTOR_SCOPE_ADMIN)

    def test_super_admin_resolves_to_super_admin_scope(self):
        self.user.is_admin = True
        self.user.is_superuser = True
        self.user.save()
        scope = determine_actor_scope(self.user)
        self.assertEqual(scope, ACTOR_SCOPE_SUPER_ADMIN)
