"""Local doctor/patient authentication and exercise report persistence."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class LocalClinicalStore:
    def __init__(self, data_root: Path) -> None:
        self.data_root = data_root
        self.report_root = data_root / "reports"
        self.sessions: dict[str, dict[str, Any]] = {}
        self.active_reports: dict[str, dict[str, Any]] = {}
        self.lock = threading.RLock()

    def _read(self, name: str) -> list[dict[str, Any]]:
        try:
            return json.loads((self.data_root / name).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

    def _write(self, name: str, records: list[dict[str, Any]]) -> None:
        target = self.data_root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(records, indent=2), encoding="utf-8")
        temporary.replace(target)

    @staticmethod
    def _password_matches(password: str, record: dict[str, Any]) -> bool:
        calculated = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), str(record["password_salt"]).encode(), int(record.get("iterations", 200000))
        ).hex()
        return hmac.compare_digest(calculated, str(record["password_hash"]))

    def doctor_login(self, username: str, password: str) -> tuple[str, dict[str, Any]] | None:
        doctor = next((item for item in self._read("doctors.json") if item.get("username") == username.strip().lower() and item.get("enabled")), None)
        if not doctor or not self._password_matches(password, doctor):
            return None
        token = secrets.token_urlsafe(32)
        session = {"doctor_id": doctor["id"], "doctor_name": doctor["name"], "active_patient_id": None}
        with self.lock:
            self.sessions[token] = session
        return token, self.session_view(session)

    def session(self, token: str | None) -> dict[str, Any] | None:
        with self.lock:
            return self.sessions.get(token or "")

    def session_view(self, session: dict[str, Any] | None) -> dict[str, Any]:
        if not session:
            return {"authenticated": False}
        patient = self.patient(session.get("active_patient_id"))
        return {
            "authenticated": True,
            "doctor": {"id": session["doctor_id"], "name": session["doctor_name"]},
            "patient": self.public_patient(patient) if patient else None,
        }

    def patients_for_doctor(self, doctor_id: str) -> list[dict[str, Any]]:
        mappings = self._read("doctor_patients.json")
        allowed = {item["patient_id"] for item in mappings if item.get("doctor_id") == doctor_id}
        return [self.public_patient(item) for item in self._read("patients.json") if item.get("id") in allowed and item.get("enabled")]

    def add_patient(
        self,
        doctor_id: str,
        name: str,
        username: str,
        password: str,
        date_of_birth: str = "",
        notes: str = "",
        avatar: str = "",
        gender: str = "",
        condition: str = "",
        target_hand: str = "right",
        phone: str = "",
        protocol: str = "",
        functional_stage: str = "",
    ) -> dict[str, Any]:
        normalized_username = username.strip().lower()
        with self.lock:
            patients = self._read("patients.json")
            if any(str(item.get("username", "")).lower() == normalized_username for item in patients):
                raise ValueError("A patient with this username already exists.")
            numeric_ids = [int(str(item.get("id", "0")).removeprefix("PAT-")) for item in patients if str(item.get("id", "")).removeprefix("PAT-").isdigit()]
            patient_id = f"PAT-{max(numeric_ids, default=0) + 1:04d}"
            salt = secrets.token_hex(16)
            iterations = 200000
            patient = {
                "id": patient_id,
                "name": name.strip(),
                "username": normalized_username,
                "password_salt": salt,
                "password_hash": hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex(),
                "iterations": iterations,
                "date_of_birth": date_of_birth.strip(),
                "notes": notes.strip(),
                "avatar": avatar.strip(),
                "gender": gender.strip(),
                "condition": condition.strip(),
                "target_hand": target_hand.strip() or "right",
                "phone": phone.strip(),
                "protocol": protocol.strip(),
                "functional_stage": functional_stage.strip(),
                "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "enabled": True,
            }
            mappings = self._read("doctor_patients.json")
            patients.append(patient)
            mappings.append({"doctor_id": doctor_id, "patient_id": patient_id})
            self._write("patients.json", patients)
            self._write("doctor_patients.json", mappings)
        return self.public_patient(patient)

    def update_patient(
        self,
        doctor_id: str,
        patient_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        with self.lock:
            mappings = self._read("doctor_patients.json")
            allowed = {item["patient_id"] for item in mappings if item.get("doctor_id") == doctor_id}
            if patient_id not in allowed:
                raise ValueError("Patient is not assigned to this clinician.")

            patients = self._read("patients.json")
            patient = next((item for item in patients if item.get("id") == patient_id and item.get("enabled")), None)
            if not patient:
                raise ValueError("Patient record not found.")

            for field in (
                "name",
                "date_of_birth",
                "notes",
                "avatar",
                "gender",
                "condition",
                "target_hand",
                "phone",
                "protocol",
                "functional_stage",
            ):
                if field in updates and updates[field] is not None:
                    patient[field] = str(updates[field]).strip()

            if updates.get("password"):
                salt = secrets.token_hex(16)
                iterations = 200000
                patient["password_salt"] = salt
                patient["password_hash"] = hashlib.pbkdf2_hmac(
                    "sha256", updates["password"].encode(), salt.encode(), iterations
                ).hex()
                patient["iterations"] = iterations

            patient["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._write("patients.json", patients)
        return self.public_patient(patient)

    def patient(self, patient_id: str | None) -> dict[str, Any] | None:
        return next((item for item in self._read("patients.json") if item.get("id") == patient_id and item.get("enabled")), None)

    @staticmethod
    def public_patient(patient: dict[str, Any]) -> dict[str, Any]:
        return {
            key: patient.get(key)
            for key in (
                "id",
                "name",
                "username",
                "date_of_birth",
                "notes",
                "created_at",
                "avatar",
                "gender",
                "condition",
                "target_hand",
                "phone",
                "protocol",
                "functional_stage",
            )
        }

    def select_patient(self, session: dict[str, Any], patient_id: str) -> dict[str, Any] | None:
        allowed = {item["id"] for item in self.patients_for_doctor(session["doctor_id"])}
        patient = self.patient(patient_id)
        if not patient or patient_id not in allowed:
            return None
        session["active_patient_id"] = patient_id
        return self.session_view(session)

    def patient_login(self, session: dict[str, Any], username: str, password: str) -> dict[str, Any] | None:
        patient = next((item for item in self._read("patients.json") if item.get("username") == username.strip().lower() and item.get("enabled")), None)
        if not patient or not self._password_matches(password, patient):
            return None
        return self.select_patient(session, patient["id"])

    def logout(self, token: str | None) -> None:
        with self.lock:
            self.sessions.pop(token or "", None)
            self.active_reports.pop(token or "", None)

    def start_report(self, token: str, session: dict[str, Any], exercise: str, hand: str, snapshot: dict[str, Any]) -> None:
        if not session.get("active_patient_id"):
            return
        self.finish_report(token, snapshot, "completed")
        now = datetime.now(timezone.utc)
        counts = snapshot["exercises"][hand]["counts"]
        with self.lock:
            self.active_reports[token] = {
                "schema_version": 1,
                "session_id": secrets.token_hex(12),
                "doctor_id": session["doctor_id"],
                "patient_id": session["active_patient_id"],
                "exercise": exercise,
                "hand": hand,
                "started_at": now.isoformat().replace("+00:00", "Z"),
                "baseline_counts": dict(counts),
            }

    def finish_report(self, token: str, snapshot: dict[str, Any], outcome: str = "completed") -> dict[str, Any] | None:
        with self.lock:
            active = self.active_reports.pop(token, None)
        if not active:
            return None
        now = datetime.now(timezone.utc)
        hand = active["hand"]
        exercise_state = snapshot["exercises"][hand]
        current_counts = exercise_state["counts"]
        counts = {key: max(0, int(value) - int(active["baseline_counts"].get(key, 0))) for key, value in current_counts.items()}
        total_repetitions = sum(counts.values())
        # Starting and immediately finishing an exercise is not a clinical
        # session. Do not create empty report cards or include it in totals.
        if total_repetitions <= 0:
            return None
        started = datetime.fromisoformat(active["started_at"].replace("Z", "+00:00"))
        hand_state = snapshot["hands"][hand]
        serial = ((hand_state.get("orientation") or {}).get("header") or {}).get("serial", "")
        calibration = hand_state.get("articulation_state")
        report = {
            **{key: value for key, value in active.items() if key != "baseline_counts"},
            "ended_at": now.isoformat().replace("+00:00", "Z"),
            "duration_seconds": round((now - started).total_seconds(), 1),
            "outcome": outcome,
            "glove_serial": serial,
            "calibration": calibration,
            "counts": counts,
            "total_repetitions": total_repetitions,
            "events": [event for event in exercise_state.get("events", []) if int(event.get("timestamp_ms", 0)) >= int(started.timestamp() * 1000)],
            "final_metrics": {
                "pronation_supination": exercise_state.get("pronation_supination"),
                "circumduction": exercise_state.get("circumduction"),
                "hand_open_close": exercise_state.get("hand_open_close"),
            },
        }
        folder = self.report_root / now.date().isoformat() / active["patient_id"]
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f'{active["session_id"]}.json'
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(report, indent=2), encoding="utf-8")
        temporary.replace(target)
        return report

    def reports(self, doctor_id: str, patient_id: str | None = None) -> list[dict[str, Any]]:
        allowed = {item["id"] for item in self.patients_for_doctor(doctor_id)}
        reports: list[dict[str, Any]] = []
        if not self.report_root.exists():
            return reports
        for path in self.report_root.rglob("*.json"):
            try:
                report = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if report.get("patient_id") in allowed and int(report.get("total_repetitions", 0)) > 0 and (patient_id is None or report.get("patient_id") == patient_id):
                reports.append(report)
        return sorted(reports, key=lambda item: item.get("started_at", ""), reverse=True)
