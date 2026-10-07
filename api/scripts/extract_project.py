"""Convert a project file to MSPDI XML and extract per-task Gantt bar colors.

Usage:
    python extract_project.py <input> <output.xml> <colors.json>

Colors are read from the original MPP/MPT file's "Gantt Chart" view.  For XML
inputs no colors are extracted (an empty map is written).
"""

import json
import shutil
import sys
from pathlib import Path

import mpxj


def _color_to_hex(color) -> str | None:
    if color is None:
        return None
    # java.awt.Color.getRGB() returns 0xAARRGGBB; keep only RGB.
    return f"#{color.getRGB() & 0xFFFFFF:06X}"


def _build_task_props(task):
    """Return a small property bag used to evaluate bar-style criteria."""
    percent = task.getPercentageComplete()
    return {
        "uid": task.getUniqueID(),
        "summary": bool(task.getSummary()),
        "milestone": bool(task.getMilestone()),
        "critical": bool(task.getCritical()),
        "active": bool(task.getActive()),
        "manual": task.getTaskMode().name() == "MANUALLY_SCHEDULED",
        "external": bool(task.getExternalTask()),
        "marked": bool(task.getMarked()),
        "percent": int(percent) if percent is not None else 0,
    }


def _flag_matches(flag: str, props: dict) -> bool:
    """Evaluate one bar-style show-for flag against task properties.

    Unknown flags are treated as "pass" so styles that depend on data we do
    not import (warnings, placeholders, flags, rolled-up state, ...) can still
    match approximately.
    """
    match flag:
        case "NORMAL":
            return not props["summary"] and not props["milestone"]
        case "NOT_NORMAL":
            return props["summary"] or props["milestone"]
        case "MILESTONE":
            return props["milestone"]
        case "NOT_MILESTONE":
            return not props["milestone"]
        case "SUMMARY":
            return props["summary"]
        case "NOT_SUMMARY":
            return not props["summary"]
        case "PROJECTSUMMARY":
            return props["uid"] == 0
        case "CRITICAL":
            return props["critical"]
        case "NOT_CRITICAL":
            return not props["critical"]
        case "NONCRITICAL":
            return not props["critical"]
        case "ACTIVE":
            return props["active"]
        case "NOT_ACTIVE":
            return not props["active"]
        case "MANUALLYSCHEDULED":
            return props["manual"]
        case "NOT_MANUALLYSCHEDULED":
            return not props["manual"]
        case "EXTERNAL":
            return props["external"]
        case "NOT_EXTERNAL":
            return not props["external"]
        case "MARKED":
            return props["marked"]
        case "NOT_MARKED":
            return not props["marked"]
        case "FINISHED":
            return props["percent"] >= 100
        case "NOTSTARTED":
            return props["percent"] == 0
        case "INPROGRESS":
            return 0 < props["percent"] < 100
        case _:
            # Unknown positive/negative criteria are ignored.
            return True


def _style_matches(style: dict, props: dict) -> bool:
    return all(_flag_matches(flag, props) for flag in style["show"])


def extract_colors(input_path: str) -> dict[str, str | None]:
    """Return a mapping of task UID -> CSS hex color for MPP/MPT files."""
    suffix = Path(input_path).suffix.lower()
    if suffix == ".xml":
        return {}

    reader = mpxj.JClass("org.mpxj.reader.UniversalProjectReader")()
    project = reader.read(input_path)

    GanttChartView = mpxj.JClass("org.mpxj.mpp.GanttChartView")
    view = None
    views = project.getViews()
    for i in range(views.size()):
        candidate = views.get(i)
        if isinstance(candidate, GanttChartView) and candidate.getName() == "Gantt Chart":
            view = candidate
            break

    if view is None:
        return {}

    styles = []
    for s in view.getBarStyles():
        styles.append(
            {
                "id": s.getID(),
                "name": s.getName(),
                "show": [x.name() for x in s.getShowForTasks()],
                "color": _color_to_hex(s.getMiddleColor()),
            }
        )

    exceptions = {}
    for e in view.getBarStyleExceptions():
        sid = e.getGanttBarStyleID()
        uid = e.getTaskUniqueID()
        exceptions[(sid, uid)] = _color_to_hex(e.getMiddleColor())

    colors: dict[str, str | None] = {}
    for task in project.getTasks():
        props = _build_task_props(task)
        matched = None
        for style in styles:
            if _style_matches(style, props):
                matched = style
                break

        color = None
        if matched is not None:
            exc_color = exceptions.get((matched["id"], props["uid"]))
            color = exc_color if exc_color is not None else matched["color"]

        colors[str(props["uid"])] = color

    return colors


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: extract_project.py <input> <output.xml> <colors.json>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_xml = sys.argv[2]
    output_json = sys.argv[3]

    suffix = Path(input_path).suffix.lower()

    mpxj.startJVM()
    try:
        # Always produce the XML the rest of the app expects.
        if suffix == ".xml":
            shutil.copy(input_path, output_xml)
        else:
            from org.mpxj.sample import MpxjConvert

            MpxjConvert().process(input_path, output_xml)

        colors = extract_colors(input_path)
    finally:
        mpxj.shutdownJVM()

    Path(output_json).write_text(json.dumps(colors), encoding="utf-8")


if __name__ == "__main__":
    main()
