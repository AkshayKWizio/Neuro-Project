from __future__ import annotations

import shutil
import sys
from pathlib import Path


def resolve_editable_profile(
    default_profile_path: Path,
    profile_name: str,
    component_label: str,
) -> Path | None:
    """
    Resolve profile path with this priority:
    - Source mode: bundled default profile path only.
    - Frozen mode: profiles/<profile_name> next to executable, then bundled default.

    In frozen mode, if the external profile does not exist, copy the bundled default
    into profiles/.
    """
    if not getattr(sys, "frozen", False):
        if default_profile_path.exists():
            return default_profile_path
        return None

    runtime_base = Path(sys.executable).resolve().parent
    profiles_dir = runtime_base / "profiles"
    external_profile_path = profiles_dir / profile_name

    if not external_profile_path.exists():
        try:
            profiles_dir.mkdir(parents=True, exist_ok=True)
            if default_profile_path.exists():
                shutil.copy2(default_profile_path, external_profile_path)
                print(f"[{component_label}] Created editable profile: {external_profile_path}")
        except Exception as error:
            print(f"[{component_label}] Could not create editable profile at {external_profile_path}: {error}")

    if external_profile_path.exists():
        return external_profile_path
    if default_profile_path.exists():
        return default_profile_path
    return None
