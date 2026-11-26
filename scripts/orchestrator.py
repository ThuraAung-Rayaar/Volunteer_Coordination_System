"""
orchestrator.py

Interactive Console Orchestrator for the Volunteer HR Management System (VCS).

Capabilities:
- Live system & process dashboard (DI config, PostgreSQL, Django server, Metro bundler, ADB devices)
- Start / Stop / Restart / Log-Tail for:
  1. Django Backend Server (`backend/manage.py runserver 0.0.0.0:8000`)
  2. React Native Metro Bundler (`mobile/`: `npx react-native start`)
  3. Full Stack Launch (Backend + Metro + ADB reverse + Android launch)
- Android Studio Virtual Device (AVD) & USB Device Manager:
  - Detect running emulators vs USB devices (`adb devices -l`) and warn on `unauthorized` / `offline`
  - List and boot Android Studio AVDs (`emulator -avd <name>`)
  - Guided console walkthrough for Developer Options, USB Debugging, and OEM permissions
  - Open Android Developer Options or App Settings directly on connected devices via ADB
  - Restart ADB server to trigger RSA USB debugging authorization prompt
  - Configure `adb reverse tcp:8081 tcp:8081` & `adb reverse tcp:8000 tcp:8000`
  - Grant Android runtime permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`) to `com.mobile`
  - Build & run Android app (`npx react-native run-android`) and trigger RN Reload / Dev Menu
- Direct Console Command Runner inside the project `.venv` + Setup/Status/DB shortcuts.
"""
from __future__ import annotations

import argparse
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any

REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
MOBILE_DIR = REPO_ROOT / "mobile"
LOGS_DIR = REPO_ROOT / ".local" / "logs"
ANDROID_APP_ID = "com.mobile"
BACKEND_PORT = 8000
METRO_PORT = 8081

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@dataclass
class ManagedProcess:
    name: str
    proc: subprocess.Popen[Any]
    log_path: Path
    log_handle: IO[str] | None
    cmd_display: str


@dataclass
class AdbDevice:
    serial: str
    state: str  # device | unauthorized | offline | etc.
    is_emulator: bool
    model: str
    raw_line: str


def _find_venv_python() -> str:
    for cand in (
        REPO_ROOT / ".venv" / "Scripts" / "python.exe",
        REPO_ROOT / ".venv" / "bin" / "python",
    ):
        if cand.exists():
            return str(cand)
    return sys.executable


def _find_android_sdk() -> Path | None:
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        val = os.environ.get(var, "").strip()
        if val and Path(val).exists():
            return Path(val)
    local_app = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app:
        cand = Path(local_app) / "Android" / "Sdk"
        if cand.exists():
            return cand
    home = Path.home()
    for cand in (home / "AppData" / "Local" / "Android" / "Sdk", home / "Android" / "Sdk"):
        if cand.exists():
            return cand
    return None


def _find_adb() -> str | None:
    adb = shutil.which("adb")
    if adb:
        return adb
    sdk = _find_android_sdk()
    if sdk:
        cand = sdk / "platform-tools" / ("adb.exe" if platform.system() == "Windows" else "adb")
        if cand.exists():
            return str(cand)
    return None


def _find_emulator_bin() -> str | None:
    emu = shutil.which("emulator")
    if emu:
        return emu
    sdk = _find_android_sdk()
    if sdk:
        cand = sdk / "emulator" / ("emulator.exe" if platform.system() == "Windows" else "emulator")
        if cand.exists():
            return str(cand)
    return None


def _tcp_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _http_ok(url: str, timeout: float = 1.5) -> tuple[bool, str]:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return (200 <= resp.status < 400), f"HTTP {resp.status}"
    except urllib.error.HTTPError as exc:
        return (200 <= exc.code < 500), f"HTTP {exc.code}"
    except Exception as exc:
        return False, str(exc)


def _base_env() -> dict[str, str]:
    env = os.environ.copy()
    di_path = REPO_ROOT / "di_config.local.json"
    if di_path.exists():
        env["VCS_DI_CONFIG_PATH"] = str(di_path)
    env.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    return env


def _run_capture(cmd: list[str], cwd: Path = REPO_ROOT, timeout: int = 15) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            env=_base_env(),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, "", str(exc)


def list_adb_devices() -> list[AdbDevice]:
    adb = _find_adb()
    if not adb:
        return []
    rc, out, _ = _run_capture([adb, "devices", "-l"], timeout=8)
    if rc != 0:
        return []
    devices: list[AdbDevice] = []
    for line in out.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        serial, state = parts[0], parts[1]
        model_match = re.search(r"model:(\S+)", line)
        model = model_match.group(1) if model_match else ("Android Emulator" if serial.startswith("emulator-") else "USB Device")
        devices.append(
            AdbDevice(
                serial=serial,
                state=state,
                is_emulator=serial.startswith("emulator-"),
                model=model,
                raw_line=line,
            )
        )
    return devices


def list_avds() -> list[str]:
    emu = _find_emulator_bin()
    if not emu:
        return []
    rc, out, _ = _run_capture([emu, "-list-avds"], timeout=8)
    if rc != 0 or not out:
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


class StackOrchestrator:
    def __init__(self) -> None:
        self.processes: dict[str, ManagedProcess] = {}
        LOGS_DIR.mkdir(parents=True, exist_ok=True)

    def is_running(self, key: str) -> bool:
        mp = self.processes.get(key)
        return mp is not None and mp.proc.poll() is None

    def start_process(
        self,
        key: str,
        name: str,
        cmd: list[str],
        cwd: Path,
        new_console: bool = False,
    ) -> None:
        if self.is_running(key):
            print(f"[INFO] {name} is already running (PID {self.processes[key].proc.pid}).")
            return

        log_path = LOGS_DIR / f"{key}.log"
        env = _base_env()
        creationflags = 0
        if new_console and platform.system() == "Windows":
            creationflags = subprocess.CREATE_NEW_CONSOLE
            log_handle = None
            proc = subprocess.Popen(cmd, cwd=str(cwd), env=env, creationflags=creationflags)
        else:
            log_handle = open(log_path, "w", encoding="utf-8", buffering=1)
            if platform.system() == "Windows":
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
            proc = subprocess.Popen(
                cmd,
                cwd=str(cwd),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=creationflags,
            )

        self.processes[key] = ManagedProcess(
            name=name,
            proc=proc,
            log_path=log_path,
            log_handle=log_handle,
            cmd_display=" ".join(cmd),
        )
        print(f"[STARTED] {name} (PID {proc.pid})")
        if not new_console:
            print(f"          Logs: {log_path}")

    def stop_process(self, key: str) -> None:
        mp = self.processes.get(key)
        if not mp:
            print(f"[INFO] {key} is not managed by this orchestrator session.")
            return
        if mp.proc.poll() is None:
            print(f"[STOPPING] {mp.name} (PID {mp.proc.pid})...")
            mp.proc.terminate()
            try:
                mp.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                mp.proc.kill()
        if mp.log_handle:
            try:
                mp.log_handle.close()
            except OSError:
                pass
        del self.processes[key]
        print(f"[STOPPED] {mp.name}.")

    def stop_all(self) -> None:
        for key in list(self.processes.keys()):
            self.stop_process(key)

    def start_backend(self, new_console: bool = False) -> None:
        if _tcp_open("127.0.0.1", BACKEND_PORT) and not self.is_running("backend"):
            print(f"[WARN] Port {BACKEND_PORT} is already in use by an external process.")
            return
        py = _find_venv_python()
        cmd = [py, str(BACKEND_DIR / "manage.py"), "runserver", f"0.0.0.0:{BACKEND_PORT}"]
        self.start_process("backend", "Django BFF Server", cmd, REPO_ROOT, new_console=new_console)
        time.sleep(1.5)
        ok, detail = _http_ok(f"http://127.0.0.1:{BACKEND_PORT}/api/v1/charity-fields/")
        if ok:
            print(f"[OK] Backend health check passed ({detail}): http://127.0.0.1:{BACKEND_PORT}/api/docs/")
        else:
            print(f"[INFO] Backend is warming up (check logs if needed): {detail}")

    def start_metro(self, new_console: bool = False) -> None:
        if _tcp_open("127.0.0.1", METRO_PORT) and not self.is_running("metro"):
            print(f"[WARN] Port {METRO_PORT} is already in use by an external Metro instance.")
            return
        npx = shutil.which("npx.cmd" if platform.system() == "Windows" else "npx") or "npx"
        cmd = [npx, "react-native", "start"]
        self.start_process("metro", "React Native Metro Bundler", cmd, MOBILE_DIR, new_console=new_console)
        time.sleep(2.0)
        if _tcp_open("127.0.0.1", METRO_PORT):
            print(f"[OK] Metro Bundler listening on port {METRO_PORT}.")
        else:
            print(f"[INFO] Metro Bundler is initializing (check {LOGS_DIR / 'metro.log'}).")

    def tail_log(self, key: str, lines: int = 40) -> None:
        log_path = LOGS_DIR / f"{key}.log"
        if not log_path.exists():
            print(f"[INFO] No log file yet at {log_path}.")
            return
        content = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        print(f"--- Last {min(lines, len(content))} lines of {log_path.name} ---")
        for ln in content[-lines:]:
            print(ln)
        print("-" * 60)

    def print_dashboard(self) -> None:
        import config_di
        c = config_di.get_config_container(force_reload=True)
        di_exists = (REPO_ROOT / "di_config.local.json").exists()
        pg_up = _tcp_open(c.database.host, int(c.database.port))
        be_up = _tcp_open("127.0.0.1", BACKEND_PORT)
        metro_up = _tcp_open("127.0.0.1", METRO_PORT)
        devices = list_adb_devices()
        avds = list_avds()

        print("\n" + "=" * 78)
        print("VOLUNTEER HR MANAGEMENT SYSTEM — CONSOLE ORCHESTRATOR")
        print("=" * 78)
        print(f"DI Config   : {'di_config.local.json (ACTIVE)' if di_exists else 'MISSING (run setup_di_config.py)'} | AI={c.ai.provider}:{c.ai.model}")
        print(f"PostgreSQL  : {'UP' if pg_up else 'DOWN'} ({c.database.user}@{c.database.host}:{c.database.port}/{c.database.name})")
        print(f"Django API  : {'RUNNING' if be_up else 'STOPPED'} (port {BACKEND_PORT}, managed={self.is_running('backend')})")
        print(f"Metro JS    : {'RUNNING' if metro_up else 'STOPPED'} (port {METRO_PORT}, managed={self.is_running('metro')})")
        if devices:
            dev_summary = ", ".join(
                f"{d.serial}[{'AVD' if d.is_emulator else 'USB'}:{d.state}]" for d in devices
            )
            print(f"ADB Targets : {dev_summary}")
        else:
            print(f"ADB Targets : NONE CONNECTED (Available AVDs: {', '.join(avds) if avds else 'none'})")
        print("-" * 78)

    # ------------------------------------------------------------------
    # Android Device / AVD / Permission Helpers
    # ------------------------------------------------------------------
    def show_android_developer_guide(self) -> None:
        print("\n" + "=" * 78)
        print("ANDROID DEVELOPER OPTIONS, USB DEBUGGING & CONNECTION GUIDE")
        print("=" * 78)
        print(
            """
1. ENABLE DEVELOPER OPTIONS ON ANDROID PHONE:
   - Open Settings -> About phone (or Software information).
   - Tap "Build number" 7 times (on Xiaomi/HyperOS tap "OS version" / "MIUI version").
   - Enter your phone PIN/pattern when prompted -> "You are now a developer!".

2. ENABLE USB DEBUGGING & PERMISSIONS:
   - Open Settings -> System (or Additional settings) -> Developer options.
   - Turn ON:
       * Developer options
       * USB debugging
   - Vendor-specific requirements (CRITICAL for Xiaomi / Oppo / Realme / Vivo):
       * Xiaomi / Redmi / POCO : Turn ON "USB debugging (Security settings)" AND
         "Install via USB" (required for `adb shell pm grant` and APK install!).
       * Oppo / Realme / OnePlus: Turn ON "Disable Permission Monitoring".
       * Samsung / Pixel       : Change USB notification from "Charging only" to
         "Transferring files (MTP)".

3. AUTHORIZE THIS PC (RSA FINGERPRINT):
   - Plug in USB data cable (avoid charge-only cables).
   - Watch your phone screen for "Allow USB debugging?" -> check
     "Always allow from this computer" -> tap "Allow".
   - If the device shows as [unauthorized] in ADB, run Option [8] (Restart ADB Server)
     in this menu and unlock your phone screen to see the prompt again.

4. NETWORK HOST PRESET IN MOBILE APP SETTINGS:
   - Physical USB Device : Run `adb reverse` (Option [9]) and set Mobile API Host
     Preset to USB Device (`http://localhost:8000`).
   - Android Emulator    : Set Mobile API Host Preset to Android Emulator
     (`http://10.0.2.2:8000`) or run `adb reverse` (`http://localhost:8000`).
"""
        )

    def pick_target_device(self, allow_unauthorized: bool = False) -> AdbDevice | None:
        devices = list_adb_devices()
        if not allow_unauthorized:
            devices = [d for d in devices if d.state == "device"]
        if not devices:
            print("[WARN] No authorized Android device or running emulator found.")
            print("       Tip: Start an AVD (Option 6) or connect USB phone & check Developer Guide (Option 7).")
            return None
        if len(devices) == 1:
            return devices[0]
        print("Select target Android device:")
        for idx, d in enumerate(devices, start=1):
            kind = "AVD Emulator" if d.is_emulator else "USB Physical"
            print(f"  [{idx}] {d.serial} ({kind}, state={d.state}, model={d.model})")
        raw = input("Choice [1]: ").strip() or "1"
        try:
            choice = int(raw)
            if 1 <= choice <= len(devices):
                return devices[choice - 1]
        except ValueError:
            pass
        print("[ERROR] Invalid device selection.")
        return None

    def launch_avd(self) -> None:
        emu = _find_emulator_bin()
        if not emu:
            print("[ERROR] Android emulator binary not found. Check ANDROID_HOME / Android Studio SDK.")
            return
        avds = list_avds()
        if not avds:
            print("[WARN] No Android Virtual Devices (AVDs) configured. Create one in Android Studio -> Device Manager.")
            return
        print("Available Android Virtual Devices (AVDs):")
        for idx, name in enumerate(avds, start=1):
            print(f"  [{idx}] {name}")
        raw = input("Select AVD to boot [1]: ").strip() or "1"
        try:
            selected = avds[int(raw) - 1]
        except (ValueError, IndexError):
            print("[ERROR] Invalid selection.")
            return
        print(f"[BOOTING] Starting Android Virtual Device '{selected}'...")
        subprocess.Popen(
            [emu, "-avd", selected],
            cwd=str(REPO_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_ans = input("Wait for emulator to finish booting and apply adb reverse? [Y/n]: ").strip().lower()
        if wait_ans in ("", "y", "yes"):
            adb = _find_adb()
            if adb:
                print("[WAIT] Waiting for ADB device connection (timeout 90s)...")
                _run_capture([adb, "wait-for-device"], timeout=90)
                for _ in range(45):
                    rc, boot_out, _ = _run_capture([adb, "shell", "getprop", "sys.boot_completed"], timeout=5)
                    if rc == 0 and boot_out.strip() == "1":
                        print("[OK] Emulator booted! Applying adb reverse...")
                        self.setup_adb_reverse()
                        return
                    time.sleep(2)
                print("[INFO] Emulator connected to ADB; still finishing Android boot.")

    def restart_adb_server(self) -> None:
        adb = _find_adb()
        if not adb:
            print("[ERROR] adb not found.")
            return
        print("[ADB] Restarting ADB server (adb kill-server -> adb start-server)...")
        _run_capture([adb, "kill-server"], timeout=10)
        rc, out, err = _run_capture([adb, "start-server"], timeout=15)
        if rc != 0:
            print(f"[ERROR] adb start-server failed: {err or out}")
            return
        devices = list_adb_devices()
        if not devices:
            print("[WARN] Still no devices detected.")
            print("       Check: 1) USB cable supports data, 2) USB Debugging ON, 3) USB mode = File Transfer (MTP).")
            return
        for d in devices:
            kind = "AVD" if d.is_emulator else "USB"
            print(f"  -> {d.serial} ({kind}) state={d.state} model={d.model}")
            if d.state == "unauthorized":
                print("     [ACTION NEEDED] Unlock your Android phone and tap 'Allow USB debugging' on the RSA popup!")
            elif d.state == "offline":
                print("     [ACTION NEEDED] Unplug/replug USB cable or toggle USB Debugging off/on in Developer Options.")

    def setup_adb_reverse(self, target_serial: str | None = None) -> bool:
        adb = _find_adb()
        if not adb:
            print("[ERROR] adb not found.")
            return False
        devices = [d for d in list_adb_devices() if d.state == "device"]
        if target_serial:
            devices = [d for d in devices if d.serial == target_serial]
        if not devices:
            print("[WARN] No authorized Android device connected for adb reverse.")
            return False

        all_ok = True
        for d in devices:
            for port, label in ((METRO_PORT, "Metro Bundler"), (BACKEND_PORT, "Django BFF API")):
                rc, out, err = _run_capture([adb, "-s", d.serial, "reverse", f"tcp:{port}", f"tcp:{port}"], timeout=8)
                if rc == 0:
                    print(f"[OK] {d.serial}: reversed tcp:{port} -> tcp:{port} ({label})")
                else:
                    all_ok = False
                    print(f"[FAIL] {d.serial}: adb reverse tcp:{port} failed: {err or out}")
            if not d.is_emulator:
                print(f"       Reminder: On USB device {d.serial}, select Mobile Settings preset 'USB Device (http://localhost:{BACKEND_PORT})'.")
            else:
                print(f"       Reminder: On AVD {d.serial}, use 'http://10.0.2.2:{BACKEND_PORT}' or 'http://localhost:{BACKEND_PORT}' (reversed).")
        return all_ok

    def grant_android_permissions(self) -> None:
        adb = _find_adb()
        if not adb:
            print("[ERROR] adb not found.")
            return
        dev = self.pick_target_device()
        if not dev:
            return

        print(f"\n[PERMISSIONS] Target: {dev.serial} ({dev.model})")
        rc, pkg_out, _ = _run_capture([adb, "-s", dev.serial, "shell", "pm", "path", ANDROID_APP_ID], timeout=8)
        if rc != 0 or not pkg_out:
            print(f"[WARN] App '{ANDROID_APP_ID}' is not installed on {dev.serial} yet.")
            print("       Run Option [12] (Build & Run Android App) first, or open Developer Options below.")
        else:
            perms = [
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.CAMERA",
            ]
            for perm in perms:
                prc, pout, perr = _run_capture(
                    [adb, "-s", dev.serial, "shell", "pm", "grant", ANDROID_APP_ID, perm],
                    timeout=8,
                )
                if prc == 0:
                    print(f"  [GRANTED] {perm}")
                else:
                    msg = perr or pout
                    print(f"  [WARN] Could not grant {perm}: {msg}")
                    if "SecurityException" in msg or "not a changeable permission" in msg:
                        print("         -> On Xiaomi/Oppo/Realme, enable 'USB debugging (Security settings)' or 'Disable Permission Monitoring' in Developer Options.")

        print("\nAdditional ADB Device Settings Shortcuts:")
        print("  [1] Open Developer Options screen on the phone/emulator")
        print("  [2] Open App Info / Permissions page for com.mobile on the phone/emulator")
        print("  [3] Back to main menu")
        sub = input("Select [3]: ").strip() or "3"
        if sub == "1":
            _run_capture([adb, "-s", dev.serial, "shell", "am", "start", "-a", "android.settings.APPLICATION_DEVELOPMENT_SETTINGS"])
            print("[OK] Sent intent to open Developer Options on device.")
        elif sub == "2":
            _run_capture([
                adb, "-s", dev.serial, "shell", "am", "start",
                "-a", "android.settings.APPLICATION_DETAILS_SETTINGS",
                "-d", f"package:{ANDROID_APP_ID}",
            ])
            print(f"[OK] Sent intent to open {ANDROID_APP_ID} settings on device.")

    def run_android_app(self) -> None:
        dev = self.pick_target_device()
        if not dev:
            return
        self.setup_adb_reverse(dev.serial)
        npx = shutil.which("npx.cmd" if platform.system() == "Windows" else "npx") or "npx"
        cmd = [npx, "react-native", "run-android", "--device", dev.serial]
        print(f"[BUILD & RUN] Running: {' '.join(cmd)} (in mobile/)")
        try:
            subprocess.run(cmd, cwd=str(MOBILE_DIR), env=_base_env())
        except KeyboardInterrupt:
            print("\n[INTERRUPTED] Android build interrupted.")

    def reload_android_js(self) -> None:
        adb = _find_adb()
        if not adb:
            print("[ERROR] adb not found.")
            return
        dev = self.pick_target_device()
        if not dev:
            return
        print("  [1] Reload JS bundle (double R)")
        print("  [2] Open React Native Dev Menu (keyevent 82)")
        ch = input("Choice [1]: ").strip() or "1"
        if ch == "2":
            _run_capture([adb, "-s", dev.serial, "shell", "input", "keyevent", "82"])
            print("[OK] Sent Dev Menu keyevent.")
        else:
            _run_capture([adb, "-s", dev.serial, "shell", "input", "text", "RR"])
            print("[OK] Sent JS reload ('RR') to device.")

    def run_custom_console_cmd(self) -> None:
        print("Enter a command to execute with the project environment (.venv & DI active), or empty to cancel.")
        raw = input("cmd> ").strip()
        if not raw:
            return
        env = _base_env()
        venv_scripts = str(REPO_ROOT / ".venv" / "Scripts")
        if (REPO_ROOT / ".venv" / "Scripts").exists():
            env["PATH"] = venv_scripts + os.pathsep + env.get("PATH", "")
        subprocess.run(raw, cwd=str(REPO_ROOT), env=env, shell=True)

    def start_full_stack(self) -> None:
        self.start_backend(new_console=False)
        self.start_metro(new_console=False)
        devices = list_adb_devices()
        auth_devices = [d for d in devices if d.state == "device"]
        if not auth_devices:
            avds = list_avds()
            if avds:
                ans = input(f"No device connected. Boot AVD '{avds[0]}' now? [Y/n]: ").strip().lower()
                if ans in ("", "y", "yes"):
                    self.launch_avd()
            else:
                self.show_android_developer_guide()
        else:
            self.setup_adb_reverse()
            ans = input("Build & install Android app (`npx react-native run-android`) now? [y/N]: ").strip().lower()
            if ans in ("y", "yes"):
                self.run_android_app()

    def interactive_loop(self) -> int:
        try:
            while True:
                self.print_dashboard()
                print("SERVER & BUNDLER CONTROLS:")
                print("  [1] Start Full Stack (Backend + Metro + ADB Reverse + Android Check)")
                print("  [2] Start / Stop Django Backend Server (port 8000)")
                print("  [3] Start / Stop React Native Metro Bundler (port 8081)")
                print("  [4] Launch Servers in Separate Console Windows")
                print("  [5] View Server / Metro Logs")
                print("\nANDROID DEVICE, DEVELOPER OPTIONS & PERMISSION HELPERS:")
                print("  [6] List & Boot Android Studio Virtual Device (AVD)")
                print("  [7] Developer Options & USB Debugging Walkthrough (Console Help)")
                print("  [8] Restart ADB Server & Check USB Authorization")
                print("  [9] Setup ADB Port Reverse (8081 Metro + 8000 Django)")
                print(" [10] Grant App Permissions & Open Android Dev/App Settings")
                print(" [11] Reload JS / Open RN Dev Menu on Device")
                print(" [12] Build & Install Android App (`npx react-native run-android`)")
                print("\nSYSTEM, CONFIG, DATABASE & CMD:")
                print(" [13] Run System Status Check (refresh SYSTEM_STATUS.md)")
                print(" [14] Configure DI Settings (`di_config.local.json`)")
                print(" [15] Local Database Setup / Seed / Export Credentials TXT")
                print(" [16] Run Django System Check & DB Preflight")
                print(" [17] Run Custom Console Command (cmd)")
                print("  [0] Stop Managed Processes & Exit")

                choice = input("\nSelect option: ").strip()
                if choice == "1":
                    self.start_full_stack()
                elif choice == "2":
                    if self.is_running("backend"):
                        self.stop_process("backend")
                    else:
                        self.start_backend(new_console=False)
                elif choice == "3":
                    if self.is_running("metro"):
                        self.stop_process("metro")
                    else:
                        self.start_metro(new_console=False)
                elif choice == "4":
                    self.start_backend(new_console=True)
                    self.start_metro(new_console=True)
                elif choice == "5":
                    which = input("View [b]ackend or [m]etro log? [b]: ").strip().lower() or "b"
                    self.tail_log("metro" if which.startswith("m") else "backend")
                elif choice == "6":
                    self.launch_avd()
                elif choice == "7":
                    self.show_android_developer_guide()
                elif choice == "8":
                    self.restart_adb_server()
                elif choice == "9":
                    self.setup_adb_reverse()
                elif choice == "10":
                    self.grant_android_permissions()
                elif choice == "11":
                    self.reload_android_js()
                elif choice == "12":
                    self.run_android_app()
                elif choice == "13":
                    subprocess.run([_find_venv_python(), str(REPO_ROOT / "scripts" / "check_system_status.py")], cwd=str(REPO_ROOT))
                elif choice == "14":
                    subprocess.run([_find_venv_python(), str(REPO_ROOT / "scripts" / "setup_di_config.py"), "--interactive"], cwd=str(REPO_ROOT))
                elif choice == "15":
                    subprocess.run([_find_venv_python(), str(REPO_ROOT / "postgres_sql" / "manage_database.py")], cwd=str(REPO_ROOT))
                elif choice == "16":
                    py = _find_venv_python()
                    subprocess.run([py, str(BACKEND_DIR / "manage.py"), "check"], cwd=str(REPO_ROOT), env=_base_env())
                    subprocess.run([py, str(REPO_ROOT / "scripts" / "db_preflight_check.py")], cwd=str(REPO_ROOT), env=_base_env())
                elif choice == "17":
                    self.run_custom_console_cmd()
                elif choice == "0":
                    self.stop_all()
                    print("Goodbye.")
                    return 0
                else:
                    print("[WARN] Unknown option.")
        except KeyboardInterrupt:
            print("\nShutting down managed processes...")
            self.stop_all()
            return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Volunteer Coordination System Console Orchestrator.")
    parser.add_argument("--status", action="store_true", help="Print live stack/device dashboard and exit.")
    parser.add_argument("--check-devices", action="store_true", help="List ADB devices and AVDs and exit.")
    parser.add_argument("--reverse", action="store_true", help="Apply adb reverse 8081 & 8000 on authorized devices and exit.")
    parser.add_argument("--grant-permissions", action="store_true", help="Grant runtime permissions to com.mobile via ADB.")
    parser.add_argument("--dev-guide", action="store_true", help="Print Android Developer Options & USB debugging guide.")
    args = parser.parse_args()

    orch = StackOrchestrator()

    if args.status:
        orch.print_dashboard()
        return 0
    if args.check_devices:
        devs = list_adb_devices()
        avds = list_avds()
        print("Connected ADB Devices:", [d.__dict__ for d in devs] if devs else "None")
        print("Available AVDs:", avds if avds else "None")
        return 0
    if args.reverse:
        return 0 if orch.setup_adb_reverse() else 1
    if args.grant_permissions:
        orch.grant_android_permissions()
        return 0
    if args.dev_guide:
        orch.show_android_developer_guide()
        return 0

    return orch.interactive_loop()


if __name__ == "__main__":
    raise SystemExit(main())
