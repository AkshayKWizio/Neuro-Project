import argparse
import asyncio
import threading
import time
import sys
from pathlib import Path
from typing import Sequence

from core.config import REALITY_SDK_PYTHON_VERSION
from core.shared_state import SharedState
from core.osc_receiver import OSCReceiver
from core.osc_sender import OSCSender
from data_recorder.data_recorder import data_recorder_loop
from debug.debug_worker import debug_loop, get_debug_help_suffix
from gamepad_emulator.gamepad_emulator import gamepad_loop, get_gamepad_startup_blocker
from keyboard_emulator.keyboard_emulator import keyboard_loop
from haptics.haptics_manager import haptics_loop
from mvn.mvn_manager import mvn_loop


WORKER_NAMES = ("gamepad", "keyboard", "haptics", "data_recorder", "mvn", "debug")


def run_asyncio_server(receiver: OSCReceiver):
    asyncio.run(receiver.start_and_run_forever())


def wait_for_init_complete(init_complete_event: threading.Event, timeout_s: float = 5.0) -> bool:
    ok = init_complete_event.wait(timeout=timeout_s)
    if ok:
        init_complete_event.clear()
    return ok


def prune_dead_workers(
    worker_threads: dict[str, threading.Thread],
    started_workers: set[str],
    stop_event: threading.Event,
):
    dead_workers = [name for name, thread in worker_threads.items() if not thread.is_alive()]
    for name in dead_workers:
        worker_threads.pop(name, None)
        started_workers.discard(name)
        if not stop_event.is_set():
            print(f"[{name}] Worker thread exited unexpectedly.")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Reality OSC Bridge with selected worker threads."
    )
    parser.add_argument(
        "workers",
        nargs="*",
        choices=(*WORKER_NAMES, "all"),
        help="Workers to launch (default: all). Example: gamepad keyboard",
    )
    return parser.parse_args(argv)


def resolve_workers(args: argparse.Namespace) -> set[str]:
    workers = args.workers or ["all"]
    if "all" in workers:
        return set(WORKER_NAMES)
    return set(workers)


def main(argv: Sequence[str] | None = None):
    print(f"Reality SDK Python v{REALITY_SDK_PYTHON_VERSION}")
    args = parse_args(argv)
    if not args.workers:
        script_name = "reality_osc_bridge.py"
        is_exe = False
        if argv is None and sys.argv:
            script_name = Path(sys.argv[0]).name
            is_exe = bool(getattr(sys, "frozen", False)) or script_name.lower().endswith(".exe")

        run_prefix = "" if is_exe else "python "

        available_workers = ", ".join(WORKER_NAMES)
        print("No workers specified. Please specify one or more workers to run.")
        print(f"Available workers: {available_workers}")
        print("Examples:")
        print(f"  {run_prefix}{script_name} mvn")
        print(f"  {run_prefix}{script_name} gamepad keyboard haptics")
        print(f"  {run_prefix}{script_name} all")
        return 1

    selected_workers = resolve_workers(args)

    shared = SharedState()

    # ── OSC: split into receiver (async) and sender (threaded queue) ──
    osc_receiver = OSCReceiver(shared, input_ip="127.0.0.1", input_port=9002, debug_keys=set())
    osc_sender = OSCSender(output_ip="127.0.0.1", output_port=9003)

    receiver_thread = threading.Thread(
        target=run_asyncio_server, 
        args=(osc_receiver,), 
        name="OSCReceiverThread", 
        daemon=True
    )
    receiver_thread.start()

    osc_sender.start()  # starts its own worker thread

    # ── Emulators / workers ──
    stop_event = threading.Event()
    init_complete_event = threading.Event()

    worker_threads: dict[str, threading.Thread] = {}
    started_workers: set[str] = set()

    if "gamepad" in selected_workers:
        blocker = get_gamepad_startup_blocker()
        if blocker:
            print(f"[Gamepad] Not starting gamepad worker: {blocker}")
        else:
            gamepad_thread = threading.Thread(
                target=gamepad_loop,
                args=(shared, stop_event, init_complete_event),
                name="GamepadThread",
            )
            gamepad_thread.start()
            worker_threads["gamepad"] = gamepad_thread
            started_workers.add("gamepad")
            wait_for_init_complete(init_complete_event)

    if "keyboard" in selected_workers:
        keyboard_thread = threading.Thread(
            target=keyboard_loop, 
            args=(shared, stop_event, init_complete_event), 
            name="KeyboardThread"
        )
        keyboard_thread.start()
        worker_threads["keyboard"] = keyboard_thread
        started_workers.add("keyboard")
        wait_for_init_complete(init_complete_event)

    if "haptics" in selected_workers:
        haptics_thread = threading.Thread(
            target=haptics_loop, 
            args=(shared, osc_sender, stop_event, init_complete_event), 
            name="HapticsThread"
        )
        haptics_thread.start()
        worker_threads["haptics"] = haptics_thread
        started_workers.add("haptics")
        wait_for_init_complete(init_complete_event)

    if "mvn" in selected_workers:
        mvn_thread = threading.Thread(
            target=mvn_loop, 
            args=(shared, stop_event, init_complete_event), 
            name="MVNThread"
        )
        mvn_thread.start()
        worker_threads["mvn"] = mvn_thread
        started_workers.add("mvn")
        wait_for_init_complete(init_complete_event)

    if "data_recorder" in selected_workers:
        data_recorder_thread = threading.Thread(
            target=data_recorder_loop,
            args=(shared, stop_event, init_complete_event),
            name="DataRecorderThread",
        )
        data_recorder_thread.start()
        worker_threads["data_recorder"] = data_recorder_thread
        started_workers.add("data_recorder")
        wait_for_init_complete(init_complete_event)
    
    if "debug" in selected_workers:
        debug_thread = threading.Thread(
            target=debug_loop, 
            args=(shared, stop_event, init_complete_event), 
            name="DebugThread"
        )
        debug_thread.start()
        worker_threads["debug"] = debug_thread
        started_workers.add("debug")
        wait_for_init_complete(init_complete_event)

    if "vmc" in selected_workers:
        pass
        # <COMING SOON>
        # vmc_thread = threading.Thread(target=vmc_loop, args=(shared, osc_sender, stop_event, init_complete_event), name="VMCThread")
        # vmc_thread.start()
        # worker_threads.append(vmc_thread)
        # wait_for_init_complete(init_complete_event)

    # XR Train Only
    if "command" in selected_workers:
        pass
        # <COMING SOON>
        # command_thread = threading.Thread(target=command_loop, args=(shared, osc_sender, stop_event, init_complete_event), name="CommandThread")
        # command_thread.start()
        # worker_threads.append(command_thread)
        # wait_for_init_complete(init_complete_event)

    debug_suffix = get_debug_help_suffix() if "debug" in started_workers else ""
    started_workers_display = ", ".join(sorted(started_workers)) if started_workers else "none"
    print(f"Threads started ({started_workers_display}). Press Ctrl+C to exit.{debug_suffix}")

    try:
        while True:
            time.sleep(0.05)
    except KeyboardInterrupt:
        print("Shutting down...")
        stop_event.set()
        prune_dead_workers(worker_threads, started_workers, stop_event)

        # Join app threads first
        for worker_name, worker_thread in list(worker_threads.items()):
            worker_thread.join(timeout=5.0)
            if worker_thread.is_alive():
                print(f"[{worker_name}] Worker did not exit within timeout.")

        # Stop OSC pieces
        osc_receiver.stop()
        if receiver_thread:
            receiver_thread.join()

        osc_sender.stop()


if __name__ == "__main__":
    raise SystemExit(main())
