# -*- coding: utf-8 -*-
import os
import json
import urllib.request
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"C:\Users\aksha\Desktop\Neuro_Glove_Game_Screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def clear_backend_state():
    try:
        # Clear active exercises
        req = urllib.request.Request(
            "http://127.0.0.1:3000/api/exercise",
            data=json.dumps({"exercise": "none", "hand": "right"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=3)
        req2 = urllib.request.Request(
            "http://127.0.0.1:3000/api/exercise",
            data=json.dumps({"exercise": "none", "hand": "left"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req2, timeout=3)
    except Exception as e:
        print("Note on clear_backend_state:", e)

def run_e2e_and_capture():
    clear_backend_state()

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EDGE_PATH, headless=True)
        # Pristine context at 1920x1080 Full HD
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # ----------------------------------------------------
        # 1. Doctor Workspace / Clinical Patient Directory
        # ----------------------------------------------------
        print("[1/10] Capturing Doctor Workspace / Patient Directory...")
        page.goto("http://127.0.0.1:3000/")
        page.wait_for_timeout(2500)
        # If an exercise overlay was open, finish it
        finish = page.locator(".cinema-finish-btn")
        if finish.count() > 0 and finish.first.is_visible():
            finish.first.click(force=True)
            page.wait_for_timeout(1500)

        # Switch to doctor workspace by logging out or going to root without patient
        page.screenshot(path=os.path.join(OUTPUT_DIR, "01_doctor_workspace_patient_directory.png"))
        print("  -> Saved 01_doctor_workspace_patient_directory.png")

        # ----------------------------------------------------
        # 2. Select Eleanor Vance (PAT-0001)
        # ----------------------------------------------------
        print("[2/10] Selecting Patient Eleanor Vance (PAT-0001)...")
        # Direct select via API to ensure clean patient session
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:3000/api/auth/select-patient",
                data=json.dumps({"patient_id": "PAT-0001"}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=3)
        except Exception as e:
            print("API select error:", e)

        page.goto("http://127.0.0.1:3000/")
        page.wait_for_timeout(2500)

        # Dismiss glove modal if shown
        cont = page.locator("button:has-text('Continue to Protocols')")
        if cont.count() > 0 and cont.first.is_visible():
            page.screenshot(path=os.path.join(OUTPUT_DIR, "02_glove_connection_modal.png"))
            print("  -> Saved 02_glove_connection_modal.png")
            cont.first.click(force=True)
            page.wait_for_timeout(1500)

        # ----------------------------------------------------
        # 3. Prescribed Exercises Workspace
        # ----------------------------------------------------
        print("[3/10] Capturing Prescribed Exercises Workspace...")
        # Ensure we are on exercises view
        page.locator("nav button:has-text('Exercises')").first.click(force=True)
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "03_prescribed_exercises_workspace.png"))
        print("  -> Saved 03_prescribed_exercises_workspace.png")

        # ----------------------------------------------------
        # 4. Balloon Blitz Cinema Session
        # ----------------------------------------------------
        print("[4/10] Launching Balloon Blitz Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=balloon_blitz&exercise=hand_open_close")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "04_balloon_blitz_startup_guide.png"))
        print("  -> Saved 04_balloon_blitz_startup_guide.png")

        # Wait for countdown to finish naturally and game to activate
        print("  -> Waiting for countdown to finish & simulating reps...")
        page.wait_for_timeout(4500)
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 14, score: 850, movement: 'wrist_open' }, '*');
        }""")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "05_balloon_blitz_active_cinema_game.png"))
        print("  -> Saved 05_balloon_blitz_active_cinema_game.png")

        # Click Finish & Save -> Should automatically transition to Reports!
        print("  -> Clicking Finish & Save to test automatic navigation to Reports...")
        page.locator(".cinema-finish-btn").first.click(force=True)
        page.wait_for_timeout(3500)

        # ----------------------------------------------------
        # 5. Clinical Reports & Analytics (Newly saved session!)
        # ----------------------------------------------------
        print("[5/10] Capturing Clinical Reports & Analytics...")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "06_clinical_reports_and_analytics.png"))
        print("  -> Saved 06_clinical_reports_and_analytics.png")

        # ----------------------------------------------------
        # 6. Sky Glider Cinema Session
        # ----------------------------------------------------
        print("[6/10] Launching Sky Glider Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=sky_glider&exercise=pronation_supination")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "07_sky_glider_startup_guide.png"))
        print("  -> Saved 07_sky_glider_startup_guide.png")

        page.wait_for_timeout(4500)
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 18, score: 1100, movement: 'pronation' }, '*');
        }""")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "08_sky_glider_active_cinema_game.png"))
        print("  -> Saved 08_sky_glider_active_cinema_game.png")

        # Finish Sky Glider
        page.locator(".cinema-finish-btn").first.click(force=True)
        page.wait_for_timeout(3500)

        # ----------------------------------------------------
        # 7. Rolling Wonder Cinema Session
        # ----------------------------------------------------
        print("[7/10] Launching Rolling Wonder Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=rolling_wonder&exercise=circumduction")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "09_rolling_wonder_startup_guide.png"))
        print("  -> Saved 09_rolling_wonder_startup_guide.png")

        page.wait_for_timeout(4500)
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 12, score: 720, movement: 'clockwise' }, '*');
        }""")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "10_rolling_wonder_active_cinema_game.png"))
        print("  -> Saved 10_rolling_wonder_active_cinema_game.png")

        # Finish Rolling Wonder
        page.locator(".cinema-finish-btn").first.click(force=True)
        page.wait_for_timeout(3500)

        # ----------------------------------------------------
        # 8. Live 3D Glove Biometrics Workspace
        # ----------------------------------------------------
        print("[8/10] Navigating to Live 3D Glove Biometrics...")
        page.locator("nav button:has-text('Live data')").first.click(force=True)
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "11_live_3d_glove_biometrics.png"))
        print("  -> Saved 11_live_3d_glove_biometrics.png")

        # ----------------------------------------------------
        # 9. Reports Workspace with All Sessions & History
        # ----------------------------------------------------
        print("[9/10] Navigating to Full Reports Workspace...")
        page.locator("nav button:has-text('Reports')").first.click(force=True)
        page.wait_for_timeout(2000)
        refresh = page.locator("button:has-text('Refresh')")
        if refresh.count() > 0:
            refresh.first.click(force=True)
            page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "12_clinical_reports_full_history.png"))
        print("  -> Saved 12_clinical_reports_full_history.png")

        # ----------------------------------------------------
        # 10. Standalone Fullscreen Games
        # ----------------------------------------------------
        print("[10/10] Capturing Standalone Fullscreen Games...")
        page.goto("http://127.0.0.1:3000/games/balloon-blitz/index.html")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "13_balloon_blitz_standalone_fullscreen.png"))
        print("  -> Saved 13_balloon_blitz_standalone_fullscreen.png")

        page.goto("http://127.0.0.1:3000/games/sky-glider/index.html")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "14_sky_glider_standalone_fullscreen.png"))
        print("  -> Saved 14_sky_glider_standalone_fullscreen.png")

        page.goto("http://127.0.0.1:3000/games/rolling-wonder/index.html")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "15_rolling_wonder_standalone_fullscreen.png"))
        print("  -> Saved 15_rolling_wonder_standalone_fullscreen.png")

        browser.close()
        print("\nAll 15 screenshots successfully generated in:")
        print(OUTPUT_DIR)

if __name__ == "__main__":
    run_e2e_and_capture()
