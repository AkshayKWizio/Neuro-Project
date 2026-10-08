"""Local license validation checks."""

from backend.server import validate_license_key


active = validate_license_key("NEURO-DEMO-2026-TEAM")
assert active["valid"] is True
assert active["status"] == "active"
assert "2030" in active["expires_at"] or "2027" in active["expires_at"]

skipped = validate_license_key("")
assert skipped["valid"] is True
assert skipped["status"] == "active"

skipped_word = validate_license_key("SKIP")
assert skipped_word["valid"] is True
assert skipped_word["status"] == "active"

quick_eval = validate_license_key("12345667")
assert quick_eval["valid"] is True
assert quick_eval["status"] == "active"

print("License validation checks passed")
