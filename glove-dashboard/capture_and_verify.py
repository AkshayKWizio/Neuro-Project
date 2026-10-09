# -*- coding: utf-8 -*-
import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"C:\Users\aksha\Desktop\Neuro_Glove_Game_Screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def run_e2e_and_capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EDGE_PATH, headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # 1. Doctor Workspace / Patient Selection Directory
        print("[1/9] Capturing Doctor Workspace / Patient Directory...")
        page.goto("http://127.0.0.1:3000/")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "01_doctor_workspace_patient_directory.png"))
        print("  -> Saved 01_doctor_workspace_patient_directory.png")

        # Select Patient PAT-0001 (Eleanor Vance)
        print("[2/9] Opening Eleanor Vance's Patient Session...")
        patient_btn = page.locator("text=Open Workspace").first
        if patient_btn.is_visible():
            patient_btn.click()
            page.wait_for_timeout(1000)

        # In Glove Connection Modal, capture the modal, then click "Continue to Protocols ->"
        print("  -> Capturing Glove Connection Modal...")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "02_glove_connection_gate_modal.png"))
        print("  -> Saved 02_glove_connection_gate_modal.png")

        continue_btn = page.locator("button:has-text('Continue to Protocols')").first
        if continue_btn.is_visible():
            continue_btn.click()
            page.wait_for_timeout(1500)

        # 3. Prescribed Exercises Workspace
        print("[3/9] Capturing Prescribed Exercises Workspace...")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "03_prescribed_exercises_workspace.png"))
        print("  -> Saved 03_prescribed_exercises_workspace.png")

        # 4. Launch Balloon Blitz Exercise Session
        print("[4/9] Launching Balloon Blitz in Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=balloon_blitz&exercise=hand_open_close")
        page.wait_for_timeout(2000)
        # Capture the startup motion guide and countdown
        page.screenshot(path=os.path.join(OUTPUT_DIR, "04_balloon_blitz_startup_guide.png"))
        print("  -> Saved 04_balloon_blitz_startup_guide.png")

        # Wait 4.5s for countdown to finish naturally and game to become active
        page.wait_for_timeout(4500)

        # Send simulated reps into the session
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 12, score: 780, movement: 'wrist_open' }, '*');
        }""")
        page.wait_for_timeout(2000)

        # Capture active Balloon Blitz gameplay with rep counter
        page.screenshot(path=os.path.join(OUTPUT_DIR, "05_balloon_blitz_active_cinema_game.png"))
        print("  -> Saved 05_balloon_blitz_active_cinema_game.png")

        # Click Finish & Save to test automatic navigation to Reports
        print("  -> Clicking Finish & Save...")
        finish_btn = page.locator(".cinema-finish-btn").first
        if finish_btn.is_visible():
            finish_btn.click()
            page.wait_for_timeout(3500)

        # 5. Clinical Reports & Analytics (Newly saved report should be visible!)
        print("[5/9] Capturing Clinical Reports & Analytics...")
        page.wait_for_timeout(2000)
        # Refresh if needed
        refresh_btn = page.locator("button:has-text('Refresh')").first
        if refresh_btn.is_visible():
            refresh_btn.click()
            page.wait_for_timeout(1500)

        page.screenshot(path=os.path.join(OUTPUT_DIR, "06_clinical_reports_and_analytics.png"))
        print("  -> Saved 06_clinical_reports_and_analytics.png")

        # 6. Launch Sky Glider Game in Cinema Stage
        print("[6/9] Launching Sky Glider in Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=sky_glider&exercise=pronation_supination")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "07_sky_glider_startup_guide.png"))
        print("  -> Saved 07_sky_glider_startup_guide.png")

        page.wait_for_timeout(4500)
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 15, score: 920, movement: 'pronation' }, '*');
        }""")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "08_sky_glider_active_cinema_game.png"))
        print("  -> Saved 08_sky_glider_active_cinema_game.png")

        # Finish Sky Glider
        page.locator(".cinema-finish-btn").first.click()
        page.wait_for_timeout(3000)

        # 7. Launch Rolling Wonder in Cinema Stage
        print("[7/9] Launching Rolling Wonder in Cinema Stage...")
        page.goto("http://127.0.0.1:3000/?patient=PAT-0001&game=rolling_wonder&exercise=circumduction")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "09_rolling_wonder_startup_guide.png"))
        print("  -> Saved 09_rolling_wonder_startup_guide.png")

        page.wait_for_timeout(4500)
        page.evaluate("""() => {
            window.postMessage({ type: 'NEURO_REP_EVENT', reps: 10, score: 650, movement: 'clockwise' }, '*');
        }""")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "10_rolling_wonder_active_cinema_game.png"))
        print("  -> Saved 10_rolling_wonder_active_cinema_game.png")

        # Finish Rolling Wonder
        page.locator(".cinema-finish-btn").first.click()
        page.wait_for_timeout(3000)

        # 8. Live 3D Glove Telemetry Workspace
        print("[8/9] Navigating to Live 3D Glove Biometrics...")
        live_tab = page.locator("nav button:has-text('Live data')").first
        if live_tab.is_visible():
            live_tab.click()
            page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "11_live_3d_glove_biometrics.png"))
        print("  -> Saved 11_live_3d_glove_biometrics.png")

        # 9. Return to Reports to show full longitudinal dossier with multiple exercises
        print("[9/9] Capturing Full Clinical Reports Longitudinal Dossier...")
        reports_tab = page.locator("nav button:has-text('Reports')").first
        if reports_tab.is_visible():
            reports_tab.click()
            page.wait_for_timeout(1500)
        refresh_btn = page.locator("button:has-text('Refresh')").first
        if refresh_btn.is_visible():
            refresh_btn.click()
            page.wait_for_timeout(1500)

        page.screenshot(path=os.path.join(OUTPUT_DIR, "12_clinical_reports_full_longitudinal_dossier.png"))
        print("  -> Saved 12_clinical_reports_full_longitudinal_dossier.png")

        # Also capture standalone game views
        print("Capturing Standalone Games in Fullscreen...")
        page.goto("http://127.0.0.1:3000/games/balloon-blitz/index.html")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "13_balloon_blitz_standalone_gameplay.png"))

        page.goto("http://127.0.0.1:3000/games/sky-glider/index.html")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "14_sky_glider_standalone_gameplay.png"))

        page.goto("http://127.0.0.1:3000/games/rolling-wonder/index.html")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "15_rolling_wonder_standalone_gameplay.png"))

        browser.close()
        print("\n=== All 15 full-screen screenshots saved successfully to: ===")
        print(OUTPUT_DIR)

if __name__ == "__main__":
    run_e2e_and_capture()
