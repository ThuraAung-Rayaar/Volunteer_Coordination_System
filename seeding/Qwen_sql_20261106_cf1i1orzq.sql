-- =============================================================================
-- seed_data.sql — Volunteer Coordination System Demo Seed
-- Target: PostgreSQL 16+ | Run AFTER the schema script
-- Usage:  psql -U postgres -d volunteer_coordination_db -f seed_data.sql
-- All geo-coordinates are in Yangon, Myanmar.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. SESSION CONTEXT
-- ---------------------------------------------------------------------------
SELECT set_config('app.user_id', '', true);
SELECT set_config('app.ip', '127.0.0.1', true);
SELECT set_config('app.privileged_write', 'on', true);

-- ---------------------------------------------------------------------------
-- 0.1 Ensure uuidv7() exists (fallback if not provided by extension)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION uuidv7() RETURNS UUID
LANGUAGE sql VOLATILE PARALLEL SAFE AS $$
  SELECT encode(
    set_byte(set_byte(
      overlay(gen_random_bytes(16) placing
        substring(int8send((extract(epoch from now()) * 1000)::bigint) from 3)
        from 1 for 6),
      6, (get_byte(gen_random_bytes(1), 0) & 7) | 112),
      8, (get_byte(gen_random_bytes(1), 0) & 63) | 128),
    'hex')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- 0.2 DRF authtoken table (created by Django; ensure existence for seeding)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authtoken_token (
    key     VARCHAR(40) PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1. IDEMPOTENT RESET
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
    moderation_actions,
    feedback,
    attendance_geo_attempts,
    attendance,
    assignments,
    event_applications,
    qr_tokens,
    event_posts,
    event_charity_fields,
    event_coordinator_history,
    events,
    user_verification_images,
    coordinator_profiles,
    volunteer_availability_exceptions,
    volunteer_availability_rules,
    user_charity_interests,
    authtoken_token,
    users
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 2. USERS (42 total: 2 Admins + 5 Coordinators + 35 Volunteers)
-- ---------------------------------------------------------------------------

-- 2.1 Admins
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, is_staff, is_superuser,
                   account_status, verification_status, preferred_language, home_area, blood_type)
VALUES
(1, 'c9e4cda2b1a976e3b714fb26055c158b27a83b67f161f625945b0bc6a417d537',
 'gAAAAABq7d-sqhthb4jye1FCoDZ0q4HVBEz9-lkrx4qCmjpB6NlXB4-SDfhOFJgPyKw49ygcl-SOiqiGu0MyRmQf_QOAXLyXYQ==',
 'System Super Admin', TRUE, TRUE, TRUE, 'active', 'verified', 'en', 'Yangon', 'O+'),
(2, 'd770aa2d2309c320c8e1ed236ccb8ace4c3ccbad359c7c197a0c25f4a246d356',
 'gAAAAABq7d-sfPzDRHiD67uEOd85IFv7OfzfLYDOcYVablFUMU93c3_S2j7uM6pEW6VjRccNzQZNjmiByO1LLwNZq0VyVEDGZg==',
 'Operations Admin', TRUE, TRUE, FALSE, 'active', 'verified', 'en', 'Yangon', 'A+');

-- 2.2 Coordinators (5)
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type,
                   skills, physical_ok, has_leader_experience, new_to_volunteer)
VALUES
(3, 'fece8db10a9459a641486aa42eb977aa6648c946560a68c02952be76e84f18c8',
 'gAAAAABq7d-sihVUM_cztvyluumRj0i5hcjNm37z5xmrB7dSnYXzYDoeBOOSLv3kWbHvYvZm0WWczMY3MLeHc4iyrzYnuZN9oA==',
 'Senior Coordinator One', FALSE, 'active', 'verified', 'en', 'Kamayut, Yangon', 'B+',
 ARRAY['teaching','logistics']::TEXT[], TRUE, TRUE, FALSE),
(4, 'd66da299dd8ffa7cfa041888442c2676dd2770accc24ea85e7e1d079bd9a7b5a',
 'gAAAAABq7d-s6MQoqBKD4m7I1QxoEJy9jh0mphCz1dsRcnevcglz4IV14iWQh2JDy5QnrHF-fHkZWA2_5xrtmC7a3f84a1yHbQ==',
 'Disaster Lead Two', FALSE, 'active', 'verified', 'en', 'Insein, Yangon', 'O-',
 ARRAY['first_aid','disaster_support','logistics']::TEXT[], TRUE, TRUE, FALSE),
(5, '19810eb9111feb8554d47ab5d9264ea2faf55cbd2d89c8f8800febf0e030c23e',
 'gAAAAABq7d-sDJxPW-Is9qGm5SdV_Kt4ovBest2zVZ49N-IYoGP9dDDnG2DUv38pxfyat0f294SSybOeNHY9vftO4jB15Jm3IQ==',
 'Youth Lead Three', FALSE, 'active', 'verified', 'en', 'Botahtaung, Yangon', 'AB+',
 ARRAY['teaching','child_care','cooking']::TEXT[], TRUE, TRUE, FALSE),
(6, '2f5609c11e734427c91157d2781c1b5fd75ddc68492e40cf01fa09cb35e79501',
 'gAAAAABq7d-skVxHoKqDvGDChm0ycqNrGKGh3L7TISbaQtmqp1BUoFQW-9CzxUCsBWICAymb48I97jU3qcIkTnGxGqZuGVTQRg==',
 'Eco Lead Four', FALSE, 'active', 'verified', 'en', 'Hlaing Tharyar, Yangon', 'A-',
 ARRAY['environment','cleaning','animal_welfare']::TEXT[], TRUE, TRUE, FALSE),
(7, '78ec9bffc61e3584666a6ceb967bb9583af087ca479c21955b552789a51e3e63',
 'gAAAAABq7d-s0ZBXEQCJMJ6sS3PlFNqbpo_q38svZfDjghDbOBU_i50hWoUDrU2oyUvy1oNJeShFNBP88nsMIRBU4G985ngxTQ==',
 'Community Lead Five', FALSE, 'active', 'verified', 'en', 'South Okkalapa, Yangon', 'O+',
 ARRAY['fundraising','logistics','elderly_care']::TEXT[], TRUE, TRUE, FALSE);

-- 2.3 Volunteers: Pending Coordinator Applicants (3) — IDs 8,9,10
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type,
                   skills, physical_ok, has_leader_experience, new_to_volunteer)
VALUES
(8,  'e4a10f205e2cf8d11a2e439290fff9b23f48f0c6e54063b994a2191f17262ae9',
 'gAAAAABq7d-stly9mEBAdU8miJqAYOpohrqNPKCODbjLCFq5XePvzP_UUwUf1uiDG6UY9O5Z75Ty0X0EXFyXKZ_dnKv49hLfew==',
 'Volunteer 01', FALSE, 'active', 'verified', 'en', 'Dagon, Yangon', 'B+',
 ARRAY['teaching','fundraising']::TEXT[], TRUE, TRUE, FALSE),
(9,  'b4dd79310575ea0f34457df203ce8e650c02e01d73ad7ba970862f9ba9046b1b',
 'gAAAAABq7d-sT5l2OjNG6-TksMLow0pwpc31Wj0oW1SqEzZfZSqQEFgq5fpLWrl0SBmY5Cuo53o-TggOvrE-haDPz_7ZYXK1OQ==',
 'Volunteer 02', FALSE, 'active', 'verified', 'en', 'Mayangone, Yangon', 'O+',
 ARRAY['logistics','driving']::TEXT[], TRUE, TRUE, FALSE),
(10, 'da0fd5f6a5ff7aecfbe2cc2bda2a0039e1d9053e4d06cd2d70fdfe4d91394fe9',
 'gAAAAABq7d-shmV2VXxB4R-qtz70cn-jgzx-XC3Jvx1BUCyq06gsTaeibQhz7HugzWNB6Va5Jxy9GOXh-Ysav9VJMivUof-n-g==',
 'Volunteer 03', FALSE, 'active', 'verified', 'en', 'Thingangyun, Yangon', 'A+',
 ARRAY['first_aid','elderly_care']::TEXT[], TRUE, TRUE, FALSE);

-- 2.4 Active Verified Regular Volunteers (20) — IDs 11..30
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type,
                   skills, physical_ok, can_lift_heavy, has_leader_experience,
                   new_to_volunteer, is_willing_to_donate, is_willing_to_donate_blood,
                   needs_meal_support, needs_travel_support)
VALUES
(11, '785b0e34745db38cd31147fe1d6ba221b46291658eec2d5c0d2b2ce4b0368a6a',
 'gAAAAABq7d-sOqQLkV8ElYJDfeHDljf63nnbuS9dlpjrungUgCk90WMK3LqCL5WUwRqrUoyN1it94Nh4tyosEedQp_a-C1eVRg==',
 'Volunteer 04', FALSE, 'active', 'verified', 'en', 'Kamayut, Yangon', 'O+',
 ARRAY['first_aid','teaching']::TEXT[], TRUE, FALSE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE),
(12, 'e3a1f9a993bfca9854fd7a576bf485bc61f19b494a095bbca4198c76eb734589',
 'gAAAAABq7d-sPKSiAVLqx_8g0Co33e7vJAS0x_XaJ_4VwQBKj99b2eyf5CZFRlGpUu1ZgVH4ooOYAqM0KybXS3i_PjVKbg9uTQ==',
 'Volunteer 05', FALSE, 'active', 'verified', 'en', 'Sanchaung, Yangon', 'A+',
 ARRAY['cooking','logistics']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE),
(13, '5465e150ab832da5e203c3947918cc4cfd37943a0c15fe07fca86ae0aa987218',
 'gAAAAABq7d-sUP7iosCx7x06jFj_cpCHTPscAskbdQ7yiu-jM4nHhvPPUU5r1wmsG-_SWEW4VxmvIU15Ru3UEUF8YYv3TCAaww==',
 'Volunteer 06', FALSE, 'active', 'verified', 'en', 'Hlaing, Yangon', 'B-',
 ARRAY['driving','logistics']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, TRUE),
(14, 'ec922ca32c502903b9a6c704535adbb26409f91a48339308d78c767a51ca9c91',
 'gAAAAABq7d-sBcXsMkydp2roDJ-DanH0zQGar6cazYhTDSYtu-kFA8ZiaXXEwWc_fHALxNqh8K42SOOU569YOnGXZ5SgMIOaiw==',
 'Volunteer 07', FALSE, 'active', 'verified', 'en', 'Bahan, Yangon', 'AB+',
 ARRAY['teaching','child_care']::TEXT[], FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
(15, 'e0bb04b0b3791eb528ea8663d57cb82f77aab24c6319a74011b2cda14c558a57',
 'gAAAAABq7d-sFLyQBPqGDwZgrGefW8T7KRsnMmq89qHwFiqgn8TAaDSIxjocaAlFVY0aMJV6OEJFCLy1rkg8UlLhQSYlXbaCwQ==',
 'Volunteer 08', FALSE, 'active', 'verified', 'en', 'Dagon, Yangon', 'O-',
 ARRAY['environment','cleaning']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(16, 'ef1bc2713db507f29ff31582e91992fb0ac917dd8c4491b903d22f799d6fe6cb',
 'gAAAAABq7d-sZ71_c--ocvztV0gQFu31ygW3fTuIBV-m7uxzWdCVRnwj0NzDvU-dgTmxMaiD5DZIe4DCbvqPxb1BISCq3XjAPw==',
 'Volunteer 09', FALSE, 'active', 'verified', 'en', 'Tamwe, Yangon', 'A-',
 ARRAY['first_aid','disaster_support']::TEXT[], TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE),
(17, 'fc0d5858b56d1fb01e3eb548ab03977aa783413a78523ef449c10d19c8bfd5b0',
 'gAAAAABq7d-sfxWVfgym176Zz8KqYtofrOe0d8zCpOsSilFyKPgVDakoFVFnMWOUNelE14ZfymK7dnFBEBl8JLALiCWQ_wcFVQ==',
 'Volunteer 10', FALSE, 'active', 'verified', 'en', 'Pazundaung, Yangon', 'B+',
 ARRAY['fundraising','logistics']::TEXT[], TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, TRUE),
(18, '1ac3a49da8c79d15ebd8fa62d4dfe9bde0de839e37c7cba2ec9d84586d8a4053',
 'gAAAAABq7d-syqIzrltiOtyiDAPbvy0QPj3heiqu_e9hGGR-8iYpkaNasPlqBF6RSLNsNhcdZhUDY7Y8jPPXU_LYr5DP6Iv5Ug==',
 'Volunteer 11', FALSE, 'active', 'verified', 'en', 'Insein, Yangon', 'O+',
 ARRAY['cooking','food_distribution']::TEXT[], TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(19, '4c24e29de878dd96284c4d193ff97bdcc0965875b3b7b4d4ed79689c38225b83',
 'gAAAAABq7d-sCtVmWyZNiasYq5SrAyxkBaeiIe7yFBE6XBJhwN3VS7GOKuewkil-sVmkurz1s4Dq-aI7wT2tBj8IeXLRRGvnGA==',
 'Volunteer 12', FALSE, 'active', 'verified', 'en', 'Mingaladon, Yangon', 'AB-',
 ARRAY['environment','animal_welfare']::TEXT[], TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE),
(20, '30d7656c52bbd91f67698014151cfc7abcd9858db5ce440fb33ae6b2fa163539',
 'gAAAAABq7d-sbiBUbKqmkfwMIbeGo5h9iKZZJ5Gbq9nL9dx55W8GLyqjA_I4M72osELk98vCUa7dAzFyEcMmYDXdLjPLNRO4eQ==',
 'Volunteer 13', FALSE, 'active', 'verified', 'en', 'North Okkalapa, Yangon', 'A+',
 ARRAY['teaching','child_care']::TEXT[], FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
(21, 'ba45cc5558d79ae0fc799df5d78c697b5f25f67ced49957c83730db6165506f9',
 'gAAAAABq7d-sJBXbZKFX3fxRz1OC9Awit3ZvPA3ktIZ9bGSSMkRNmpKNpsxXuYiZpd9QLng9Fg9bHJ3RXWjwz1Yk7q8dGAds0w==',
 'Volunteer 14', FALSE, 'active', 'verified', 'en', 'South Okkalapa, Yangon', 'B+',
 ARRAY['driving','logistics','first_aid']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(22, '3cc6507dce81d2d8045c07e5491c8b08219c57ce0b4a2a7dcc3f15d771e02402',
 'gAAAAABq7d-spNwZ4XOg6U1yEnE744Ph7rq_p8c8-V59qN3OfZrndN0nAvgo0Dmlvijo1M8vBdF9j1ViQ7d4sxMa6EPC1k0pWg==',
 'Volunteer 15', FALSE, 'active', 'verified', 'en', 'Thingangyun, Yangon', 'O+',
 ARRAY['cleaning','environment']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
(23, '327ebe08f81f4600e09e6ebd2e7254d5bc4d7a5a4afb8f86221f0a2682ac78ff',
 'gAAAAABq7d-sPQp87Z0m8_yNvZYcESprDqHMeNG3IFO66_EIxcOt1JzvVAHKHWrzJrcKBjVXDAmVNzcJLb7_A-ntoJPfuUqNjA==',
 'Volunteer 16', FALSE, 'active', 'verified', 'en', 'Yankin, Yangon', 'A-',
 ARRAY['elderly_care','cooking']::TEXT[], FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE),
(24, '2dbc3ebd21b7f17a1b050bd8d64df89d9211ce9e7e147fd5b34b62eb1dd0cf86',
 'gAAAAABq7d-sT0nNwnwpMSsaDx-7kc7kM4ktuMp-hF88F_CJDlY4v1KZ-4jveKQS-tt7ZdnfzVj-KFqqtjnKUei4rI3DQ62nuA==',
 'Volunteer 17', FALSE, 'active', 'verified', 'en', 'Mayangone, Yangon', 'B-',
 ARRAY['disaster_support','first_aid','logistics']::TEXT[], TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE),
(25, '53fb600334bb091b8d6442e0fc9507d87e7cd3f575baf8c4dbcbc175ce8b4181',
 'gAAAAABq7d-sh6xzdVoyKb1fnrXvEawS1B4zxezzO3w2dEe7GVa9BT_YAzc3baCJ2tp7u-GH8QcCrhI-NHJa9PrEUVft-xF1Zg==',
 'Volunteer 18', FALSE, 'active', 'verified', 'en', 'Dagon Seikkan, Yangon', 'O+',
 ARRAY['food_distribution','cooking']::TEXT[], TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE),
(26, '3ef855c0689cec687b7f65926d7fdb3136f8abd93ac51e7410993d1d892c8dc1',
 'gAAAAABq7d-siNj4THkjAxX4wqBuqvjKtNNJjViP4ZWHUwfqt-tZ3YaB34Mq8l3hRtdcea_PyXGzke71XIGz12LiQCJ0mHijOw==',
 'Volunteer 19', FALSE, 'active', 'verified', 'en', 'Thaketa, Yangon', 'AB+',
 ARRAY['teaching','fundraising']::TEXT[], FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
(27, '10f5e0b12c1217503c9540e0edc3e8fcc101c8c6053d8564b0f8620f66cff189',
 'gAAAAABq7d-sVIP_xtEiP_Wqpe_bFIwhA2wVZ3azLEuf09AGt0UbYKLeFBFKJfnw86bJFaonh0XyoxOuL_c4U3QjeG5JB5zOEQ==',
 'Volunteer 20', FALSE, 'active', 'verified', 'en', 'Dawbon, Yangon', 'A+',
 ARRAY['animal_welfare','environment']::TEXT[], TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(28, 'be32ecfcfb54061b0d736c2ccb0a6a5aa90fe30bde64525af4022481abaab600',
 'gAAAAABq7d-sT4IyYt6nNjHCcR_fPCiochO0IJjuwo_kU2DPk2XxT19Q6O4H44mgTAaRFA-vkNxBoWaB3ScGi7Ht4O1rgEdoYg==',
 'Volunteer 21', FALSE, 'active', 'verified', 'en', 'Seikkyi Kanaungto, Yangon', 'O-',
 ARRAY['logistics','driving']::TEXT[], TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(29, 'c33df089da4e0880a3d62ceae896af748b55d30c115dc9bcb21613306d0adcd4',
 'gAAAAABq7d-sGWoOtNC-DWF0aO4JMwS1m8XwD7W4Z_Zq1rKkqarGe6aT0L9GPf0qP7ntTvsLMlwO6VwVIlsCXPJ-q9nAzp5bvg==',
 'Volunteer 22', FALSE, 'active', 'verified', 'en', 'Kyimyindaing, Yangon', 'B+',
 ARRAY['first_aid','blood_donation']::TEXT[], TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE),
(30, '251aed756061a72da3cd7b998636ff42fdcfcd4903b080112812110a104e6cf5',
 'gAAAAABq7d-sveRmGYM9DZl9_ydQcY_qXFxys8e8oNJR8_4fCIy6KHsPIfLBCNABQVhxdHhcgNZSnFem-sSOhYPPt5HHNVudOQ==',
 'Volunteer 23', FALSE, 'active', 'verified', 'en', 'Lanmadaw, Yangon', 'A+',
 ARRAY['child_care','teaching']::TEXT[], FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE);

-- 2.5 Pending ID Verification Volunteers (5) — IDs 31..35
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type, skills)
VALUES
(31, '24f30aab6d0a37532ef755e688b7309c078c3bb16bf67602205c9215ca2ddfc6',
 'gAAAAABq7d-syAmUzXMDDU6tATMawv9ptMF-IziSN8ITmlLrNvR9OAULlcUAbLMzeauTx1ka4xktm5_RzxTTVwGRtFr3zjCTbw==',
 'Volunteer 24', FALSE, 'active', 'pending', 'en', 'Ahlon, Yangon', 'O+', ARRAY['cleaning']::TEXT[]),
(32, 'fc0ba28431f7e1450857f2b90228ed9238ac37b7cf1408e3f064336058f29091',
 'gAAAAABq7d-s_YLs5If2WfpoRVW-eola9SFihruSgeH1oruvl7Fujw0_oqWLkPCS8qBmjSQXiBCYySfmGp_G5w7BbM_OLHjokA==',
 'Volunteer 25', FALSE, 'active', 'pending', 'en', 'Kyeemyindaing, Yangon', 'A-', ARRAY['logistics']::TEXT[]),
(33, '7e9f4552ad37b2470d9f2612a1330d35c415bd0e8fd0cc99025f2e19ec1a05b3',
 'gAAAAABq7d-sLFzGpRvc2PMwBsUyCS9SFA9ZeD0IeEBl4POVayhfCKrWQiQQ2OAkmCWJJ7eGI1IZFGjm-65bxBIllGFpwS9jIA==',
 'Volunteer 26', FALSE, 'active', 'pending', 'en', 'Latha, Yangon', 'B+', ARRAY['cooking']::TEXT[]),
(34, 'dedb242ad1bc2adb0353b0909db4f956448abbbaea59d8956ba450ab29241357',
 'gAAAAABq7d-slFcGGfA7NMB31k8dkid-aYIRxV6D1LRrA_IGQErqMvjKp9FxeNwuDPK-Ugv_dowNsWgSSV8reF1lJIjEAuttFw==',
 'Volunteer 27', FALSE, 'active', 'pending', 'en', 'Pabedan, Yangon', 'AB+', ARRAY['teaching']::TEXT[]),
(35, 'f45f079e6f59830795f68b80cd80696a5c1574ac8a9c3608f40a08ffc3e39770',
 'gAAAAABq7d-soRcdkwesEuS8Gtj4LnKG1LAKFA6m94rovN8_5viDU5F_XPuv_zANMIYhjR4GA__Di2dKSSPgRHQUeDDB6gqrBg==',
 'Volunteer 28', FALSE, 'active', 'pending', 'en', 'Kyauktada, Yangon', 'O-', ARRAY['environment']::TEXT[]);

-- 2.6 Rejected / Unverified Volunteers (3) — IDs 36..38
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type, skills)
VALUES
(36, 'edb2cef4cb92a07564ae912dfcab8467e663e997312ee169bec4584f6b2e5ce2',
 'gAAAAABq7d-sH7rVpO_u1MJBL4TYfyJgRGlEa7OUWAr7GHH_9hu1d1E_r1j-yp2ifRvqiUZnJGCqG4j4pbxgn4mOo0sYkc-4sg==',
 'Volunteer 29', FALSE, 'active', 'rejected', 'en', 'Hlaing Tharyar, Yangon', 'A+', ARRAY['cleaning']::TEXT[]),
(37, 'f6605227dc71a2f1eecf740f0ac42fe2c1bf6c0038cb26db1e214b5972229324',
 'gAAAAABq7d-skvVeEzWeOUVR2vmy1XYf65cdIlGHR8nozsFO7N4vV0_0QE89qAze776buDUSjyHyaDO4lHmdEVMCiWDTkmRnPA==',
 'Volunteer 30', FALSE, 'active', 'none', 'en', 'Shwepyithar, Yangon', 'B-', ARRAY['logistics']::TEXT[]),
(38, '63986910d3a7a24c7722f0862308154a358982b00f523f27116bccba9c48cee5',
 'gAAAAABq7d-sZdB2IVWVQcLpEqUz9HzT6H_zhQ7ghoE977-MFO5RhTg-aQNu0JH2CEmpOCbE_eLcWp9OCJxAh5wxZRtoIZmNTQ==',
 'Volunteer 31', FALSE, 'active', 'rejected', 'en', 'Hlegu, Yangon', 'O+', ARRAY['fundraising']::TEXT[]);

-- 2.7 Warned Volunteers (2) — IDs 39, 40
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   verification_status, preferred_language, home_area, blood_type, skills)
VALUES
(39, '2f155273d85293493f66ff968c316fb77953f4a25c28123d8a040bd0745c62e1',
 'gAAAAABq7d-stnMKWoXb1kyfYNwjTd2cl2VR8DTAwGeLkDXvS3qvuKRkGQCBYKtgRi9VL6ENHIJXrGin2eZYSWeoIKP5p16tKQ==',
 'Volunteer 32', FALSE, 'active', 'verified', 'en', 'Taikkyi, Yangon', 'A+', ARRAY['driving']::TEXT[]),
(40, '343a2f91bdb6b69f9e62e639cbc8ff347ae057466008f6eb8123194cd66dca1a',
 'gAAAAABq7d-sueGIpGr5Lh7V7apoQwTDImi9ZuVANjxpR6nY-m6EkZm06ShzXFIodterNChEYiM58unOLu5EWGMLdRWua3N0SA==',
 'Volunteer 33', FALSE, 'active', 'verified', 'en', 'Hmawbi, Yangon', 'B+', ARRAY['logistics']::TEXT[]);

-- 2.8 Blocked Volunteers (2) — IDs 41, 42
INSERT INTO users (id, phone_hash, phone_enc, display_name, is_admin, account_status,
                   blocked_until, verification_status, preferred_language, home_area, blood_type, skills)
VALUES
(41, '2ac447025b82f2119039bb03cbc2f92f68db56e743e290c749ad4ad4543b6fa1',
 'gAAAAABq7d-sn5O3-ATc5gz1W-phYC_5FlUk9KTRM_gqg_Wy357QxgReC-l_7uar-RMrlgjv1769Oqwg8pX8dCiEXghVKpmuew==',
 'Volunteer 34', FALSE, 'blocked', now() + INTERVAL '30 days', 'verified', 'en', 'Twante, Yangon', 'O+', ARRAY['cleaning']::TEXT[]),
(42, '7edbc266e5faad9e6dca9d9235c4e002ff9c2318cc955df4e0bb2b03b5d1590a',
 'gAAAAABq7d-sbFFVjBEzEhuC-iwklaAkqh4L7XM4Q0erWJb7PrkDnuex2ukvcPxRPqL8vnjCH5sXj2xb0Qoy2sigRW7kRiZ00w==',
 'Volunteer 35', FALSE, 'blocked', now() + INTERVAL '30 days', 'verified', 'en', 'Kungyangon, Yangon', 'A-', ARRAY['cooking']::TEXT[]);

-- Reset sequence
SELECT setval(pg_get_serial_sequence('users','id'), 42);

-- ---------------------------------------------------------------------------
-- 3. COORDINATOR PROFILES
-- ---------------------------------------------------------------------------
-- 3.1 Approved coordinators (insert as pending, then approve)
INSERT INTO coordinator_profiles (user_id, status, notes) VALUES
(3, 'pending', 'Senior coordinator — initial registration'),
(4, 'pending', 'Disaster response lead — initial registration'),
(5, 'pending', 'Youth programmes lead — initial registration'),
(6, 'pending', 'Environmental projects lead — initial registration'),
(7, 'pending', 'Community outreach lead — initial registration');

-- Approve all 5 (admin actor)
SELECT set_config('app.user_id', '1', true);
UPDATE coordinator_profiles SET status='approved', approved_by_id=1, approved_at=now() WHERE user_id IN (3,5,7);
UPDATE coordinator_profiles SET status='approved', approved_by_id=2, approved_at=now() WHERE user_id IN (4,6);
SELECT set_config('app.user_id', '', true);

-- 3.2 Pending coordinator applicants (Volunteers 01-03)
INSERT INTO coordinator_profiles (user_id, status, notes) VALUES
(8,  'pending', 'Applicant applied via portal, awaiting admin interview'),
(9,  'pending', 'Applicant applied via portal, awaiting admin interview'),
(10, 'pending', 'Applicant applied via portal, awaiting admin interview');

-- ---------------------------------------------------------------------------
-- 4. EVENTS (10 total) — Insert as draft, add posts, then transition
-- ---------------------------------------------------------------------------
-- Yangon reference coordinates:
--   Inya Lake area:       16.8700, 96.1500
--   Downtown (City Hall): 16.7760, 96.1560
--   Shwedagon area:       16.7980, 96.1490
--   Hlawga Park:          17.0500, 96.2500
--   Botahtaung:           16.7600, 96.1700
--   Kamayut:              16.8100, 96.1400
--   Thingangyun:          16.8700, 96.2000
--   South Okkalapa:       16.8500, 96.1700
--   Dagon Seikkan:        16.9200, 96.2500
--   Kyauktan:             16.6200, 96.3300

-- Event 1: Yangon Tech Mentorship Camp (Future +3d, published, Coord 1)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, application_deadline, acceptance_mode,
    auto_assign_enabled, max_participants, meals_provided, travel_support_provided,
    compensation_kind, onboarding_text, require_onboarding_ack, qr_registration_enabled)
VALUES (3, 3, 'Yangon Tech Mentorship Camp',
    'A 2-day coding bootcamp for underprivileged youth in Kamayut township.',
    'charity_event', 'Kamayut Community Center', 'Near Kamayut Market, Yangon',
    16.810000, 96.140000, 150, TRUE, 'openstreetmap',
    now() + INTERVAL '3 days', now() + INTERVAL '3 days 8 hours',
    now() + INTERVAL '2 days', 'auto', TRUE, 20, TRUE, FALSE, 'unpaid',
    'Please read the volunteer handbook before attending.', TRUE, TRUE);

-- Event 2: Urban Flood Emergency Relief (Past -2d, completed, Coord 1)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (3, 3, 'Urban Flood Emergency Relief',
    'Emergency sandbagging and supply distribution in flood-affected areas.',
    'charity_event', 'Inya Lake Flood Zone', 'Inya Lake west bank, Yangon',
    16.870000, 96.150000, 200, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '9 hours',
    'auto', TRUE, 30, TRUE, 'unpaid', FALSE);

-- Event 3: Inya Lake Cleanup Drive (Past -7d, completed, Coord 1)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (3, 3, 'Inya Lake Cleanup Drive',
    'Community cleanup of Inya Lake shoreline and surrounding parks.',
    'charity_event', 'Inya Lake Park', 'Inya Lake east entrance, Yangon',
    16.872000, 96.152000, 250, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '7 hours',
    'auto', TRUE, 40, TRUE, 'unpaid', FALSE);

-- Event 4: First-Aid & Triage Workshop (Future +7d, published, Coord 2)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, application_deadline, acceptance_mode,
    auto_assign_enabled, max_participants, meals_provided, compensation_kind,
    onboarding_text, require_onboarding_ack, qr_registration_enabled)
VALUES (4, 4, 'First-Aid & Triage Workshop',
    'Training volunteers in basic first aid and emergency triage for disaster response.',
    'charity_event', 'Insein Township Hall', 'Insein General Hospital vicinity, Yangon',
    16.910000, 96.080000, 100, TRUE, 'openstreetmap',
    now() + INTERVAL '7 days', now() + INTERVAL '7 days 6 hours',
    now() + INTERVAL '6 days', 'manual', FALSE, 25, TRUE, 'unpaid',
    'Complete the online first-aid primer before the workshop.', TRUE, TRUE);

-- Event 5: Cyclone Response Packaging (Past -14d, completed, Coord 2)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (4, 4, 'Cyclone Response Packaging',
    'Packaging emergency supply kits for cyclone-affected communities in the delta.',
    'charity_event', 'Insein Warehouse', 'Near Insein Railway Station, Yangon',
    16.915000, 96.085000, 150, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '8 hours',
    'auto', TRUE, 50, TRUE, 'unpaid', FALSE);

-- Event 6: Downtown Community Food Station (Active: -1h to +3h, Coord 3)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack,
    geo_checkin_opens_before_min, require_checkin_confirmation)
VALUES (5, 5, 'Downtown Community Food Station',
    'Serving meals to homeless families near Maha Bandula Park.',
    'charity_event', 'Maha Bandula Park', 'Maha Bandula Park, downtown Yangon',
    16.776000, 96.156000, 200, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '5 hours',
    'auto', TRUE, 15, TRUE, 'unpaid', FALSE, 30, TRUE);

-- Event 7: School Supplies Sorting Drive (Past -21d, completed, Coord 3)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (5, 5, 'School Supplies Sorting Drive',
    'Sorting and packaging donated school supplies for rural schools.',
    'charity_event', 'Botahtaung Community Hall', 'Botahtaung Pagoda area, Yangon',
    16.760000, 96.170000, 150, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '6 hours',
    'manual', FALSE, 20, FALSE, 'unpaid', FALSE);

-- Event 8: Mangrove Reforestation Day (Future +14d, draft, Coord 4)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, travel_support_provided, compensation_kind,
    require_onboarding_ack)
VALUES (6, 6, 'Mangrove Reforestation Day',
    'Planting mangrove seedlings along the coastal belt south of Yangon.',
    'charity_event', 'Kyauktan Mangrove Site', 'Kyauktan township, south Yangon',
    16.620000, 96.330000, 300, TRUE, 'openstreetmap',
    now() + INTERVAL '14 days', now() + INTERVAL '14 days 10 hours',
    'manual', FALSE, 60, TRUE, TRUE, 'unpaid', TRUE);

-- Event 9: Wildlife Trail Maintenance (Past -30d, completed, Coord 4)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (6, 6, 'Wildlife Trail Maintenance',
    'Clearing and marking trails in Hlawga National Park for wildlife monitoring.',
    'charity_event', 'Hlawga National Park', 'Hlawga Park main gate, Mingaladon, Yangon',
    17.050000, 96.250000, 300, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '9 hours',
    'auto', TRUE, 35, TRUE, 'unpaid', FALSE);

-- Event 10: Monsoon Emergency Shelter Prep (Past -10d, cancelled, Coord 5)
INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled,
    map_provider, start_at, end_at, acceptance_mode, auto_assign_enabled,
    max_participants, meals_provided, compensation_kind, require_onboarding_ack)
VALUES (7, 7, 'Monsoon Emergency Shelter Prep',
    'Assembling emergency shelter kits ahead of monsoon season.',
    'charity_event', 'South Okkalapa Depot', 'South Okkalapa industrial zone, Yangon',
    16.850000, 96.170000, 200, TRUE, 'openstreetmap',
    now() + INTERVAL '1 hour', now() + INTERVAL '7 hours',
    'auto', TRUE, 40, TRUE, 'unpaid', FALSE);

-- Get event IDs by title for reference
DO $$
DECLARE
  v_e1 BIGINT; v_e2 BIGINT; v_e3 BIGINT; v_e4 BIGINT; v_e5 BIGINT;
  v_e6 BIGINT; v_e7 BIGINT; v_e8 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
BEGIN
  SELECT id INTO v_e1 FROM events WHERE title = 'Yangon Tech Mentorship Camp';
  SELECT id INTO v_e2 FROM events WHERE title = 'Urban Flood Emergency Relief';
  SELECT id INTO v_e3 FROM events WHERE title = 'Inya Lake Cleanup Drive';
  SELECT id INTO v_e4 FROM events WHERE title = 'First-Aid & Triage Workshop';
  SELECT id INTO v_e5 FROM events WHERE title = 'Cyclone Response Packaging';
  SELECT id INTO v_e6 FROM events WHERE title = 'Downtown Community Food Station';
  SELECT id INTO v_e7 FROM events WHERE title = 'School Supplies Sorting Drive';
  SELECT id INTO v_e8 FROM events WHERE title = 'Mangrove Reforestation Day';
  SELECT id INTO v_e9 FROM events WHERE title = 'Wildlife Trail Maintenance';
  SELECT id INTO v_e10 FROM events WHERE title = 'Monsoon Emergency Shelter Prep';

  -- Store in temp table for later use
  CREATE TEMP TABLE _seed_events (ref TEXT, eid BIGINT) ON COMMIT DROP;
  INSERT INTO _seed_events VALUES
    ('e1',v_e1),('e2',v_e2),('e3',v_e3),('e4',v_e4),('e5',v_e5),
    ('e6',v_e6),('e7',v_e7),('e8',v_e8),('e9',v_e9),('e10',v_e10);
END $$;

-- ---------------------------------------------------------------------------
-- 5. EVENT POSTS (before publishing)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e1 BIGINT; v_e2 BIGINT; v_e3 BIGINT; v_e4 BIGINT; v_e5 BIGINT;
        v_e6 BIGINT; v_e7 BIGINT; v_e8 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
BEGIN
  SELECT eid INTO v_e1 FROM _seed_events WHERE ref='e1';
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e4 FROM _seed_events WHERE ref='e4';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e8 FROM _seed_events WHERE ref='e8';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';
  SELECT eid INTO v_e10 FROM _seed_events WHERE ref='e10';

  -- Event 1: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, new_volunteers_allowed, priority) VALUES
  (v_e1, 'Mentors', 'Guide students through coding exercises', 8, 'none', ARRAY['teaching']::TEXT[], TRUE, 10),
  (v_e1, 'Lab Techs', 'Set up and maintain computer lab equipment', 4, 'light', ARRAY['logistics']::TEXT[], TRUE, 20);

  -- Event 2: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed) VALUES
  (v_e2, 'Sandbag Team', 'Fill and place sandbags', 15, 'heavy', ARRAY[]::TEXT[], TRUE, TRUE),
  (v_e2, 'Supply Distribution', 'Distribute relief supplies to residents', 10, 'medium', ARRAY['first_aid']::TEXT[], FALSE, TRUE);

  -- Event 3: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, new_volunteers_allowed) VALUES
  (v_e3, 'Shore Cleanup Crew', 'Collect litter along the lake shore', 25, 'medium', TRUE),
  (v_e3, 'Waste Sorting', 'Sort collected waste for recycling', 10, 'light', TRUE);

  -- Event 4: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, new_volunteers_allowed) VALUES
  (v_e4, 'Workshop Assistants', 'Help trainers during practical sessions', 12, 'none', ARRAY['first_aid']::TEXT[], TRUE),
  (v_e4, 'Logistics Support', 'Set up training rooms and materials', 5, 'light', ARRAY['logistics']::TEXT[], TRUE);

  -- Event 5: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, new_volunteers_allowed) VALUES
  (v_e5, 'Packaging Line', 'Assemble supply kits on the line', 30, 'medium', TRUE),
  (v_e5, 'Loading Crew', 'Load packed kits onto trucks', 10, 'heavy', TRUE);

  -- Event 6: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, new_volunteers_allowed) VALUES
  (v_e6, 'Food Servers', 'Serve meals to community members', 8, 'light', ARRAY['cooking']::TEXT[], TRUE),
  (v_e6, 'Setup & Cleanup', 'Set up tables and clean after service', 5, 'medium', ARRAY[]::TEXT[], TRUE);

  -- Event 7: 1 post
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, new_volunteers_allowed) VALUES
  (v_e7, 'Sorting Volunteers', 'Sort and box school supplies', 12, 'light', TRUE);

  -- Event 8: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, new_volunteers_allowed) VALUES
  (v_e8, 'Planting Crew', 'Plant mangrove seedlings', 35, 'heavy', ARRAY['environment']::TEXT[], TRUE),
  (v_e8, 'Nursery Support', 'Prepare seedlings at the nursery', 15, 'medium', ARRAY[]::TEXT[], TRUE);

  -- Event 9: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed) VALUES
  (v_e9, 'Trail Crew', 'Clear vegetation and mark trails', 20, 'heavy', ARRAY['environment']::TEXT[], TRUE, TRUE),
  (v_e9, 'Wildlife Survey', 'Record sightings along the trail', 8, 'medium', ARRAY['animal_welfare']::TEXT[], FALSE, TRUE);

  -- Event 10: 2 posts
  INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, new_volunteers_allowed) VALUES
  (v_e10, 'Shelter Kit Assembly', 'Assemble tarp and rope kits', 20, 'medium', TRUE),
  (v_e10, 'Inventory & Labeling', 'Label and inventory kits', 10, 'light', TRUE);
END $$;

-- ---------------------------------------------------------------------------
-- 5.1 EVENT CHARITY FIELDS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e1 BIGINT; v_e2 BIGINT; v_e3 BIGINT; v_e4 BIGINT; v_e5 BIGINT;
        v_e6 BIGINT; v_e7 BIGINT; v_e8 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
BEGIN
  SELECT eid INTO v_e1 FROM _seed_events WHERE ref='e1';
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e4 FROM _seed_events WHERE ref='e4';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e8 FROM _seed_events WHERE ref='e8';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';
  SELECT eid INTO v_e10 FROM _seed_events WHERE ref='e10';

  INSERT INTO event_charity_fields (event_id, field_code) VALUES
  (v_e1, 'teaching'), (v_e1, 'logistics'),
  (v_e2, 'disaster_support'), (v_e2, 'logistics'),
  (v_e3, 'environment'), (v_e3, 'cleaning'),
  (v_e4, 'disaster_support'), (v_e4, 'teaching'),
  (v_e5, 'disaster_support'), (v_e5, 'logistics'),
  (v_e6, 'food_distribution'), (v_e6, 'cooking'),
  (v_e7, 'child_care'), (v_e7, 'logistics'),
  (v_e8, 'environment'),
  (v_e9, 'environment'), (v_e9, 'animal_welfare'),
  (v_e10, 'disaster_support');
END $$;

-- ---------------------------------------------------------------------------
-- 6. EVENT LIFECYCLE TRANSITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e1 BIGINT; v_e2 BIGINT; v_e3 BIGINT; v_e4 BIGINT; v_e5 BIGINT;
        v_e6 BIGINT; v_e7 BIGINT; v_e8 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
BEGIN
  SELECT eid INTO v_e1 FROM _seed_events WHERE ref='e1';
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e4 FROM _seed_events WHERE ref='e4';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e8 FROM _seed_events WHERE ref='e8';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';
  SELECT eid INTO v_e10 FROM _seed_events WHERE ref='e10';

  -- Publish future events (start_at already in future)
  UPDATE events SET status = 'published' WHERE id = v_e1;  -- Event 1: published
  UPDATE events SET status = 'published' WHERE id = v_e4;  -- Event 4: published

  -- Publish + Activate Event 6 (live now)
  UPDATE events SET status = 'published' WHERE id = v_e6;
  UPDATE events SET status = 'active'    WHERE id = v_e6;
  -- Shift dates so it started 1h ago and ends in 3h
  UPDATE events SET start_at = now() - INTERVAL '1 hour', end_at = now() + INTERVAL '3 hours' WHERE id = v_e6;

  -- Event 8 stays as draft (no publish)

  -- Past events: publish → activate → shift dates back → operate → complete
  -- Event 2 (Past -2d)
  UPDATE events SET status = 'published' WHERE id = v_e2;
  UPDATE events SET status = 'active'    WHERE id = v_e2;
  UPDATE events SET start_at = now() - INTERVAL '2 days 4 hours', end_at = now() - INTERVAL '2 days' WHERE id = v_e2;

  -- Event 3 (Past -7d)
  UPDATE events SET status = 'published' WHERE id = v_e3;
  UPDATE events SET status = 'active'    WHERE id = v_e3;
  UPDATE events SET start_at = now() - INTERVAL '7 days 6 hours', end_at = now() - INTERVAL '7 days' WHERE id = v_e3;

  -- Event 5 (Past -14d)
  UPDATE events SET status = 'published' WHERE id = v_e5;
  UPDATE events SET status = 'active'    WHERE id = v_e5;
  UPDATE events SET start_at = now() - INTERVAL '14 days 8 hours', end_at = now() - INTERVAL '14 days' WHERE id = v_e5;

  -- Event 7 (Past -21d)
  UPDATE events SET status = 'published' WHERE id = v_e7;
  UPDATE events SET status = 'active'    WHERE id = v_e7;
  UPDATE events SET start_at = now() - INTERVAL '21 days 5 hours', end_at = now() - INTERVAL '21 days' WHERE id = v_e7;

  -- Event 9 (Past -30d)
  UPDATE events SET status = 'published' WHERE id = v_e9;
  UPDATE events SET status = 'active'    WHERE id = v_e9;
  UPDATE events SET start_at = now() - INTERVAL '30 days 9 hours', end_at = now() - INTERVAL '30 days' WHERE id = v_e9;

  -- Event 10 (Past -10d, will be cancelled)
  UPDATE events SET status = 'published' WHERE id = v_e10;
  UPDATE events SET status = 'active'    WHERE id = v_e10;
  UPDATE events SET start_at = now() - INTERVAL '10 days 7 hours', end_at = now() - INTERVAL '10 days' WHERE id = v_e10;
END $$;

-- ---------------------------------------------------------------------------
-- 7. APPLICATIONS & ASSIGNMENTS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_e1 BIGINT; v_e2 BIGINT; v_e3 BIGINT; v_e5 BIGINT; v_e6 BIGINT;
  v_e7 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
  v_p1 BIGINT; v_p2 BIGINT; v_p3 BIGINT; v_p5 BIGINT; v_p6 BIGINT;
  v_p7 BIGINT; v_p8 BIGINT; v_p9 BIGINT; v_p10 BIGINT; v_p11 BIGINT;
  v_p12 BIGINT; v_p13 BIGINT; v_p14 BIGINT; v_p15 BIGINT; v_p16 BIGINT; v_p17 BIGINT;
  v_app BIGINT;
BEGIN
  SELECT eid INTO v_e1 FROM _seed_events WHERE ref='e1';
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';
  SELECT eid INTO v_e10 FROM _seed_events WHERE ref='e10';

  -- Get post IDs
  SELECT id INTO v_p1 FROM event_posts WHERE event_id=v_e1 ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM event_posts WHERE event_id=v_e1 ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_p3 FROM event_posts WHERE event_id=v_e2 ORDER BY id LIMIT 1;
  SELECT id INTO v_p5 FROM event_posts WHERE event_id=v_e3 ORDER BY id LIMIT 1;
  SELECT id INTO v_p6 FROM event_posts WHERE event_id=v_e5 ORDER BY id LIMIT 1;
  SELECT id INTO v_p7 FROM event_posts WHERE event_id=v_e6 ORDER BY id LIMIT 1;
  SELECT id INTO v_p8 FROM event_posts WHERE event_id=v_e7 ORDER BY id LIMIT 1;
  SELECT id INTO v_p9 FROM event_posts WHERE event_id=v_e9 ORDER BY id LIMIT 1;
  SELECT id INTO v_p10 FROM event_posts WHERE event_id=v_e10 ORDER BY id LIMIT 1;

  -- Event 1 applications (future, auto-accept)
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e1, v_p1, 11, 'browse'),
  (v_e1, v_p1, 12, 'browse'),
  (v_e1, v_p1, 13, 'browse'),
  (v_e1, v_p2, 14, 'browse'),
  (v_e1, v_p2, 15, 'browse');

  -- Event 6 applications (active, auto-accept)
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e6, v_p7, 16, 'browse'),
  (v_e6, v_p7, 17, 'browse'),
  (v_e6, v_p7, 18, 'browse'),
  (v_e6, v_p7, 19, 'browse');

  -- Event 2 applications (past, was auto-accept when active)
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e2, v_p3, 11, 'browse'),
  (v_e2, v_p3, 12, 'browse'),
  (v_e2, v_p3, 16, 'browse'),
  (v_e2, v_p3, 20, 'browse');

  -- Event 3 applications
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e3, v_p5, 13, 'browse'),
  (v_e3, v_p5, 14, 'browse'),
  (v_e3, v_p5, 15, 'browse'),
  (v_e3, v_p5, 21, 'browse'),
  (v_e3, v_p5, 22, 'browse');

  -- Event 5 applications
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e5, v_p6, 17, 'browse'),
  (v_e5, v_p6, 18, 'browse'),
  (v_e5, v_p6, 23, 'browse'),
  (v_e5, v_p6, 24, 'browse'),
  (v_e5, v_p6, 25, 'browse');

  -- Event 7 applications (manual mode — accept them explicitly)
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e7, v_p8, 26, 'browse'),
  (v_e7, v_p8, 27, 'browse'),
  (v_e7, v_p8, 28, 'browse');
  -- Manually accept
  SELECT set_config('app.user_id', '5', true);
  UPDATE event_applications SET status='accepted', decided_by_id=5, decided_at=now()
   WHERE event_id=v_e7 AND status='pending';
  SELECT set_config('app.user_id', '', true);

  -- Event 9 applications
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e9, v_p9, 15, 'browse'),
  (v_e9, v_p9, 21, 'browse'),
  (v_e9, v_p9, 22, 'browse'),
  (v_e9, v_p9, 27, 'browse');

  -- Event 10 applications (will be cancelled)
  INSERT INTO event_applications (event_id, post_id, user_id, source) VALUES
  (v_e10, v_p10, 23, 'browse'),
  (v_e10, v_p10, 24, 'browse'),
  (v_e10, v_p10, 25, 'browse');

  -- Create assignments for past events (auto_assign was enabled)
  -- Event 2 assignments
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e2 AND status = 'accepted';
  -- Event 3 assignments
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e3 AND status = 'accepted';
  -- Event 5 assignments
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e5 AND status = 'accepted';
  -- Event 7 assignments
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e7 AND status = 'accepted';
  -- Event 9 assignments
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e9 AND status = 'accepted';
  -- Event 10 assignments (before cancellation)
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e10 AND status = 'accepted';
  -- Event 6 assignments (active event)
  PERFORM create_assignment_from_application(id, NULL) FROM event_applications
   WHERE event_id = v_e6 AND status = 'accepted';
END $$;

-- ---------------------------------------------------------------------------
-- 8. CHECK-INS FOR PAST EVENTS (update attendance directly)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e2 BIGINT; v_e3 BIGINT; v_e5 BIGINT; v_e7 BIGINT; v_e9 BIGINT;
BEGIN
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';

  -- Event 2: 4 volunteers checked in via geo
  UPDATE attendance SET status='checked_in', method='geo',
    checkin_at = (SELECT start_at FROM events WHERE id=v_e2) + INTERVAL '5 minutes',
    checkin_latitude=16.870100, checkin_longitude=96.150100,
    checkin_accuracy_m=12.0, checkin_distance_m=15.3, geo_verified=TRUE,
    confirmation_status='not_required'
  WHERE event_id=v_e2;

  -- Event 3: 5 checked in via coordinator_manual
  UPDATE attendance SET status='checked_in', method='coordinator_manual',
    checkin_at = (SELECT start_at FROM events WHERE id=v_e3) + INTERVAL '10 minutes',
    recorded_by_user_id=3, confirmation_status='not_required'
  WHERE event_id=v_e3;

  -- Event 5: 5 checked in via geo
  UPDATE attendance SET status='checked_in', method='geo',
    checkin_at = (SELECT start_at FROM events WHERE id=v_e5) + INTERVAL '3 minutes',
    checkin_latitude=16.915050, checkin_longitude=96.085050,
    checkin_accuracy_m=8.0, checkin_distance_m=7.1, geo_verified=TRUE,
    confirmation_status='not_required'
  WHERE event_id=v_e5;

  -- Event 7: 3 checked in via coordinator_manual
  UPDATE attendance SET status='checked_in', method='coordinator_manual',
    checkin_at = (SELECT start_at FROM events WHERE id=v_e7) + INTERVAL '8 minutes',
    recorded_by_user_id=5, confirmation_status='not_required'
  WHERE event_id=v_e7;

  -- Event 9: 4 checked in via geo
  UPDATE attendance SET status='checked_in', method='geo',
    checkin_at = (SELECT start_at FROM events WHERE id=v_e9) + INTERVAL '4 minutes',
    checkin_latitude=17.050100, checkin_longitude=96.250100,
    checkin_accuracy_m=15.0, checkin_distance_m=22.5, geo_verified=TRUE,
    confirmation_status='not_required'
  WHERE event_id=v_e9;
END $$;

-- ---------------------------------------------------------------------------
-- 8.1 GEO CHECK-IN FOR ACTIVE EVENT 6
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e6 BIGINT;
BEGIN
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';

  -- Volunteer 16 (user 16) checks in successfully inside geofence
  UPDATE attendance SET status='checked_in', method='geo',
    checkin_at = now() - INTERVAL '30 minutes',
    checkin_latitude=16.776020, checkin_longitude=96.156020,
    checkin_accuracy_m=10.0, checkin_distance_m=25.0, geo_verified=TRUE,
    confirmation_status='not_required'
  WHERE event_id=v_e6 AND user_id=16;

  -- Volunteer 17 (user 17) checks in successfully
  UPDATE attendance SET status='checked_in', method='geo',
    checkin_at = now() - INTERVAL '25 minutes',
    checkin_latitude=16.776050, checkin_longitude=96.156050,
    checkin_accuracy_m=8.0, checkin_distance_m=18.0, geo_verified=TRUE,
    confirmation_status='not_required'
  WHERE event_id=v_e6 AND user_id=17;
END $$;

-- ---------------------------------------------------------------------------
-- 8.2 GEO ATTEMPTS LOG FOR EVENT 6
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e6 BIGINT; v_att BIGINT;
BEGIN
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';
  SELECT id INTO v_att FROM attendance WHERE event_id=v_e6 AND user_id=16;

  -- Accepted attempt for volunteer 16
  INSERT INTO attendance_geo_attempts
    (event_id, user_id, attendance_id, latitude, longitude, accuracy_m,
     captured_at, device_mocked, distance_m, radius_m, result, review_status)
  VALUES
    (v_e6, 16, v_att, 16.776020, 96.156020, 10.0, now() - INTERVAL '31 minutes',
     FALSE, 25.0, 200, 'accepted', 'none');

  -- Outside geofence attempt for volunteer 18 (user 18)
  INSERT INTO attendance_geo_attempts
    (event_id, user_id, latitude, longitude, accuracy_m,
     captured_at, device_mocked, distance_m, radius_m, result, review_status)
  VALUES
    (v_e6, 18, 16.780000, 96.160000, 12.0, now() - INTERVAL '20 minutes',
     FALSE, 450.0, 200, 'outside_geofence', 'pending');
END $$;

-- ---------------------------------------------------------------------------
-- 9. COMPLETE PAST EVENTS & CANCEL EVENT 10
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e2 BIGINT; v_e3 BIGINT; v_e5 BIGINT; v_e7 BIGINT; v_e9 BIGINT; v_e10 BIGINT;
BEGIN
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';
  SELECT eid INTO v_e10 FROM _seed_events WHERE ref='e10';

  UPDATE events SET status = 'completed' WHERE id = v_e2;
  UPDATE events SET status = 'completed' WHERE id = v_e3;
  UPDATE events SET status = 'completed' WHERE id = v_e5;
  UPDATE events SET status = 'completed' WHERE id = v_e7;
  UPDATE events SET status = 'completed' WHERE id = v_e9;

  -- Cancel Event 10
  UPDATE events SET status = 'cancelled', cancel_reason = 'Extreme monsoon flood warning' WHERE id = v_e10;
END $$;

-- ---------------------------------------------------------------------------
-- 10. QR TOKENS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e1 BIGINT; v_e4 BIGINT; v_e6 BIGINT;
BEGIN
  SELECT eid INTO v_e1 FROM _seed_events WHERE ref='e1';
  SELECT eid INTO v_e4 FROM _seed_events WHERE ref='e4';
  SELECT eid INTO v_e6 FROM _seed_events WHERE ref='e6';

  INSERT INTO qr_tokens (event_id, created_by_id, purpose, token_hash, max_uses, expires_at) VALUES
  (v_e1, 3, 'checkin', encode(sha256('evt1_checkin_token_seed'::bytea), 'hex'), NULL, now() + INTERVAL '4 days'),
  (v_e1, 3, 'walkin_registration', encode(sha256('evt1_walkin_token_seed'::bytea), 'hex'), 5, now() + INTERVAL '4 days'),
  (v_e4, 4, 'checkin', encode(sha256('evt4_checkin_token_seed'::bytea), 'hex'), NULL, now() + INTERVAL '8 days'),
  (v_e6, 5, 'checkin', encode(sha256('evt6_checkin_token_seed'::bytea), 'hex'), NULL, now() + INTERVAL '4 hours'),
  (v_e6, 5, 'walkin_registration', encode(sha256('evt6_walkin_token_seed'::bytea), 'hex'), 10, now() + INTERVAL '4 hours');
END $$;

-- ---------------------------------------------------------------------------
-- 11. FEEDBACK (only for completed events)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_e2 BIGINT; v_e3 BIGINT; v_e5 BIGINT; v_e7 BIGINT; v_e9 BIGINT;
BEGIN
  SELECT eid INTO v_e2 FROM _seed_events WHERE ref='e2';
  SELECT eid INTO v_e3 FROM _seed_events WHERE ref='e3';
  SELECT eid INTO v_e5 FROM _seed_events WHERE ref='e5';
  SELECT eid INTO v_e7 FROM _seed_events WHERE ref='e7';
  SELECT eid INTO v_e9 FROM _seed_events WHERE ref='e9';

  -- Event 2: volunteer_to_event + coordinator_to_volunteer
  SELECT set_config('app.user_id', '11', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e2, 11, NULL, 'volunteer_to_event', 5, ARRAY['organized','impactful']::TEXT[], 'Well coordinated relief effort.');
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e2, 11, 3, 'volunteer_to_coordinator', 5, ARRAY['supportive','organized']::TEXT[], 'Great leadership during the flood response.');
  SELECT set_config('app.user_id', '', true);

  SELECT set_config('app.user_id', '3', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e2, 3, 11, 'coordinator_to_volunteer', 5, ARRAY['punctual','hardworking']::TEXT[], 'Excellent effort under pressure.');
  SELECT set_config('app.user_id', '', true);

  -- Event 3: volunteer_to_event + one flagged feedback
  SELECT set_config('app.user_id', '13', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e3, 13, NULL, 'volunteer_to_event', 4, ARRAY['well_organized']::TEXT[], 'Good cleanup event, supplies were adequate.');
  SELECT set_config('app.user_id', '', true);

  SELECT set_config('app.user_id', '14', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e3, 14, NULL, 'volunteer_to_event', 2, ARRAY['disorganized']::TEXT[], 'Disputed remarks about coordination quality.');
  SELECT set_config('app.user_id', '', true);

  -- Event 5: volunteer_to_event
  SELECT set_config('app.user_id', '17', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e5, 17, NULL, 'volunteer_to_event', 5, ARRAY['communication','punctual']::TEXT[], 'Smooth packaging operation.');
  SELECT set_config('app.user_id', '', true);

  -- Event 9: volunteer_to_event + volunteer_to_coordinator
  SELECT set_config('app.user_id', '15', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e9, 15, NULL, 'volunteer_to_event', 4, ARRAY['outdoor','rewarding']::TEXT[], 'Hard work but very fulfilling.');
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e9, 15, 6, 'volunteer_to_coordinator', 4, ARRAY['knowledgeable','supportive']::TEXT[], 'Knew the park trails well.');
  SELECT set_config('app.user_id', '', true);

  SELECT set_config('app.user_id', '6', true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
  VALUES (v_e9, 6, 22, 'coordinator_to_volunteer', 5, ARRAY['hardworking','team_player']::TEXT[], 'Outstanding trail work.');
  SELECT set_config('app.user_id', '', true);
END $$;

-- ---------------------------------------------------------------------------
-- 12. MODERATION ACTIONS
-- ---------------------------------------------------------------------------
-- 12.1 Hide the flagged feedback on Event 3
DO $$
DECLARE v_fb BIGINT;
BEGIN
  SELECT id INTO v_fb FROM feedback WHERE comment = 'Disputed remarks about coordination quality.' LIMIT 1;
  SELECT set_config('app.user_id', '1', true);
  INSERT INTO moderation_actions (admin_user_id, action_type, feedback_id, reason)
  VALUES (1, 'feedback_hide', v_fb, 'Flagged for review due to disputed remarks');
  SELECT set_config('app.user_id', '', true);
END $$;

-- 12.2 Warned volunteers
SELECT set_config('app.user_id', '1', true);
INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason) VALUES
(1, 39, 'user_warning', 'Repeated unexcused absence on registered shifts'),
(1, 40, 'user_warning', 'Repeated unexcused absence on registered shifts');

-- 12.3 Blocked volunteers
INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason, expires_at) VALUES
(2, 41, 'user_block', 'Aggressive behaviour towards event staff', now() + INTERVAL '30 days'),
(2, 42, 'user_block', 'Repeated policy violations', now() + INTERVAL '30 days');
SELECT set_config('app.user_id', '', true);

-- ---------------------------------------------------------------------------
-- 13. VERIFICATION IMAGES (pending ID for volunteers 24-28)
-- ---------------------------------------------------------------------------
INSERT INTO user_verification_images (user_id, image_type, image_path, file_format, status, is_current) VALUES
(31, 'id_license', '/uploads/verification/vol24_id_license.jpg', 'jpeg', 'pending', TRUE),
(32, 'id_license', '/uploads/verification/vol25_id_license.jpg', 'jpeg', 'pending', TRUE),
(33, 'id_license', '/uploads/verification/vol26_id_license.jpg', 'jpeg', 'pending', TRUE),
(34, 'id_license', '/uploads/verification/vol27_id_license.jpg', 'jpeg', 'pending', TRUE),
(35, 'id_license', '/uploads/verification/vol28_id_license.jpg', 'jpeg', 'pending', TRUE);

-- Rejected image for volunteer 29
SELECT set_config('app.user_id', '1', true);
INSERT INTO user_verification_images (user_id, image_type, image_path, file_format, status, is_current, reviewed_by_id, reviewed_at, note) VALUES
(36, 'id_license', '/uploads/verification/vol29_id_license.jpg', 'jpeg', 'rejected', TRUE, 1, now(), 'Image unreadable, please re-upload');
SELECT set_config('app.user_id', '', true);

-- ---------------------------------------------------------------------------
-- 14. VOLUNTEER AVAILABILITY RULES (sample)
-- ---------------------------------------------------------------------------
INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time) VALUES
(11, 6, '08:00', '17:00'),  -- Volunteer 04: Saturday
(11, 7, '08:00', '12:00'),  -- Volunteer 04: Sunday morning
(12, 1, '09:00', '17:00'),  -- Volunteer 05: Monday
(13, 3, '10:00', '16:00'),  -- Volunteer 06: Wednesday
(16, 5, '07:00', '15:00'),  -- Volunteer 09: Friday
(17, 2, '08:00', '18:00'),  -- Volunteer 10: Tuesday
(21, 6, '06:00', '14:00'),  -- Volunteer 14: Saturday
(24, 7, '09:00', '17:00');  -- Volunteer 17: Sunday

-- ---------------------------------------------------------------------------
-- 15. CHARITY INTERESTS
-- ---------------------------------------------------------------------------
INSERT INTO user_charity_interests (user_id, field_code) VALUES
(11, 'teaching'), (11, 'food_distribution'),
(12, 'cooking'), (12, 'logistics'),
(13, 'environment'), (13, 'cleaning'),
(14, 'teaching'), (14, 'child_care'),
(15, 'environment'),
(16, 'disaster_support'), (16, 'first_aid' ),
(17, 'fundraising'), (17, 'logistics'),
(18, 'cooking'), (18, 'food_distribution'),
(21, 'logistics'), (21, 'disaster_support'),
(22, 'blood_donation'),
(24, 'disaster_support'), (24, 'first_aid'),
(25, 'food_distribution'),
(27, 'animal_welfare'), (27, 'environment');

-- ---------------------------------------------------------------------------
-- 16. DRF AUTH TOKENS
-- ---------------------------------------------------------------------------
INSERT INTO authtoken_token (key, user_id, created) VALUES
('a000000000000000000000000000000000000001', 1, now()),
('a000000000000000000000000000000000000002', 2, now()),
('c000000000000000000000000000000000000011', 3, now()),
('c000000000000000000000000000000000000012', 4, now()),
('c000000000000000000000000000000000000013', 5, now()),
('c000000000000000000000000000000000000014', 6, now()),
('c000000000000000000000000000000000000015', 7, now()),
('v000000000000000000000000000000000000021', 8, now()),
('v000000000000000000000000000000000000022', 9, now()),
('v000000000000000000000000000000000000023', 10, now()),
('v000000000000000000000000000000000000024', 11, now()),
('v000000000000000000000000000000000000025', 12, now()),
('v000000000000000000000000000000000000026', 13, now()),
('v000000000000000000000000000000000000027', 14, now()),
('v000000000000000000000000000000000000028', 15, now()),
('v000000000000000000000000000000000000029', 16, now()),
('v000000000000000000000000000000000000030', 17, now()),
('v000000000000000000000000000000000000031', 18, now()),
('v000000000000000000000000000000000000032', 19, now()),
('v000000000000000000000000000000000000033', 20, now()),
('v000000000000000000000000000000000000034', 21, now()),
('v000000000000000000000000000000000000035', 22, now()),
('v000000000000000000000000000000000000036', 23, now()),
('v000000000000000000000000000000000000037', 24, now()),
('v000000000000000000000000000000000000038', 25, now()),
('v000000000000000000000000000000000000039', 26, now()),
('v000000000000000000000000000000000000040', 27, now()),
('v000000000000000000000000000000000000041', 28, now()),
('v000000000000000000000000000000000000042', 29, now()),
('v000000000000000000000000000000000000043', 30, now()),
('v000000000000000000000000000000000000044', 31, now()),
('v000000000000000000000000000000000000045', 32, now()),
('v000000000000000000000000000000000000046', 33, now()),
('v000000000000000000000000000000000000047', 34, now()),
('v000000000000000000000000000000000000048', 35, now()),
('v000000000000000000000000000000000000049', 36, now()),
('v000000000000000000000000000000000000050', 37, now()),
('v000000000000000000000000000000000000051', 38, now()),
('v000000000000000000000000000000000000052', 39, now()),
('v000000000000000000000000000000000000053', 40, now()),
('v000000000000000000000000000000000000054', 41, now()),
('v000000000000000000000000000000000000055', 42, now());

-- ---------------------------------------------------------------------------
-- 17. ADMIN PASSWORD (for web login: AdminDemo123!)
-- ---------------------------------------------------------------------------
UPDATE users SET password = 'pbkdf2_sha256$870000$M09a5eRThWXNk2BX35ZyGz$XfxsJiVBRAQN/9ejvAUapLc1PGY/TQfCIziZ0u0hpvM='
WHERE id IN (1, 2);

-- ---------------------------------------------------------------------------
-- 18. RESET PRIVILEGED WRITE & COMMIT
-- ---------------------------------------------------------------------------
SELECT set_config('app.privileged_write', 'off', true);
COMMIT;

-- =============================================================================
-- 19. POST-SEED VERIFICATION QUERY
-- =============================================================================
SELECT
    (SELECT count(*) FROM users)                                                          AS total_users,
    (SELECT count(*) FROM users WHERE is_admin)                                           AS total_admins,
    (SELECT count(*) FROM coordinator_profiles WHERE status = 'approved')                 AS approved_coordinators,
    (SELECT count(*) FROM coordinator_profiles WHERE status = 'pending')                  AS pending_coordinators,
    (SELECT count(*) FROM events)                                                         AS total_events,
    (SELECT count(*) FROM events WHERE start_at > now())                                  AS future_events,
    (SELECT count(*) FROM events WHERE start_at <= now())                                 AS past_events,
    (SELECT count(*) FROM event_posts)                                                    AS total_posts,
    (SELECT count(*) FROM event_applications)                                             AS total_applications,
    (SELECT count(*) FROM assignments)                                                    AS total_assignments,
    (SELECT count(*) FROM attendance)                                                     AS total_attendance,
    (SELECT count(*) FROM attendance_geo_attempts)                                        AS total_geo_attempts,
    (SELECT count(*) FROM feedback)                                                       AS total_feedback,
    (SELECT count(*) FROM moderation_actions)                                             AS total_moderation_actions,
    (SELECT count(*) FROM user_verification_images WHERE status = 'pending')              AS pending_verifications,
    (SELECT count(*) FROM authtoken_token)                                                AS drf_tokens;