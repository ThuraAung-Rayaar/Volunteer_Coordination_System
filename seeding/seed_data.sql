-- =============================================================================
-- Volunteer Coordination System - Yangon Demo Seed
-- PostgreSQL raw SQL; built against updated_volunteer_coordination_system_Database.sql
-- Generated from SEEDING_SQL_SPECIFICATION_AND_PROMPT_RULES.md.
--
-- IMPORTANT: This is a destructive DEMO reset. It truncates operational data and
-- audit history before reseeding. Run only against a development/demo database,
-- as the schema owner (or a PostgreSQL superuser).
--
-- Deliberate spec reconciliations:
--   * Event 6 is ACTIVE but starts in 10 minutes, so its geo window is open while
--     it still satisfies the required four-future / six-past diagnostic counts.
--   * Moderation requires 5 rows (2 warnings + 2 blocks + 1 hidden feedback),
--     although the sample diagnostic table in the specification says ~4.
--   * All event coordinates are representative Yangon city points, not surveyed
--     field-verified geofence coordinates; verify on site before production use.
-- =============================================================================

BEGIN;
SET LOCAL TIME ZONE 'Asia/Yangon';
SELECT set_config('app.user_id', '', true);
SELECT set_config('app.ip', '127.0.0.1', true);

-- DRF Token model table is not declared in the supplied database schema.
-- Create a compatible custom-user token table only when it does not already exist.
CREATE TABLE IF NOT EXISTS authtoken_token (
    key CHAR(40) PRIMARY KEY,
    created TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

-- audit_logs is append-only and has a TRUNCATE guard. Temporarily disable only
-- that statement-level guard so the explicitly requested demo reset can proceed.
ALTER TABLE audit_logs DISABLE TRIGGER trg_01_audit_no_truncate;
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
    onboarding_acknowledgments,
    user_verification_images,
    coordinator_profiles,
    volunteer_availability_exceptions,
    volunteer_availability_rules,
    user_charity_interests,
    auth_otp,
    authtoken_token,
    audit_logs,
    users
RESTART IDENTITY CASCADE;
ALTER TABLE audit_logs ENABLE TRIGGER trg_01_audit_no_truncate;

-- Temporary seed maps keep generated identity IDs independent of assumed sequence values.
CREATE TEMP TABLE _seed_accounts (
    phone TEXT PRIMARY KEY, phone_hash TEXT NOT NULL, phone_enc TEXT NOT NULL, token_key TEXT NOT NULL,
    display_name TEXT NOT NULL, account_kind TEXT NOT NULL, home_area TEXT NOT NULL, skills TEXT[] NOT NULL,
    has_leader_experience BOOLEAN NOT NULL, physical_ok BOOLEAN NOT NULL, can_lift_heavy BOOLEAN NOT NULL,
    can_work_outdoor BOOLEAN NOT NULL, blood_type TEXT NOT NULL, willing_donate BOOLEAN NOT NULL,
    verification_case TEXT NOT NULL
) ON COMMIT DROP;
INSERT INTO _seed_accounts VALUES
('+959100000001', 'c9e4cda2b1a976e3b714fb26055c158b27a83b67f161f625945b0bc6a417d537', 'gAAAAABq7d-sqhthb4jye1FCoDZ0q4HVBEz9-lkrx4qCmjpB6NlXB4-SDfhOFJgPyKw49ygcl-SOiqiGu0MyRmQf_QOAXLyXYQ==', 'a000000000000000000000000000000000000001', 'System Super Admin', 'admin', 'Dagon Township', ARRAY['administration', 'operations', 'logistics']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'unknown', FALSE, 'verified'),
('+959100000002', 'd770aa2d2309c320c8e1ed236ccb8ace4c3ccbad359c7c197a0c25f4a246d356', 'gAAAAABq7d-sfPzDRHiD67uEOd85IFv7OfzfLYDOcYVablFUMU93c3_S2j7uM6pEW6VjRccNzQZNjmiByO1LLwNZq0VyVEDGZg==', 'a000000000000000000000000000000000000002', 'Operations Admin', 'admin', 'Kyauktada Township', ARRAY['administration', 'operations', 'logistics']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'unknown', FALSE, 'verified'),
('+959100000011', 'fece8db10a9459a641486aa42eb977aa6648c946560a68c02952be76e84f18c8', 'gAAAAABq7d-sihVUM_cztvyluumRj0i5hcjNm37z5xmrB7dSnYXzYDoeBOOSLv3kWbHvYvZm0WWczMY3MLeHc4iyrzYnuZN9oA==', 'c000000000000000000000000000000000000011', 'Senior Coordinator One', 'coordinator', 'Kamayut Township', ARRAY['leadership', 'teaching', 'logistics']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000012', 'd66da299dd8ffa7cfa041888442c2676dd2770accc24ea85e7e1d079bd9a7b5a', 'gAAAAABq7d-s6MQoqBKD4m7I1QxoEJy9jh0mphCz1dsRcnevcglz4IV14iWQh2JDy5QnrHF-fHkZWA2_5xrtmC7a3f84a1yHbQ==', 'c000000000000000000000000000000000000012', 'Disaster Lead Two', 'coordinator', 'Bahan Township', ARRAY['leadership', 'first_aid', 'disaster_support', 'logistics']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000013', '19810eb9111feb8554d47ab5d9264ea2faf55cbd2d89c8f8800febf0e030c23e', 'gAAAAABq7d-sDJxPW-Is9qGm5SdV_Kt4ovBest2zVZ49N-IYoGP9dDDnG2DUv38pxfyat0f294SSybOeNHY9vftO4jB15Jm3IQ==', 'c000000000000000000000000000000000000013', 'Youth Lead Three', 'coordinator', 'Hlaing Township', ARRAY['leadership', 'teaching', 'food_distribution']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000014', '2f5609c11e734427c91157d2781c1b5fd75ddc68492e40cf01fa09cb35e79501', 'gAAAAABq7d-skVxHoKqDvGDChm0ycqNrGKGh3L7TISbaQtmqp1BUoFQW-9CzxUCsBWICAymb48I97jU3qcIkTnGxGqZuGVTQRg==', 'c000000000000000000000000000000000000014', 'Eco Lead Four', 'coordinator', 'Sanchaung Township', ARRAY['leadership', 'environment', 'cleaning']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000015', '78ec9bffc61e3584666a6ceb967bb9583af087ca479c21955b552789a51e3e63', 'gAAAAABq7d-s0ZBXEQCJMJ6sS3PlFNqbpo_q38svZfDjghDbOBU_i50hWoUDrU2oyUvy1oNJeShFNBP88nsMIRBU4G985ngxTQ==', 'c000000000000000000000000000000000000015', 'Community Lead Five', 'coordinator', 'Kyauktada Township', ARRAY['leadership', 'logistics', 'disaster_support']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000021', 'e4a10f205e2cf8d11a2e439290fff9b23f48f0c6e54063b994a2191f17262ae9', 'gAAAAABq7d-stly9mEBAdU8miJqAYOpohrqNPKCODbjLCFq5XePvzP_UUwUf1uiDG6UY9O5Z75Ty0X0EXFyXKZ_dnKv49hLfew==', 'v000000000000000000000000000000000000021', 'Volunteer 01 - Aung Min Thant', 'volunteer', 'Kamayut Township', ARRAY['teaching', 'first_aid', 'logistics']::TEXT[], TRUE, TRUE, FALSE, TRUE, 'O+', FALSE, 'verified'),
('+959100000022', 'b4dd79310575ea0f34457df203ce8e650c02e01d73ad7ba970862f9ba9046b1b', 'gAAAAABq7d-sT5l2OjNG6-TksMLow0pwpc31Wj0oW1SqEzZfZSqQEFgq5fpLWrl0SBmY5Cuo53o-TggOvrE-haDPz_7ZYXK1OQ==', 'v000000000000000000000000000000000000022', 'Volunteer 02 - May Thazin', 'volunteer', 'Sanchaung Township', ARRAY['teaching', 'child_care']::TEXT[], TRUE, TRUE, FALSE, FALSE, 'B+', FALSE, 'verified'),
('+959100000023', 'da0fd5f6a5ff7aecfbe2cc2bda2a0039e1d9053e4d06cd2d70fdfe4d91394fe9', 'gAAAAABq7d-shmV2VXxB4R-qtz70cn-jgzx-XC3Jvx1BUCyq06gsTaeibQhz7HugzWNB6Va5Jxy9GOXh-Ysav9VJMivUof-n-g==', 'v000000000000000000000000000000000000023', 'Volunteer 03 - Htet Htet Win', 'volunteer', 'Bahan Township', ARRAY['logistics', 'environment', 'cleaning']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'AB+', FALSE, 'verified'),
('+959100000024', '785b0e34745db38cd31147fe1d6ba221b46291658eec2d5c0d2b2ce4b0368a6a', 'gAAAAABq7d-sOqQLkV8ElYJDfeHDljf63nnbuS9dlpjrungUgCk90WMK3LqCL5WUwRqrUoyN1it94Nh4tyosEedQp_a-C1eVRg==', 'v000000000000000000000000000000000000024', 'Volunteer 04 - Kyaw Zin Oo', 'volunteer', 'Kyauktada Township', ARRAY['first_aid', 'logistics', 'driving']::TEXT[], TRUE, TRUE, TRUE, FALSE, 'A-', TRUE, 'verified'),
('+959100000025', 'e3a1f9a993bfca9854fd7a576bf485bc61f19b494a095bbca4198c76eb734589', 'gAAAAABq7d-sPKSiAVLqx_8g0Co33e7vJAS0x_XaJ_4VwQBKj99b2eyf5CZFRlGpUu1ZgVH4ooOYAqM0KybXS3i_PjVKbg9uTQ==', 'v000000000000000000000000000000000000025', 'Volunteer 05 - Ei Mon Lwin', 'volunteer', 'Tamwe Township', ARRAY['food_distribution', 'cooking']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'O-', FALSE, 'verified'),
('+959100000026', '5465e150ab832da5e203c3947918cc4cfd37943a0c15fe07fca86ae0aa987218', 'gAAAAABq7d-sUP7iosCx7x06jFj_cpCHTPscAskbdQ7yiu-jM4nHhvPPUU5r1wmsG-_SWEW4VxmvIU15Ru3UEUF8YYv3TCAaww==', 'v000000000000000000000000000000000000026', 'Volunteer 06 - Thant Zin', 'volunteer', 'Hlaing Township', ARRAY['logistics', 'driving']::TEXT[], FALSE, TRUE, TRUE, TRUE, 'B-', TRUE, 'verified'),
('+959100000027', 'ec922ca32c502903b9a6c704535adbb26409f91a48339308d78c767a51ca9c91', 'gAAAAABq7d-sBcXsMkydp2roDJ-DanH0zQGar6cazYhTDSYtu-kFA8ZiaXXEwWc_fHALxNqh8K42SOOU569YOnGXZ5SgMIOaiw==', 'v000000000000000000000000000000000000027', 'Volunteer 07 - Nandar Hlaing', 'volunteer', 'Dagon Township', ARRAY['environment', 'cleaning']::TEXT[], FALSE, TRUE, FALSE, TRUE, 'unknown', FALSE, 'verified'),
('+959100000028', 'e0bb04b0b3791eb528ea8663d57cb82f77aab24c6319a74011b2cda14c558a57', 'gAAAAABq7d-sFLyQBPqGDwZgrGefW8T7KRsnMmq89qHwFiqgn8TAaDSIxjocaAlFVY0aMJV6OEJFCLy1rkg8UlLhQSYlXbaCwQ==', 'v000000000000000000000000000000000000028', 'Volunteer 08 - Sai Naw Htoo', 'volunteer', 'Thingangyun Township', ARRAY['teaching', 'child_care']::TEXT[], TRUE, TRUE, FALSE, FALSE, 'A+', FALSE, 'verified'),
('+959100000029', 'ef1bc2713db507f29ff31582e91992fb0ac917dd8c4491b903d22f799d6fe6cb', 'gAAAAABq7d-sZ71_c--ocvztV0gQFu31ygW3fTuIBV-m7uxzWdCVRnwj0NzDvU-dgTmxMaiD5DZIe4DCbvqPxb1BISCq3XjAPw==', 'v000000000000000000000000000000000000029', 'Volunteer 09 - Phyu Sin Aye', 'volunteer', 'Mayangone Township', ARRAY['first_aid', 'crowd_control']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'O+', TRUE, 'verified'),
('+959100000030', 'fc0d5858b56d1fb01e3eb548ab03977aa783413a78523ef449c10d19c8bfd5b0', 'gAAAAABq7d-sfxWVfgym176Zz8KqYtofrOe0d8zCpOsSilFyKPgVDakoFVFnMWOUNelE14ZfymK7dnFBEBl8JLALiCWQ_wcFVQ==', 'v000000000000000000000000000000000000030', 'Volunteer 10 - Min Khant Kyaw', 'volunteer', 'Yankin Township', ARRAY['logistics', 'food_distribution']::TEXT[], FALSE, TRUE, TRUE, TRUE, 'B+', FALSE, 'verified'),
('+959100000031', '1ac3a49da8c79d15ebd8fa62d4dfe9bde0de839e37c7cba2ec9d84586d8a4053', 'gAAAAABq7d-syqIzrltiOtyiDAPbvy0QPj3heiqu_e9hGGR-8iYpkaNasPlqBF6RSLNsNhcdZhUDY7Y8jPPXU_LYr5DP6Iv5Ug==', 'v000000000000000000000000000000000000031', 'Volunteer 11 - Su Myat Noe', 'volunteer', 'Insein Township', ARRAY['cooking', 'food_distribution']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'AB+', FALSE, 'verified'),
('+959100000032', '4c24e29de878dd96284c4d193ff97bdcc0965875b3b7b4d4ed79689c38225b83', 'gAAAAABq7d-sCtVmWyZNiasYq5SrAyxkBaeiIe7yFBE6XBJhwN3VS7GOKuewkil-sVmkurz1s4Dq-aI7wT2tBj8IeXLRRGvnGA==', 'v000000000000000000000000000000000000032', 'Volunteer 12 - Thet Paing Soe', 'volunteer', 'Mingalar Taung Nyunt Township', ARRAY['logistics', 'inventory']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'A-', TRUE, 'verified'),
('+959100000033', '30d7656c52bbd91f67698014151cfc7abcd9858db5ce440fb33ae6b2fa163539', 'gAAAAABq7d-sbiBUbKqmkfwMIbeGo5h9iKZZJ5Gbq9nL9dx55W8GLyqjA_I4M72osELk98vCUa7dAzFyEcMmYDXdLjPLNRO4eQ==', 'v000000000000000000000000000000000000033', 'Volunteer 13 - Khin Wint Wah', 'volunteer', 'Pazundaung Township', ARRAY['first_aid', 'driving']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'O-', FALSE, 'verified'),
('+959100000034', 'ba45cc5558d79ae0fc799df5d78c697b5f25f67ced49957c83730db6165506f9', 'gAAAAABq7d-sJBXbZKFX3fxRz1OC9Awit3ZvPA3ktIZ9bGSSMkRNmpKNpsxXuYiZpd9QLng9Fg9bHJ3RXWjwz1Yk7q8dGAds0w==', 'v000000000000000000000000000000000000034', 'Volunteer 14 - Ye Yint Aung', 'volunteer', 'Ahlone Township', ARRAY['environment', 'cleaning']::TEXT[], FALSE, TRUE, TRUE, TRUE, 'B-', FALSE, 'verified'),
('+959100000035', '3cc6507dce81d2d8045c07e5491c8b08219c57ce0b4a2a7dcc3f15d771e02402', 'gAAAAABq7d-spNwZ4XOg6U1yEnE744Ph7rq_p8c8-V59qN3OfZrndN0nAvgo0Dmlvijo1M8vBdF9j1ViQ7d4sxMa6EPC1k0pWg==', 'v000000000000000000000000000000000000035', 'Volunteer 15 - Moe Thiri', 'volunteer', 'Lanmadaw Township', ARRAY['teaching', 'translation']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'unknown', TRUE, 'verified'),
('+959100000036', '327ebe08f81f4600e09e6ebd2e7254d5bc4d7a5a4afb8f86221f0a2682ac78ff', 'gAAAAABq7d-sPQp87Z0m8_yNvZYcESprDqHMeNG3IFO66_EIxcOt1JzvVAHKHWrzJrcKBjVXDAmVNzcJLb7_A-ntoJPfuUqNjA==', 'v000000000000000000000000000000000000036', 'Volunteer 16 - Nay Lin Tun', 'volunteer', 'Latha Township', ARRAY['environment', 'animal_welfare']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'A+', FALSE, 'verified'),
('+959100000037', '2dbc3ebd21b7f17a1b050bd8d64df89d9211ce9e7e147fd5b34b62eb1dd0cf86', 'gAAAAABq7d-sT0nNwnwpMSsaDx-7kc7kM4ktuMp-hF88F_CJDlY4v1KZ-4jveKQS-tt7ZdnfzVj-KFqqtjnKUei4rI3DQ62nuA==', 'v000000000000000000000000000000000000037', 'Volunteer 17 - Yamin Htet', 'volunteer', 'Botataung Township', ARRAY['animal_welfare', 'first_aid']::TEXT[], FALSE, TRUE, FALSE, TRUE, 'O+', FALSE, 'verified'),
('+959100000038', '53fb600334bb091b8d6442e0fc9507d87e7cd3f575baf8c4dbcbc175ce8b4181', 'gAAAAABq7d-sh6xzdVoyKb1fnrXvEawS1B4zxezzO3w2dEe7GVa9BT_YAzc3baCJ2tp7u-GH8QcCrhI-NHJa9PrEUVft-xF1Zg==', 'v000000000000000000000000000000000000038', 'Volunteer 18 - Pyae Phyo Aung', 'volunteer', 'South Okkalapa Township', ARRAY['logistics', 'driving']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'B+', TRUE, 'verified'),
('+959100000039', '3ef855c0689cec687b7f65926d7fdb3136f8abd93ac51e7410993d1d892c8dc1', 'gAAAAABq7d-siNj4THkjAxX4wqBuqvjKtNNJjViP4ZWHUwfqt-tZ3YaB34Mq8l3hRtdcea_PyXGzke71XIGz12LiQCJ0mHijOw==', 'v000000000000000000000000000000000000039', 'Volunteer 19 - Cherry Myat', 'volunteer', 'North Okkalapa Township', ARRAY['first_aid', 'teaching']::TEXT[], TRUE, TRUE, FALSE, FALSE, 'AB+', FALSE, 'verified'),
('+959100000040', '10f5e0b12c1217503c9540e0edc3e8fcc101c8c6053d8564b0f8620f66cff189', 'gAAAAABq7d-sVIP_xtEiP_Wqpe_bFIwhA2wVZ3azLEuf09AGt0UbYKLeFBFKJfnw86bJFaonh0XyoxOuL_c4U3QjeG5JB5zOEQ==', 'v000000000000000000000000000000000000040', 'Volunteer 20 - Ko Ko Lwin', 'volunteer', 'Mayangone Township', ARRAY['teaching', 'translation']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'A-', FALSE, 'verified'),
('+959100000041', 'be32ecfcfb54061b0d736c2ccb0a6a5aa90fe30bde64525af4022481abaab600', 'gAAAAABq7d-sT4IyYt6nNjHCcR_fPCiochO0IJjuwo_kU2DPk2XxT19Q6O4H44mgTAaRFA-vkNxBoWaB3ScGi7Ht4O1rgEdoYg==', 'v000000000000000000000000000000000000041', 'Volunteer 21 - Ei Phyu Phyu', 'volunteer', 'Hlaing Township', ARRAY['food_distribution', 'cooking']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'O-', TRUE, 'verified'),
('+959100000042', 'c33df089da4e0880a3d62ceae896af748b55d30c115dc9bcb21613306d0adcd4', 'gAAAAABq7d-sGWoOtNC-DWF0aO4JMwS1m8XwD7W4Z_Zq1rKkqarGe6aT0L9GPf0qP7ntTvsLMlwO6VwVIlsCXPJ-q9nAzp5bvg==', 'v000000000000000000000000000000000000042', 'Volunteer 22 - Zaw Zaw Htet', 'volunteer', 'Kamayut Township', ARRAY['teaching', 'logistics']::TEXT[], TRUE, TRUE, FALSE, FALSE, 'B-', FALSE, 'verified'),
('+959100000043', '251aed756061a72da3cd7b998636ff42fdcfcd4903b080112812110a104e6cf5', 'gAAAAABq7d-sveRmGYM9DZl9_ydQcY_qXFxys8e8oNJR8_4fCIy6KHsPIfLBCNABQVhxdHhcgNZSnFem-sSOhYPPt5HHNVudOQ==', 'v000000000000000000000000000000000000043', 'Volunteer 23 - Thiri Htun', 'volunteer', 'Bahan Township', ARRAY['food_distribution', 'logistics']::TEXT[], TRUE, TRUE, TRUE, TRUE, 'unknown', TRUE, 'verified'),
('+959100000044', '24f30aab6d0a37532ef755e688b7309c078c3bb16bf67602205c9215ca2ddfc6', 'gAAAAABq7d-syAmUzXMDDU6tATMawv9ptMF-IziSN8ITmlLrNvR9OAULlcUAbLMzeauTx1ka4xktm5_RzxTTVwGRtFr3zjCTbw==', 'v000000000000000000000000000000000000044', 'Volunteer 24 - Nyein Chan', 'volunteer', 'Dagon Township', ARRAY['environment', 'cleaning']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'A+', FALSE, 'pending'),
('+959100000045', 'fc0ba28431f7e1450857f2b90228ed9238ac37b7cf1408e3f064336058f29091', 'gAAAAABq7d-s_YLs5If2WfpoRVW-eola9SFihruSgeH1oruvl7Fujw0_oqWLkPCS8qBmjSQXiBCYySfmGp_G5w7BbM_OLHjokA==', 'v000000000000000000000000000000000000045', 'Volunteer 25 - Hnin Pwint', 'volunteer', 'Yankin Township', ARRAY['logistics']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'O+', FALSE, 'pending'),
('+959100000046', '7e9f4552ad37b2470d9f2612a1330d35c415bd0e8fd0cc99025f2e19ec1a05b3', 'gAAAAABq7d-sLFzGpRvc2PMwBsUyCS9SFA9ZeD0IeEBl4POVayhfCKrWQiQQ2OAkmCWJJ7eGI1IZFGjm-65bxBIllGFpwS9jIA==', 'v000000000000000000000000000000000000046', 'Volunteer 26 - Phone Myat', 'volunteer', 'Tamwe Township', ARRAY['first_aid']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'B+', FALSE, 'pending'),
('+959100000047', 'dedb242ad1bc2adb0353b0909db4f956448abbbaea59d8956ba450ab29241357', 'gAAAAABq7d-slFcGGfA7NMB31k8dkid-aYIRxV6D1LRrA_IGQErqMvjKp9FxeNwuDPK-Ugv_dowNsWgSSV8reF1lJIjEAuttFw==', 'v000000000000000000000000000000000000047', 'Volunteer 27 - Aye Chan', 'volunteer', 'Sanchaung Township', ARRAY['teaching']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'AB+', FALSE, 'pending'),
('+959100000048', 'f45f079e6f59830795f68b80cd80696a5c1574ac8a9c3608f40a08ffc3e39770', 'gAAAAABq7d-soRcdkwesEuS8Gtj4LnKG1LAKFA6m94rovN8_5viDU5F_XPuv_zANMIYhjR4GA__Di2dKSSPgRHQUeDDB6gqrBg==', 'v000000000000000000000000000000000000048', 'Volunteer 28 - Lin Let Oo', 'volunteer', 'Thingangyun Township', ARRAY['driving', 'logistics']::TEXT[], FALSE, TRUE, TRUE, TRUE, 'A-', FALSE, 'pending'),
('+959100000049', 'edb2cef4cb92a07564ae912dfcab8467e663e997312ee169bec4584f6b2e5ce2', 'gAAAAABq7d-sH7rVpO_u1MJBL4TYfyJgRGlEa7OUWAr7GHH_9hu1d1E_r1j-yp2ifRvqiUZnJGCqG4j4pbxgn4mOo0sYkc-4sg==', 'v000000000000000000000000000000000000049', 'Volunteer 29 - Thaw Zin', 'volunteer', 'Insein Township', ARRAY['cooking']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'O-', FALSE, 'rejected'),
('+959100000050', 'f6605227dc71a2f1eecf740f0ac42fe2c1bf6c0038cb26db1e214b5972229324', 'gAAAAABq7d-skvVeEzWeOUVR2vmy1XYf65cdIlGHR8nozsFO7N4vV0_0QE89qAze776buDUSjyHyaDO4lHmdEVMCiWDTkmRnPA==', 'v000000000000000000000000000000000000050', 'Volunteer 30 - Myo Min Htet', 'volunteer', 'Mayangone Township', ARRAY['fundraising']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'B-', FALSE, 'rejected'),
('+959100000051', '63986910d3a7a24c7722f0862308154a358982b00f523f27116bccba9c48cee5', 'gAAAAABq7d-sZdB2IVWVQcLpEqUz9HzT6H_zhQ7ghoE977-MFO5RhTg-aQNu0JH2CEmpOCbE_eLcWp9OCJxAh5wxZRtoIZmNTQ==', 'v000000000000000000000000000000000000051', 'Volunteer 31 - Mya Mya Khaing', 'volunteer', 'Pazundaung Township', ARRAY['cleaning']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'unknown', FALSE, 'none'),
('+959100000052', '2f155273d85293493f66ff968c316fb77953f4a25c28123d8a040bd0745c62e1', 'gAAAAABq7d-stnMKWoXb1kyfYNwjTd2cl2VR8DTAwGeLkDXvS3qvuKRkGQCBYKtgRi9VL6ENHIJXrGin2eZYSWeoIKP5p16tKQ==', 'v000000000000000000000000000000000000052', 'Volunteer 32 - Wai Yan', 'volunteer', 'Ahlone Township', ARRAY['logistics']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'A+', TRUE, 'verified'),
('+959100000053', '343a2f91bdb6b69f9e62e639cbc8ff347ae057466008f6eb8123194cd66dca1a', 'gAAAAABq7d-sueGIpGr5Lh7V7apoQwTDImi9ZuVANjxpR6nY-m6EkZm06ShzXFIodterNChEYiM58unOLu5EWGMLdRWua3N0SA==', 'v000000000000000000000000000000000000053', 'Volunteer 33 - Hlaing Htet', 'volunteer', 'Lanmadaw Township', ARRAY['animal_welfare']::TEXT[], FALSE, TRUE, FALSE, TRUE, 'O+', TRUE, 'verified'),
('+959100000054', '2ac447025b82f2119039bb03cbc2f92f68db56e743e290c749ad4ad4543b6fa1', 'gAAAAABq7d-sn5O3-ATc5gz1W-phYC_5FlUk9KTRM_gqg_Wy357QxgReC-l_7uar-RMrlgjv1769Oqwg8pX8dCiEXghVKpmuew==', 'v000000000000000000000000000000000000054', 'Volunteer 34 - Sai Sai', 'volunteer', 'Latha Township', ARRAY['first_aid']::TEXT[], FALSE, TRUE, TRUE, FALSE, 'B+', FALSE, 'verified'),
('+959100000055', '7edbc266e5faad9e6dca9d9235c4e002ff9c2318cc955df4e0bb2b03b5d1590a', 'gAAAAABq7d-sbFFVjBEzEhuC-iwklaAkqh4L7XM4Q0erWJb7PrkDnuex2ukvcPxRPqL8vnjCH5sXj2xb0Qoy2sigRW7kRiZ00w==', 'v000000000000000000000000000000000000055', 'Volunteer 35 - Nwe Nwe Win', 'volunteer', 'Botataung Township', ARRAY['teaching']::TEXT[], FALSE, TRUE, FALSE, FALSE, 'AB+', FALSE, 'verified');

-- Users: UUIDs are deterministic for a repeatable demo and avoid relying on the
-- schema's uuidv7() default when targeting PostgreSQL versions without uuidv7().
INSERT INTO users (uuid, phone_hash, phone_enc, password, display_name,
                  is_admin, is_staff, is_superuser, account_status, preferred_language,
                  home_area, blood_type, is_willing_to_donate, is_willing_to_donate_blood,
                  physical_ok, good_eyesight, needs_glasses, can_lift_heavy, can_work_outdoor,
                  has_leader_experience, new_to_volunteer, skills, needs_meal_support,
                  needs_travel_support, accepts_unpaid)
SELECT md5(a.phone_hash)::uuid, a.phone_hash, a.phone_enc,
       CASE WHEN a.account_kind = 'admin' THEN
         'pbkdf2_sha256$870000$M09a5eRThWXNk2BX35ZyGz$XfxsJiVBRAQN/9ejvAUapLc1PGY/TQfCIziZ0u0hpvM='
         ELSE NULL END,
       a.display_name, a.account_kind = 'admin', a.account_kind = 'admin',
       a.phone = '+959100000001', 'active', 'en', a.home_area, a.blood_type,
       a.willing_donate, a.willing_donate, a.physical_ok, TRUE, FALSE,
       a.can_lift_heavy, a.can_work_outdoor, a.has_leader_experience,
       (a.account_kind = 'volunteer' AND right(a.phone, 3)::int >= 44),
       a.skills, FALSE, FALSE, TRUE
  FROM _seed_accounts a ORDER BY a.phone;

-- One DRF token per account; key and cryptographic material are copied exactly
-- from the supplied specification.
INSERT INTO authtoken_token (key, created, user_id)
SELECT a.token_key, now(), u.id
  FROM _seed_accounts a JOIN users u ON u.phone_hash = a.phone_hash;

-- Verification-image uploads. The database trigger forces every new image to pending;
-- the review updates below deliberately drive the derived users.verification_status.
INSERT INTO user_verification_images (user_id, image_type, image_path, file_format, file_sha256, is_current, note)
SELECT u.id, t.image_type,
       'demo/verification/' || regexp_replace(a.phone, '[^0-9]', '', 'g') || '_' || t.image_type || '.jpg',
       'jpeg', md5(a.phone || ':' || t.image_type) || md5(a.phone || ':' || t.image_type || ':sha'), TRUE,
       'Synthetic demo verification image path; no real identity document is stored.'
  FROM _seed_accounts a JOIN users u ON u.phone_hash = a.phone_hash
 CROSS JOIN LATERAL (VALUES ('mock_selfie'), ('id_license')) AS t(image_type)
 WHERE a.verification_case = 'verified';
INSERT INTO user_verification_images (user_id, image_type, image_path, file_format, file_sha256, is_current, note)
SELECT u.id, 'id_license',
       'demo/verification/' || regexp_replace(a.phone, '[^0-9]', '', 'g') || '_id_license.jpg',
       'jpeg', md5(a.phone || ':id_license') || md5(a.phone || ':id_license:sha'), TRUE,
       'Pending ID verification queue demo; synthetic path only.'
  FROM _seed_accounts a JOIN users u ON u.phone_hash = a.phone_hash
 WHERE a.verification_case IN ('pending', 'rejected');

SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE phone_hash =
       (SELECT phone_hash FROM _seed_accounts WHERE phone = '+959100000001')), true);
-- Explicitly alternate the reviewer for the two admin accounts to prevent self-review.
UPDATE user_verification_images i SET status = 'approved', comparison_status = 'match', note = 'Demo-reviewed: approved.',
       reviewed_by_id = CASE WHEN i.user_id = (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001'))
                            THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000002'))
                            ELSE (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')) END,
       reviewed_at = now()
 WHERE i.user_id IN (SELECT u.id FROM users u JOIN _seed_accounts a ON a.phone_hash = u.phone_hash WHERE a.verification_case = 'verified')
   AND i.status = 'pending';
UPDATE user_verification_images i SET status = 'rejected', comparison_status = 'no_match', note = 'Demo-reviewed: rejected.',
       reviewed_by_id = (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')), reviewed_at = now()
 WHERE i.user_id IN (SELECT u.id FROM users u JOIN _seed_accounts a ON a.phone_hash = u.phone_hash WHERE a.verification_case = 'rejected')
   AND i.status = 'pending';
SELECT set_config('app.user_id', '', true);

-- Coordinator profiles start pending, then follow the guarded approval transition.
INSERT INTO coordinator_profiles (user_id, status, notes)
SELECT u.id, 'pending', CASE WHEN a.phone IN ('+959100000021', '+959100000022', '+959100000023') THEN 'Applicant applied via portal, awaiting admin interview' ELSE 'Initial coordinator registration; demo profile.' END
  FROM users u JOIN _seed_accounts a ON a.phone_hash = u.phone_hash
 WHERE a.phone IN ('+959100000011', '+959100000012', '+959100000013', '+959100000014', '+959100000015',
                  '+959100000021', '+959100000022', '+959100000023');
UPDATE coordinator_profiles cp
   SET status = 'approved',
       approved_by_id = CASE a.phone
           WHEN '+959100000011' THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001'))
           WHEN '+959100000012' THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000002'))
           WHEN '+959100000013' THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001'))
           WHEN '+959100000014' THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000002'))
           WHEN '+959100000015' THEN (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001'))
           ELSE NULL END, approved_at = now()
  FROM _seed_accounts a JOIN users u ON u.phone_hash = a.phone_hash
 WHERE cp.user_id = u.id AND a.phone IN ('+959100000011', '+959100000012', '+959100000013', '+959100000014', '+959100000015');

-- Yangon event catalogue. Coordinates are representative points in Yangon city.
CREATE TEMP TABLE _seed_events (
    event_key INTEGER PRIMARY KEY, owner_phone TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
    location_name TEXT NOT NULL, landmark_text TEXT NOT NULL, latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL, geo_radius_m INTEGER NOT NULL, target_status TEXT NOT NULL,
    acceptance_mode TEXT NOT NULL, auto_assign_enabled BOOLEAN NOT NULL, require_ack BOOLEAN NOT NULL,
    onboarding_text TEXT, max_participants INTEGER NOT NULL, field_codes TEXT[] NOT NULL
) ON COMMIT DROP;
INSERT INTO _seed_events VALUES
  (1, '+959100000011', 'Yangon Tech Mentorship Camp', 'A practical technology mentoring camp connecting early-career learners with local software and IT professionals.', 'MICT Park, Hlaing Township', 'Near Yangon University Avenue / MICT Park', 16.840500, 96.133200, 150, 'published', 'auto', TRUE, FALSE, NULL, 40, ARRAY['teaching','logistics']),
  (2, '+959100000011', 'Urban Flood Emergency Relief', 'Community distribution of essential supplies and household support after urban flooding.', 'Kandawgyi Park, Mingalar Taung Nyunt Township', 'Kandawgyi Lake park entrance', 16.795200, 96.170300, 200, 'completed', 'manual', FALSE, FALSE, NULL, 40, ARRAY['disaster_support','food_distribution','logistics']),
  (3, '+959100000011', 'Inya Lake Cleanup Drive', 'A lakeside cleanup and waste-sorting activity focused on reducing litter around Inya Lake.', 'Inya Lake, Kamayut Township', 'Inya Lake public recreation area', 16.836772, 96.145217, 150, 'completed', 'manual', FALSE, FALSE, NULL, 35, ARRAY['environment','cleaning']),
  (4, '+959100000012', 'First-Aid & Triage Workshop', 'A practical first-aid and basic triage workshop for community volunteers.', 'University of Yangon, Kamayut Township', 'University of Yangon campus area', 16.828500, 96.130600, 150, 'published', 'manual', FALSE, TRUE, 'Please review the first-aid safety notes, escalation process, and workshop conduct rules before your shift.', 30, ARRAY['blood_donation','teaching','other']),
  (5, '+959100000012', 'Cyclone Response Packaging', 'Packing, checking, and dispatching family relief kits for cyclone preparedness.', 'Yangon Convention Centre area, Mayangone Township', 'Min Dhama Road area', 16.876000, 96.132000, 250, 'completed', 'manual', FALSE, FALSE, NULL, 50, ARRAY['disaster_support','logistics','fundraising']),
  (6, '+959100000013', 'Downtown Community Food Station', 'A live community food station with meal preparation, packing, and orderly distribution.', 'Yangon City Hall, Kyauktada Township', 'Near Maha Bandula Park', 16.774500, 96.158900, 150, 'active', 'manual', FALSE, TRUE, 'Follow food hygiene guidance, keep walkways clear, and check in only from the marked station area.', 30, ARRAY['food_distribution','cooking','logistics']),
  (7, '+959100000013', 'School Supplies Sorting Drive', 'Sorting school materials into class-ready bundles for partner schools.', 'People''s Park, Dagon Township', 'People''s Square / People''s Park area', 16.798800, 96.143400, 150, 'completed', 'manual', FALSE, FALSE, NULL, 30, ARRAY['teaching','logistics']),
  (8, '+959100000014', 'Mangrove Reforestation Day', 'A draft volunteer activity for nursery preparation and environmental restoration awareness.', 'Kandawgyi Park, Mingalar Taung Nyunt Township', 'Kandawgyi Park demonstration meeting point', 16.795165, 96.170274, 250, 'draft', 'manual', FALSE, FALSE, NULL, 40, ARRAY['environment','logistics']),
  (9, '+959100000014', 'Wildlife Trail Maintenance', 'A small urban biodiversity and habitat-awareness trail maintenance activity.', 'Yangon Zoological Gardens area, Mingalar Taung Nyunt Township', 'Zoological Gardens / Kandawgyi vicinity', 16.791400, 96.162400, 200, 'completed', 'manual', FALSE, FALSE, NULL, 30, ARRAY['animal_welfare','environment','cleaning']),
  (10, '+959100000015', 'Monsoon Emergency Shelter Prep', 'Preparing community shelter supplies and basic sleeping areas ahead of severe monsoon weather.', 'Dagon Township community hall area', 'Central Dagon Township meeting point', 16.780400, 96.149200, 200, 'cancelled', 'manual', FALSE, FALSE, NULL, 40, ARRAY['disaster_support','logistics']);

INSERT INTO events (owner_id, current_coordinator_id, title, description, purpose_type, location_name, landmark_text,
                    latitude, longitude, geo_radius_m, geo_checkin_enabled, geo_checkin_opens_before_min,
                    require_checkin_confirmation, map_provider, start_at, end_at, application_deadline,
                    acceptance_mode, auto_assign_enabled, group_size, leader_strategy, max_participants,
                    meals_provided, lodging_provided, travel_support_provided, compensation_kind,
                    onboarding_text, require_onboarding_ack, qr_registration_enabled)
SELECT u.id, u.id, se.title, se.description, 'charity_event', se.location_name, se.landmark_text,
       se.latitude, se.longitude, se.geo_radius_m, TRUE, 30, TRUE, 'openstreetmap',
       CASE se.event_key WHEN 1 THEN now() + interval '3 days'
            WHEN 4 THEN now() + interval '7 days' WHEN 6 THEN now() + interval '10 minutes'
            WHEN 8 THEN now() + interval '14 days' ELSE now() + interval '45 days' END,
       CASE se.event_key WHEN 1 THEN now() + interval '3 days 5 hours'
            WHEN 4 THEN now() + interval '7 days 4 hours' WHEN 6 THEN now() + interval '3 hours'
            WHEN 8 THEN now() + interval '14 days 4 hours' ELSE now() + interval '45 days 4 hours' END,
       NULL, se.acceptance_mode, se.auto_assign_enabled, 5, 'first_experienced', se.max_participants,
       TRUE, FALSE, TRUE, 'unpaid', se.onboarding_text, se.require_ack, TRUE
  FROM _seed_events se JOIN _seed_accounts a ON a.phone = se.owner_phone
  JOIN users u ON u.phone_hash = a.phone_hash ORDER BY se.event_key;

CREATE TEMP TABLE _seed_posts (
    event_key INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, headcount INTEGER NOT NULL,
    physical_level TEXT NOT NULL, required_skills TEXT[] NOT NULL, leader_needed BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER NOT NULL DEFAULT 100, PRIMARY KEY(event_key, title)
) ON COMMIT DROP;
INSERT INTO _seed_posts VALUES
  (1,'Mentors','Guide small learner groups through the project exercises.',10,'light',ARRAY['teaching'],TRUE,10),
  (1,'Lab Techs','Prepare laptops, accounts, and the learning room.',8,'light',ARRAY['logistics'],FALSE,20),
  (2,'Flood Supply Packers','Pack dry food, drinking water, and essential household kits.',12,'light',ARRAY['logistics'],TRUE,10),
  (2,'Distribution Runners','Support queue flow and last-mile handover.',12,'light',ARRAY[]::text[],FALSE,20),
  (3,'Lakeside Cleanup Crew','Collect and separate litter along the public lake edge.',12,'medium',ARRAY['environment','cleaning'],TRUE,10),
  (3,'Waste Sorting Team','Sort collected waste into designated categories.',10,'light',ARRAY['cleaning'],FALSE,20),
  (4,'First-Aid Assistants','Support supervised triage exercises and first-aid stations.',12,'light',ARRAY['first_aid'],TRUE,10),
  (4,'Workshop Registration','Welcome participants and manage attendance materials.',8,'light',ARRAY['logistics'],FALSE,20),
  (5,'Relief Kit Packers','Assemble cyclone-response supply kits.',15,'light',ARRAY['logistics','disaster_support'],TRUE,10),
  (5,'Inventory and Dispatch','Check kit inventories and prepare dispatch lists.',10,'light',ARRAY['logistics'],FALSE,20),
  (6,'Meal Preparation Crew','Prepare and portion meals under the station lead.',12,'light',ARRAY['cooking','food_distribution'],TRUE,10),
  (6,'Queue and Packing Support','Pack meals and guide orderly collection.',12,'light',ARRAY[]::text[],FALSE,20),
  (7,'School Materials Sorters','Sort notebooks, stationery, and school supply packs.',12,'light',ARRAY['logistics'],TRUE,10),
  (7,'School Liaison Helpers','Label class bundles and prepare school handover lists.',8,'light',ARRAY['teaching'],FALSE,20),
  (8,'Mangrove Planters','Prepare seedlings and planting materials for the field activity.',15,'medium',ARRAY['environment'],TRUE,10),
  (8,'Nursery Logistics','Organize tools, water, and seedling inventory.',10,'light',ARRAY['logistics'],FALSE,20),
  (9,'Trail Maintenance Crew','Clear light debris and maintain marked trail edges.',10,'medium',ARRAY['environment','cleaning'],TRUE,10),
  (9,'Wildlife Observation Support','Assist with habitat-awareness materials and visitor guidance.',8,'light',ARRAY['animal_welfare'],FALSE,20),
  (10,'Shelter Setup Crew','Prepare floor mats, partitions, and basic shelter supplies.',12,'medium',ARRAY['disaster_support','logistics'],TRUE,10),
  (10,'Supply Recording','Count and label water, blankets, and relief items.',10,'light',ARRAY['logistics'],FALSE,20);

INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority)
SELECT ev.id, p.title, p.description, p.headcount, p.physical_level, p.required_skills, p.leader_needed, TRUE, p.priority
  FROM _seed_posts p JOIN _seed_events se ON se.event_key=p.event_key JOIN events ev ON ev.title=se.title
 ORDER BY p.event_key, p.priority;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT ev.id, f.code
  FROM _seed_events se JOIN events ev ON ev.title=se.title
 CROSS JOIN LATERAL unnest(se.field_codes) AS f(code);

-- Populate user interests and recurring availability for volunteer dashboard demos.
INSERT INTO user_charity_interests (user_id, field_code)
SELECT u.id, x.code
  FROM _seed_accounts a JOIN users u ON u.phone_hash=a.phone_hash
 CROSS JOIN LATERAL unnest(CASE
      WHEN a.account_kind='admin' THEN ARRAY['logistics']::text[]
      WHEN a.account_kind='coordinator' THEN ARRAY['logistics','disaster_support']::text[]
      WHEN a.skills && ARRAY['teaching','child_care']::text[] THEN ARRAY['teaching','child_care']::text[]
      WHEN a.skills && ARRAY['environment','cleaning']::text[] THEN ARRAY['environment','cleaning']::text[]
      WHEN a.skills && ARRAY['food_distribution','cooking']::text[] THEN ARRAY['food_distribution','cooking']::text[]
      WHEN a.skills && ARRAY['animal_welfare']::text[] THEN ARRAY['animal_welfare']::text[]
      ELSE ARRAY['logistics','other']::text[] END) AS x(code);
INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time)
SELECT u.id, d.weekday, TIME '08:00', TIME '18:00'
  FROM _seed_accounts a JOIN users u ON u.phone_hash=a.phone_hash
 CROSS JOIN generate_series(1,7) AS d(weekday)
 WHERE a.account_kind='volunteer';

-- Move events through the guarded lifecycle: draft -> published -> active.
UPDATE events ev SET status='published'
  FROM _seed_events se WHERE ev.title=se.title AND se.target_status <> 'draft';
UPDATE events ev SET status='active'
  FROM _seed_events se WHERE ev.title=se.title AND se.target_status IN ('active','completed','cancelled');

-- Historical/cancellation events are now active. Give them past starts but keep their
-- ends temporarily in the future so the application/assignment workflow can run.
UPDATE events ev SET
    start_at = now() - CASE se.event_key WHEN 2 THEN interval '2 days 4 hours'
                                    WHEN 3 THEN interval '7 days 4 hours'
                                    WHEN 5 THEN interval '14 days 4 hours'
                                    WHEN 7 THEN interval '21 days 4 hours'
                                    WHEN 9 THEN interval '30 days 4 hours'
                                    WHEN 10 THEN interval '10 days 4 hours' END,
    end_at = now() + interval '2 hours',
    application_deadline = NULL
  FROM _seed_events se WHERE ev.title=se.title AND se.event_key IN (2,3,5,7,9,10);

CREATE TEMP TABLE _seed_applications (
    event_key INTEGER NOT NULL, phone TEXT NOT NULL, post_title TEXT NOT NULL, desired_status TEXT NOT NULL,
    PRIMARY KEY(event_key, phone)
) ON COMMIT DROP;
INSERT INTO _seed_applications VALUES
(2, '+959100000024', 'Flood Supply Packers', 'accepted'),
(2, '+959100000025', 'Flood Supply Packers', 'accepted'),
(2, '+959100000026', 'Flood Supply Packers', 'accepted'),
(2, '+959100000027', 'Flood Supply Packers', 'accepted'),
(3, '+959100000021', 'Lakeside Cleanup Crew', 'accepted'),
(3, '+959100000028', 'Lakeside Cleanup Crew', 'accepted'),
(3, '+959100000029', 'Lakeside Cleanup Crew', 'accepted'),
(3, '+959100000030', 'Lakeside Cleanup Crew', 'accepted'),
(3, '+959100000031', 'Lakeside Cleanup Crew', 'accepted'),
(5, '+959100000022', 'Relief Kit Packers', 'accepted'),
(5, '+959100000032', 'Relief Kit Packers', 'accepted'),
(5, '+959100000033', 'Relief Kit Packers', 'accepted'),
(5, '+959100000034', 'Relief Kit Packers', 'accepted'),
(7, '+959100000023', 'School Materials Sorters', 'accepted'),
(7, '+959100000035', 'School Materials Sorters', 'accepted'),
(9, '+959100000036', 'Trail Maintenance Crew', 'accepted'),
(9, '+959100000037', 'Trail Maintenance Crew', 'accepted'),
(9, '+959100000038', 'Trail Maintenance Crew', 'accepted'),
(10, '+959100000039', 'Shelter Setup Crew', 'accepted'),
(10, '+959100000040', 'Supply Recording', 'pending'),
(1, '+959100000042', 'Mentors', 'accepted'),
(4, '+959100000039', 'First-Aid Assistants', 'accepted'),
(4, '+959100000040', 'Workshop Registration', 'pending'),
(6, '+959100000041', 'Queue and Packing Support', 'accepted'),
(6, '+959100000043', 'Meal Preparation Crew', 'accepted');

-- The auto event accepts Event 1's application in its INSERT trigger and creates its assignment.
-- Other event applications are inserted as pending, then accepted through the update trigger.
INSERT INTO event_applications (event_id, post_id, user_id, source, note)
SELECT ev.id, p.id, u.id, 'browse', 'Seeded demo application.'
  FROM _seed_applications sa
  JOIN _seed_events se ON se.event_key=sa.event_key
  JOIN events ev ON ev.title=se.title
  JOIN event_posts p ON p.event_id=ev.id AND p.title=sa.post_title
  JOIN _seed_accounts a ON a.phone=sa.phone
  JOIN users u ON u.phone_hash=a.phone_hash
 ORDER BY sa.event_key, sa.phone;
UPDATE event_applications ap
   SET status='accepted', decided_by_id=ev.owner_id, decided_at=now()
  FROM _seed_applications sa, _seed_events se, events ev, _seed_accounts a, users u
 WHERE sa.desired_status='accepted' AND sa.event_key <> 1
   AND se.event_key=sa.event_key AND ev.title=se.title
   AND a.phone=sa.phone AND u.phone_hash=a.phone_hash
   AND ap.event_id=ev.id AND ap.user_id=u.id AND ap.status='pending';

-- Acknowledgements for manual/onboarding-gated events (both pending and accepted applicants).
INSERT INTO onboarding_acknowledgments (user_id, event_id, onboarding_version, method)
SELECT u.id, ev.id, ev.onboarding_version, 'app_tick'
  FROM _seed_applications sa JOIN _seed_events se ON se.event_key=sa.event_key
  JOIN events ev ON ev.title=se.title JOIN _seed_accounts a ON a.phone=sa.phone
  JOIN users u ON u.phone_hash=a.phone_hash
 WHERE sa.event_key IN (4,6);

CREATE TEMP TABLE _seed_manual_assignments (event_key INTEGER NOT NULL, phone TEXT NOT NULL, group_code TEXT NOT NULL, is_leader BOOLEAN NOT NULL, PRIMARY KEY(event_key,phone)) ON COMMIT DROP;
INSERT INTO _seed_manual_assignments VALUES
(2, '+959100000024', 'G1', TRUE),
(2, '+959100000025', 'G1', FALSE),
(2, '+959100000026', 'G1', FALSE),
(2, '+959100000027', 'G1', FALSE),
(3, '+959100000021', 'G1', TRUE),
(3, '+959100000028', 'G1', FALSE),
(3, '+959100000029', 'G1', FALSE),
(3, '+959100000030', 'G1', FALSE),
(3, '+959100000031', 'G1', FALSE),
(5, '+959100000022', 'G1', TRUE),
(5, '+959100000032', 'G1', FALSE),
(5, '+959100000033', 'G1', FALSE),
(5, '+959100000034', 'G1', FALSE),
(7, '+959100000023', 'G1', TRUE),
(7, '+959100000035', 'G1', FALSE),
(9, '+959100000036', 'G1', TRUE),
(9, '+959100000037', 'G1', FALSE),
(9, '+959100000038', 'G1', FALSE),
(10, '+959100000039', 'G1', TRUE),
(4, '+959100000039', 'G1', TRUE),
(6, '+959100000041', 'G1', FALSE),
(6, '+959100000043', 'G1', TRUE);
INSERT INTO assignments (event_id, application_id, user_id, post_id, group_code, is_group_leader,
                         assigned_by, assigned_by_user_id, schedule_start, schedule_end, conditions_snapshot)
SELECT ev.id, ap.id, u.id, p.id, ma.group_code, ma.is_leader, 'coordinator', ev.owner_id,
       ev.start_at, ev.end_at, ap.conditions_snapshot
  FROM _seed_manual_assignments ma
  JOIN _seed_events se ON se.event_key=ma.event_key
  JOIN events ev ON ev.title=se.title
  JOIN _seed_accounts a ON a.phone=ma.phone JOIN users u ON u.phone_hash=a.phone_hash
  JOIN event_applications ap ON ap.event_id=ev.id AND ap.user_id=u.id AND ap.status='accepted'
  JOIN event_posts p ON p.event_id=ev.id AND p.title = (SELECT sa.post_title FROM _seed_applications sa WHERE sa.event_key=ma.event_key AND sa.phone=ma.phone)
 ORDER BY ma.event_key, ma.phone;

-- Record historical attendance while those events are still active.
UPDATE attendance a
   SET status='checked_in', method='coordinator_manual', checkin_at=ev.start_at,
       recorded_by_user_id=ev.owner_id, note='Demo attendance recorded by event coordinator.'
  FROM events ev JOIN _seed_events se ON se.title=ev.title
 WHERE a.event_id=ev.id AND se.event_key IN (2,3,5,7,9) AND a.status='expected';

-- Event 6: a genuine database-validated geo check-in inside the Yangon geofence.
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000043')), true);
UPDATE attendance a
   SET status='checked_in', method='geo', checkin_at=now(),
       checkin_latitude=16.774600, checkin_longitude=96.159000, checkin_accuracy_m=10.0,
       checkin_distance_m=0.0, geo_verified=TRUE, note='Demo GPS check-in inside Yangon City Hall geofence.'
  FROM events ev JOIN _seed_events se ON se.title=ev.title
  JOIN _seed_accounts aa ON aa.phone='+959100000043' JOIN users uu ON uu.phone_hash=aa.phone_hash
 WHERE a.event_id=ev.id AND a.user_id=uu.id AND se.event_key=6;
SELECT set_config('app.user_id', (SELECT u.id::text FROM users u JOIN _seed_accounts a ON a.phone_hash=u.phone_hash WHERE a.phone='+959100000013'), true);
UPDATE attendance a SET confirmation_status='confirmed', confirmed_by_user_id=(SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000013')), confirmed_at=now(), confirmation_note='Coordinator confirmed the geo evidence.'
 WHERE a.event_id=(SELECT ev.id FROM events ev JOIN _seed_events se ON se.title=ev.title WHERE se.event_key=6)
   AND a.user_id=(SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000043'));
SELECT set_config('app.user_id', '', true);

-- Keep both geo attempts as evidence: one accepted (inside), one pending review (outside).
INSERT INTO attendance_geo_attempts (event_id, user_id, attendance_id, attempted_at, latitude, longitude,
                                     accuracy_m, captured_at, device_mocked, distance_m, radius_m, result,
                                     review_status, review_note)
SELECT ev.id, u.id, atn.id, now(), 16.774600, 96.159000, 10.0, now(), FALSE, 20.0, 150, 'accepted', 'none',
       'Accepted test location inside the Yangon City Hall geofence.'
  FROM _seed_events se JOIN events ev ON ev.title=se.title
  JOIN _seed_accounts aa ON aa.phone='+959100000043' JOIN users u ON u.phone_hash=aa.phone_hash
  JOIN attendance atn ON atn.event_id=ev.id AND atn.user_id=u.id WHERE se.event_key=6;
INSERT INTO attendance_geo_attempts (event_id, user_id, attendance_id, attempted_at, latitude, longitude,
                                     accuracy_m, captured_at, device_mocked, distance_m, radius_m, result,
                                     review_status, review_note)
SELECT ev.id, u.id, atn.id, now(), 16.778550, 96.158900, 12.0, now(), FALSE, 450.0, 150, 'outside_geofence', 'pending',
       'Demo attempt approximately 450 metres from the event point; review required.'
  FROM _seed_events se JOIN events ev ON ev.title=se.title
  JOIN _seed_accounts aa ON aa.phone='+959100000041' JOIN users u ON u.phone_hash=aa.phone_hash
  JOIN attendance atn ON atn.event_id=ev.id AND atn.user_id=u.id WHERE se.event_key=6;

-- Close out completed/cancelled event schedules. The end is moved into the past only
-- after applications, assignments, and attendance exist, so all workflow guards pass.
UPDATE events ev SET end_at = now() - CASE se.event_key WHEN 2 THEN interval '2 days'
                                                    WHEN 3 THEN interval '7 days'
                                                    WHEN 5 THEN interval '14 days'
                                                    WHEN 7 THEN interval '21 days'
                                                    WHEN 9 THEN interval '30 days'
                                                    WHEN 10 THEN interval '10 days' END
  FROM _seed_events se WHERE ev.title=se.title AND se.event_key IN (2,3,5,7,9,10);
UPDATE assignments a SET schedule_end=ev.end_at
  FROM events ev JOIN _seed_events se ON se.title=ev.title
 WHERE a.event_id=ev.id AND se.event_key IN (2,3,5,7,9,10) AND a.schedule_end IS DISTINCT FROM ev.end_at;
UPDATE events ev SET status='completed'
  FROM _seed_events se WHERE ev.title=se.title AND se.event_key IN (2,3,5,7,9);
UPDATE events ev SET status='cancelled', cancel_reason='Extreme monsoon flood warning'
  FROM _seed_events se WHERE ev.title=se.title AND se.event_key=10;

-- Two-way feedback for completed events. The actor is switched to each real rater so
-- the feedback guard sees the correct submitter identity.
CREATE TEMP TABLE _seed_feedback (event_key INTEGER, rater_phone TEXT, target_phone TEXT, direction TEXT, score INTEGER, tags TEXT[], comment TEXT) ON COMMIT DROP;
INSERT INTO _seed_feedback VALUES
  (2,'+959100000024','+959100000011','volunteer_to_coordinator',5,ARRAY['organized','supportive'],'The relief shift was well coordinated.'),
  (2,'+959100000011','+959100000024','coordinator_to_volunteer',5,ARRAY['punctual','reliable'],'Arrived prepared and supported the team.'),
  (2,'+959100000025',NULL,'volunteer_to_event',4,ARRAY['useful','organized'],'A useful and well-run community response.'),
  (2,'+959100000011','+959100000026','coordinator_to_volunteer',4,ARRAY['teamwork'],'Worked effectively with the distribution team.'),
  (2,'+959100000026','+959100000011','volunteer_to_coordinator',5,ARRAY['communication','supportive'],'Clear instructions throughout the shift.'),
  (3,'+959100000028','+959100000011','volunteer_to_coordinator',2,ARRAY['communication'],'Flagged for admin review: instructions at one station were unclear.'),
  (3,'+959100000011','+959100000029','coordinator_to_volunteer',5,ARRAY['organized','teamwork'],'Helped keep the cleanup teams organized.'),
  (3,'+959100000021','+959100000011','volunteer_to_coordinator',5,ARRAY['supportive','punctual'],'The coordinator kept the activity moving safely.');
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT f.*, ev.id AS event_id, ru.id AS rater_id, tu.id AS target_id
      FROM _seed_feedback f
      JOIN _seed_events se ON se.event_key=f.event_key JOIN events ev ON ev.title=se.title
      JOIN _seed_accounts ra ON ra.phone=f.rater_phone JOIN users ru ON ru.phone_hash=ra.phone_hash
      LEFT JOIN _seed_accounts ta ON ta.phone=f.target_phone LEFT JOIN users tu ON tu.phone_hash=ta.phone_hash
     ORDER BY f.event_key, f.rater_phone, f.direction
  LOOP
    PERFORM set_config('app.user_id', r.rater_id::text, true);
    INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment)
    VALUES (r.event_id, r.rater_id, r.target_id, r.direction, r.score, r.tags, r.comment);
  END LOOP;
  PERFORM set_config('app.user_id', '', true);
END $$;

-- Admin moderation: 2 warnings + 2 timed blocks + 1 hidden feedback = 5 rows.
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')), true);
INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason)
SELECT (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')), u.id, 'user_warning',
       'Repeated unexcused absence on registered shifts'
  FROM _seed_accounts a JOIN users u ON u.phone_hash=a.phone_hash WHERE a.phone IN ('+959100000052','+959100000053');
INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason, expires_at)
SELECT (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')), u.id, 'user_block',
       'Repeated serious attendance policy violations; demo 30-day block.', now() + interval '30 days'
  FROM _seed_accounts a JOIN users u ON u.phone_hash=a.phone_hash WHERE a.phone IN ('+959100000054','+959100000055');
INSERT INTO moderation_actions (admin_user_id, feedback_id, action_type, reason)
SELECT (SELECT id FROM users WHERE phone_hash=(SELECT phone_hash FROM _seed_accounts WHERE phone='+959100000001')), f.id, 'feedback_hide',
       'Flagged for review due to disputed remarks'
  FROM feedback f JOIN events ev ON ev.id=f.event_id
  JOIN _seed_events se ON se.title=ev.title JOIN _seed_accounts ra ON ra.phone='+959100000028'
  JOIN users ru ON ru.phone_hash=ra.phone_hash
 WHERE se.event_key=3 AND f.rater_user_id=ru.id AND f.direction='volunteer_to_coordinator';
SELECT set_config('app.user_id', '', true);

-- Seed QR tokens for the published/active portal demonstrations.
INSERT INTO qr_tokens (event_id, created_by_id, purpose, token_hash, max_uses, expires_at)
SELECT ev.id, ev.owner_id, x.purpose, md5('yangon-demo:' || se.event_key::text || ':' || x.purpose) || md5('yangon-demo:' || se.event_key::text || ':' || x.purpose || ':second'),
       100, now() + interval '30 days'
  FROM _seed_events se JOIN events ev ON ev.title=se.title
 CROSS JOIN LATERAL (VALUES ('join_event'), ('walkin_registration')) AS x(purpose)
 WHERE (se.event_key IN (1,4,6) AND x.purpose <> 'walkin_registration') OR (se.event_key=4 AND x.purpose='walkin_registration');

-- Restore system actor context for any subsequent SQL in the same session.
SELECT set_config('app.user_id', '', true);
SELECT set_config('app.ip', '127.0.0.1', true);

-- Final diagnostic: expected counts are 42 users, 2 admins, 5 approved + 3 pending
-- coordinators, 10 events (4 future / 6 past), 20 posts, 25 applications,
-- 23 assignments/attendance rows, 2 geo attempts, 8 feedback rows, 5 moderation rows.
SELECT
    (SELECT count(*) FROM users) AS total_users,
    (SELECT count(*) FROM users WHERE is_admin) AS total_admins,
    (SELECT count(*) FROM coordinator_profiles WHERE status='approved') AS approved_coordinators,
    (SELECT count(*) FROM coordinator_profiles WHERE status='pending') AS pending_coordinators,
    (SELECT count(*) FROM events) AS total_events,
    (SELECT count(*) FROM events WHERE start_at > now()) AS future_events,
    (SELECT count(*) FROM events WHERE start_at <= now()) AS past_events,
    (SELECT count(*) FROM event_posts) AS total_posts,
    (SELECT count(*) FROM event_applications) AS total_applications,
    (SELECT count(*) FROM assignments) AS total_assignments,
    (SELECT count(*) FROM attendance) AS total_attendance,
    (SELECT count(*) FROM attendance_geo_attempts) AS total_geo_attempts,
    (SELECT count(*) FROM feedback) AS total_feedback,
    (SELECT count(*) FROM moderation_actions) AS total_moderation_actions,
    (SELECT count(*) FROM authtoken_token) AS total_drf_tokens;

-- Additional state/geo sanity check (all event points must fall inside Yangon city bounds).
SELECT title, status, start_at, end_at, latitude, longitude, geo_radius_m,
       latitude BETWEEN 16.70 AND 16.95 AND longitude BETWEEN 96.05 AND 96.25 AS within_yangon_bounds
  FROM events ORDER BY id;

COMMIT;
