# Mobile Frontend UX QA & Manual Verification Guide (Phase F10)
**Volunteer HR Management Mobile App — React Native TypeScript (Android)**
**Document Version:** 1.0.0 (Phase F10 Final Stabilization)  
**Target Platform:** Android (API Level 24+ / Minimum SDK 24, Target SDK 35)  
**Execution Environment:** Native Android Emulator / Physical Android Device  

---

## 1. Overview & Verification Objective

Phase F10 is the manual regression QA and stabilization phase of the Mobile Frontend UX Fix Plan (`v0_8_1_mobile_frontend_ux_fix_plan_antigravity.md`). The mobile application is built using React Native `0.88.1`, React `19.3.0`, and TypeScript `6.0.3` targeting native Android (Gradle 9.4.1 / Android Gradle Plugin).

This document serves as the master testing guide, acceptance checklist, and defect logging workbook for the manual QA testing on an Android device or emulator.

### Build & Compilation Status Summary

All automated compilation, static analysis, and test harness checks pass with zero errors:

| Check / Tool | Target | Result | Details |
| :--- | :--- | :--- | :--- |
| **TypeScript Compiler** | `npx tsc --noEmit` | **PASS (Exit 0)** | 0 type errors; strict typing with 0 `any` |
| **ESLint** | `npm run lint` | **PASS (Exit 0)** | 0 lint errors, 0 warnings across entire repo |
| **Jest Test Harness** | `npm test` | **PASS (Exit 0)** | 13 test suites passed, 192 unit/component tests passed |
| **Metro JS Bundler** | `npx react-native bundle` | **PASS (Exit 0)** | Full production bundle packaged with 23 assets |
| **Android Java/Kotlin** | `.\gradlew.bat compileDebugSources` | **PASS (Exit 0)** | 88 actionable tasks; 0 compile errors |
| **Android APK Build** | `.\gradlew.bat assembleDebug` | **PASS (Exit 0)** | Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` |

---

## 2. Environment Setup & Launch Commands

### Prerequisites
- **JDK:** OpenJDK 21 (installed: Java 21.0.7 LTS, `JAVA_HOME=C:\Program Files\Java\jdk-21`)
- **Android SDK:** Platform SDK 35, Build-Tools 35.0.0, Platform-Tools (`adb`) (`ANDROID_HOME=C:\Users\USER\AppData\Local\Android\Sdk`)
- **Node.js:** Node >= 22.11.0, npm >= 10.x

### Step-by-Step Device Run Commands

#### Step 2.1: Start Metro Development Bundler
Open Terminal 1 in the `mobile` workspace directory:
```bash
cd c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\mobile
npm start
```
*Metro will boot on port 8081.*

#### Step 2.2: Launch App on Connected Android Device or Emulator
Connect an Android physical device via USB with USB Debugging enabled, or launch an Android Virtual Device (AVD) from Android Studio.

Verify device connection:
```bash
adb devices
```
*Expected: At least one device listed in `device` state.*

In Terminal 2, install and launch the debug build:
```bash
cd c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\mobile
npm run android
```
*Or directly via Gradle:*
```bash
cd mobile/android
.\gradlew.bat installDebug
adb shell am start -n com.mobile/com.mobile.MainActivity
```

#### Step 2.3: Offline / Standalone APK Installation (Optional)
If installing the pre-built debug APK directly onto a device:
```bash
adb install -r c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 3. Detailed Manual Test Matrix & Execution Steps

### Test Suite 1: Volunteer Dashboard — Confirmed / Completed Event Cards & Cancellation
- **Screen:** Volunteer Dashboard (`DashboardScreen`)
- **Preconditions:** Logged in as standard Volunteer (default mock user: `Daw Mya Mya`, `usr-vol-001`).

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 1.1 | Open app to Dashboard | "Upcoming Shifts & Events" section displays confirmed/assigned event cards (e.g. "Community Kitchen Food Prep"). "Completed History" displays previous shifts. | [ ] | |
| 1.2 | Locate an upcoming confirmed event card | Card displays event title, date/time in MMT, location, role name, and status badge `CONFIRMED`. | [ ] | |
| 1.3 | Tap "Cancel Attendance" button | Confirmation dialog/modal appears asking for confirmation and cancellation reason. | [ ] | |
| 1.4 | Enter reason and confirm cancellation | Feedback banner appears with `"Demo only — cancellation recorded locally"`. Card moves from confirmed to cancelled or updates status badge to `CANCELLED`. | [ ] | |
| 1.5 | Tap on an event card to view details | Navigates to `EventDetailScreen`. | [ ] | |
| 1.6 | Tap Android hardware Back button or header Back (`←`) | Navigation pops back directly to Volunteer Dashboard without reloading glitches. | [ ] | |

---

### Test Suite 2: Event Discovery — Search, Filter & Navigation State Preservation
- **Screen:** Event Discovery (`EventListScreen`)
- **Preconditions:** Open via drawer or bottom tab.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 2.1 | View Event Discovery list | List displays available events with titles, dates, locations, category badges, and required volunteer counts. | [ ] | |
| 2.2 | Type search query in search bar (e.g. `"flood"` or `"food"`) | Input displays search glyph `⌕`. Results filter immediately in real time to matching items. Clear button `✕` appears. | [ ] | |
| 2.3 | Tap category chip (e.g. `"Disaster Relief"` or `"Healthcare"`) | Chip highlights with active primary color. List updates to display only matching charity sector events. | [ ] | |
| 2.4 | Tap an event card to navigate to `EventDetailScreen` | Detailed view opens showing banner, description, shifts, coordinator details, and action buttons. | [ ] | |
| 2.5 | Tap header Back button (`←`) or press Android hardware Back | Screen pops back to `EventListScreen`. Search query `"flood"` and active category chip remain active and list remains filtered. | [ ] | |
| 2.6 | Tap clear button `✕` on search bar | Search text clears; list resets to reflect category filter only. | [ ] | |

---

### Test Suite 3: Application Status -> Event Detail -> Back Navigation
- **Screen:** Application Status (`ApplicationStatusScreen`)
- **Preconditions:** User has submitted applications in mock state.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 3.1 | Open navigation drawer (swipe right or tap `☰`) and tap "Application Status" | `ApplicationStatusScreen` displays active and historic volunteer applications with status badges (`PENDING`, `APPROVED`, `REJECTED`). | [ ] | |
| 3.2 | Tap on an application item | Navigates to `EventDetailScreen` for the corresponding event. | [ ] | |
| 3.3 | Tap header Back button (`←`) or Android hardware Back button | Returns directly to `ApplicationStatusScreen` (not to Dashboard or Home). | [ ] | |

---

### Test Suite 4: My Assignments -> Event Detail -> Back Navigation
- **Screen:** My Assignments (`MyAssignmentsScreen`)
- **Preconditions:** User has confirmed shift assignments.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 4.1 | Open navigation drawer and select "My Assignments" | Screen shows scheduled shifts, role titles, reporting instructions, and hours. | [ ] | |
| 4.2 | Tap on an assigned event item | Navigates to `EventDetailScreen`. | [ ] | |
| 4.3 | Tap header Back button (`←`) or Android hardware Back button | Returns directly to `MyAssignmentsScreen`. | [ ] | |

---

### Test Suite 5: Filter Modal Select / Deselect / Clear All / Apply
- **Screen:** Event Discovery Filter Modal (`FilterModal` in `EventListScreen`)

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 5.1 | On `EventListScreen`, tap "Filter" action button (`▼ Filter`) | Filter bottom sheet / modal slides up smoothly. | [ ] | |
| 5.2 | Tap multiple charity categories (e.g. "Education", "Environment") | Selected chips show highlighted background and border. | [ ] | |
| 5.3 | Toggle status options (e.g. "Open shifts only") | Toggle/chip state updates visually. | [ ] | |
| 5.4 | Tap "Clear All" button | All category and status selections reset to unselected defaults immediately. | [ ] | |
| 5.5 | Select "Healthcare", then tap "Apply Filters" | Modal closes. Event list refreshes with healthcare events. Filter button indicates active filter count. | [ ] | |

---

### Test Suite 6: Profile Summary & Edit; Coordinator Eligibility Disabled States
- **Screens:** `ProfileScreen`, `ProfileEditScreen`, `VerificationCoordinatorStatusScreen`

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 6.1 | Open drawer -> tap "Profile" | `ProfileScreen` displays concise Volunteer Summary Card: avatar initials, display name, public fields, and aggregate star rating or "No ratings yet". | [ ] | |
| 6.2 | Tap Edit button (`✎`) in header or card | Navigates to `ProfileEditScreen`. | [ ] | |
| 6.3 | Test privileged fields | Account status, verification tier, coordinator status, and email are presented as read-only badges/text with an informational notice box. They cannot be edited. | [ ] | |
| 6.4 | Enter emergency contact name with empty phone, tap "Save" | Validation error message appears: emergency contact name and phone must both be provided or both empty. | [ ] | |
| 6.5 | Enter both emergency contact name and phone number | Validation error clears. | [ ] | |
| 6.6 | Add skill with irregular casing/spacing (e.g. `"  First-Aid  "`), tap "Add" | Skill chip is normalized (trimmed, lowercased, deduplicated). | [ ] | |
| 6.7 | Tap "Save Profile Changes" | Banner displays `"Profile saved in local mock state (Demo only — updated locally)"`. | [ ] | |
| 6.8 | Open drawer -> "Verification & Status" | Screen displays Tier 1 verification status, visual upload placeholders (`"Visual Upload Slot (Demo Preview)"`), and Coordinator Eligibility Card. | [ ] | |
| 6.9 | Inspect Coordinator Eligibility Card | Card displays 3 check criteria: (1) Verified Account, (2) >= 5 Completed Shifts, (3) >= 4.0 Rating. If any check is not met or rating is null, "Apply for Coordinator" button is disabled with explanatory message. | [ ] | |

---

### Test Suite 7: Settings Screen vs. Development Drawer Switcher
- **Screens:** `SettingsScreen`, Navigation Drawer

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 7.1 | Open drawer -> tap "Settings" | `SettingsScreen` opens. | [ ] | |
| 7.2 | Inspect Settings options | Contains Appearance (Theme Mode), Push Notifications toggle, Privacy Policy, and Version string. **NO role switch or coordinator toggle exists in Settings.** | [ ] | |
| 7.3 | Open navigation drawer and look at the bottom section | Development Role Switcher is visible at the bottom of the drawer labeled with prominent warning: `"DEV ONLY: Mock Identity Switcher (Testing only)"`. | [ ] | |
| 7.4 | Switch identity from Volunteer to Coordinator in drawer switcher | Active identity updates in mock memory. Navigation drawer displays Coordinator management options (Operations, Create Event). | [ ] | |

---

### Test Suite 8: Availability Manager Layout
- **Screen:** Availability (`AvailabilityScreen`)

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 8.1 | Open drawer -> tap "Availability" | `AvailabilityScreen` loads without verbose conflict warnings. Displays "Weekly Recurring Availability" and "Specific Date Exceptions" sections. | [ ] | |
| 8.2 | Tap "Add Weekly Rule" | Modal opens with day-of-week picker, start time, end time, and timezone note (`MMT - Myanmar Time`). | [ ] | |
| 8.3 | Enter invalid times (start time after end time), tap "Save" | Validation error appears adjacent to the time input field. | [ ] | |
| 8.4 | Enter valid rule (e.g. Saturday 09:00 - 13:00) and save | Rule card appears under weekly schedule. Demo feedback banner confirms local save. | [ ] | |
| 8.5 | Tap "Add Date Exception", enter date `2026-12-25`, set Available to Off | Exception card appears under Date Exceptions list. | [ ] | |
| 8.6 | Tap delete icon on a rule | Rule is deleted from local mock state. | [ ] | |

---

### Test Suite 9: Coordinator UI Capability & Button Placement / Visibility
- **Screens:** `CoordinatorOperationsDashboardScreen`, `CreateEventWizardScreen`
- **Preconditions:** Active mock user switched to Coordinator (`Ko Zaw Min`, `usr-coord-002`).

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 9.1 | Switch to Coordinator in dev drawer switcher | App updates active user context and default coordinator repository identity. | [ ] | |
| 9.2 | Open drawer -> tap "Coordinator Dashboard" | Operations dashboard displays summary metrics (Pending Applications, Active Events, Assigned Shifts). | [ ] | |
| 9.3 | Inspect "Create Event" button | Button is visible and positioned within comfortable thumb reach (floating action button or header action). | [ ] | |
| 9.4 | Switch back to standard Volunteer (`Daw Mya Mya`) | Coordinator dashboard and "Create Event" button are completely hidden from Volunteer navigation. | [ ] | |

---

### Test Suite 10: Event Wizard Calendar Submenu & Myanmar Time Validation
- **Screen:** `CreateEventWizardScreen`
- **Preconditions:** Logged in as Coordinator.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 10.1 | Open "Create Event" wizard | Wizard step 1 (Basic Info) opens. Enter title, description, category, and skills. Tap "Next". | [ ] | |
| 10.2 | Wizard step 2 (Date, Time & Shifts) | Calendar submenu / date picker opens. Time fields explicitly indicate `Myanmar Time (MMT / UTC+6:30)`. | [ ] | |
| 10.3 | Enter end time earlier than start time | Field validation error indicates end time must be after start time in Myanmar Time. | [ ] | |
| 10.4 | Step 3 (Location & Capacity) | Fields include Address, Latitude, Longitude, and Geo Radius in meters (`geoRadiusM`). Capacity and volunteer limit validation enforced. | [ ] | |
| 10.5 | Step 4 (Review & Submit) | Summary card displays all event details, time in MMT, and shift breakdown. Tap "Publish Event". | [ ] | |
| 10.6 | Verify post-publish feedback | Banner confirms `"Event created in local mock state (Demo only — not published to server)"`. | [ ] | |

---

### Test Suite 11: Small-Screen Layout, Keyboard Overlap & Android Back Button
- **Scope:** Layout responsiveness, virtual keyboard interaction, hardware back navigation.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 11.1 | Open app on small screen device / 360dp width emulator | Text does not clip or overflow container boundaries. Action buttons remain visible and tappable. | [ ] | |
| 11.2 | Focus input in `ProfileEditScreen` (e.g. Home Area or Emergency Contact) | Virtual keyboard slides up. `KeyboardAvoidingView` / scroll view scrolls input field above keyboard. Active input and Save button are not hidden. | [ ] | |
| 11.3 | Focus text input in `CreateEventWizardScreen` | Scroll adjustment keeps input field visible without jumpy layout flickering. | [ ] | |
| 11.4 | From nested screen (`ProfileEdit`), press Android hardware Back key | Screen pops back to `ProfileScreen`. | [ ] | |
| 11.5 | From `EventDetailScreen` opened from `EventListScreen`, press hardware Back | Returns to `EventListScreen` preserving filter state. | [ ] | |
| 11.6 | From root screen (`Dashboard`), press hardware Back key | Android standard task exit or back toast (does not crash or show unhandled exception). | [ ] | |

---

### Test Suite 12: Drawer Gesture & Light / Dark / System Theme Persistence
- **Scope:** Gesture navigation, color theme rendering, cold-start persistence.

| Step | Action | Expected Behavior | Pass/Fail | Notes |
| :---: | :--- | :--- | :---: | :--- |
| 12.1 | Swipe from left edge of screen | Navigation drawer opens smoothly via gesture. | [ ] | |
| 12.2 | Tap outside drawer or swipe left | Navigation drawer closes smoothly. | [ ] | |
| 12.3 | Open Settings -> select "Dark Mode" | Theme changes immediately to dark palette (dark background, light text, high contrast borders). | [ ] | |
| 12.4 | Select "Light Mode" | Theme changes immediately to light palette. | [ ] | |
| 12.5 | Select "System" | App follows device appearance. Toggle Android Quick Settings Dark Theme: app switches palette dynamically. | [ ] | |
| 12.6 | Set preference to "Dark", force-close app from Recents, and re-launch | App launches directly into Dark Theme with **zero white flash** (preference pre-loaded before main view render). | [ ] | |

---

## 4. Android Device Information & Defect Log

### Test Device Record
Fill in the details of the device or emulator used during manual testing:

```text
Tester Name:        ________________________________________
Test Date:          ________________________________________
Device Make/Model:  ________________________________________ (e.g. Google Pixel 8 / Samsung Galaxy A54)
Device Type:        [ ] Physical Device    [ ] Android Emulator (AVD)
Android Version:    ________________________________________ (e.g. Android 14.0)
Android API Level:  ________________________________________ (e.g. API 34)
Screen Resolution:  ________________________________________ (e.g. 1080 x 2400)
Screen Density/DPI: ________________________________________ (e.g. 420 dpi, xxhdpi)
```

### Defect Logging Table

| Defect # | Test ID | Screen / Component | Description of Reproducible Issue | Severity (Low/Med/High) | Screenshot Ref | Fix Status |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| D-01 | | | | | | |
| D-02 | | | | | | |
| D-03 | | | | | | |
| D-04 | | | | | | |

---

## 5. Architectural Non-Regression Commitments

Throughout this testing phase, the following core constraints are maintained:
1. **No Backend or SQL Modifications:** PostgreSQL schema, migrations, and backend Django prototype are untouched.
2. **No Real BFF Calls or Credentials:** Mock repositories provide typed, deterministic in-memory state labeled `"Demo only"`.
3. **Strict TypeScript:** Explicit interfaces and types; zero usage of `any`.
4. **Android Native Configuration Preserved:** Gradle scripts, manifests, and native Java/Kotlin files remain standard and untouched.
5. **No Automatic Progression:** Execution stops here at Phase F10 to allow comprehensive manual testing.
