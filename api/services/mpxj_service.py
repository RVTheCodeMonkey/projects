import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Dict, List, Any

from lxml import etree

MSPdi_NAMESPACE = "http://schemas.microsoft.com/project"
NSMAP = {"m": MSPdi_NAMESPACE}


def _extract_project(input_path: str, output_xml: str, output_json: str) -> None:
    """Convert a project file to MSPDI XML and extract per-task bar colors."""
    script = Path(__file__).resolve().parent.parent / "scripts" / "extract_project.py"
    subprocess.run(
        [sys.executable, str(script), input_path, output_xml, output_json],
        check=True,
        capture_output=True,
        text=True,
    )


def convert_to_xml(input_path: str, output_xml: str) -> None:
    """Convert a project file to MSPDI XML (no color extraction)."""
    script = Path(__file__).resolve().parent.parent / "scripts" / "convert_to_xml.py"
    subprocess.run(
        [sys.executable, str(script), input_path, output_xml],
        check=True,
        capture_output=True,
        text=True,
    )


def _parse_duration(value: str) -> Dict[str, Any]:
    if not value:
        return None
    # PT40H0M0S or P5D etc.
    value = value.upper()
    days = 0.0
    hours = 0.0
    minutes = 0.0
    if value.startswith("P"):
        rest = value[1:]
        if "T" in rest:
            date_part, time_part = rest.split("T")
        else:
            date_part, time_part = rest, ""
        if "D" in date_part:
            days = float(date_part.split("D")[0])
        if "H" in time_part:
            hours = float(time_part.split("H")[0])
        if "M" in time_part:
            parts = time_part.split("H")[-1].split("M")
            if parts[0]:
                minutes = float(parts[0])
    return {"iso": value, "days": days, "hours": hours, "minutes": minutes}


def _child_text(element: etree.Element, tag: str, default: Any = None) -> Any:
    child = element.find(f"m:{tag}", NSMAP)
    if child is None or child.text is None:
        return default
    return child.text


def parse_project_file(input_path: str) -> Dict[str, Any]:
    input_path = Path(input_path)
    suffix = input_path.suffix.lower()

    colors: Dict[str, str] = {}
    if suffix == ".xml":
        xml_path = str(input_path)
    else:
        tmp_xml = Path(tempfile.gettempdir()) / f"{uuid.uuid4().hex}.xml"
        tmp_json = Path(tempfile.gettempdir()) / f"{uuid.uuid4().hex}.json"
        try:
            _extract_project(str(input_path), str(tmp_xml), str(tmp_json))
            xml_path = str(tmp_xml)
            if tmp_json.exists():
                colors = json.loads(tmp_json.read_text(encoding="utf-8"))
        finally:
            # Temporary XML is removed after parsing below; JSON is removed here.
            if tmp_json.exists():
                tmp_json.unlink()

    try:
        tree = etree.parse(xml_path)
    finally:
        if suffix != ".xml":
            Path(xml_path).unlink(missing_ok=True)

    root = tree.getroot()
    if root.tag == f"{{{MSPdi_NAMESPACE}}}Project" or root.tag.endswith("}Project") or root.tag == "Project":
        project = root
    else:
        project = root.find("m:Project", NSMAP)
    if project is None:
        raise ValueError("Invalid MSPDI XML: no Project element")

    name = _child_text(project, "Name", input_path.stem)
    start_date = _child_text(project, "StartDate")
    finish_date = _child_text(project, "FinishDate")

    tasks: List[Dict[str, Any]] = []
    tasks_el = project.find("m:Tasks", NSMAP)
    if tasks_el is not None:
        for task in tasks_el.findall("m:Task", NSMAP):
            tasks.append({
                "uid": _child_text(task, "UID"),
                "id": _child_text(task, "ID"),
                "name": _child_text(task, "Name"),
                "outline_level": int(_child_text(task, "OutlineLevel", "0")),
                "outline_number": _child_text(task, "OutlineNumber"),
                "start": _child_text(task, "Start"),
                "finish": _child_text(task, "Finish"),
                "duration": _parse_duration(_child_text(task, "Duration")),
                "percent_complete": int(_child_text(task, "PercentComplete", "0")),
                "manual_start": _child_text(task, "ManualStart"),
                "manual_finish": _child_text(task, "ManualFinish"),
                "milestone": _child_text(task, "Milestone", "0") == "1",
                "summary": _child_text(task, "Summary", "0") == "1",
                "critical": _child_text(task, "Critical", "0") == "1",
                "constraint_type": _child_text(task, "ConstraintType"),
                "constraint_date": _child_text(task, "ConstraintDate"),
                "color": colors.get(_child_text(task, "UID")),
                "predecessors": [],
            })

    # Link predecessors
    for task in tasks:
        uid = task.get("uid")
        if not uid:
            continue
        task_el = tasks_el.find(f".//m:Task[m:UID='{uid}']", NSMAP)
        if task_el is None:
            continue
        preds = task_el.findall("m:PredecessorLink", NSMAP)
        for pred in preds:
            task["predecessors"].append({
                "uid": _child_text(pred, "PredecessorUID"),
                "type": _child_text(pred, "Type"),
                "link_lag": _child_text(pred, "LinkLag"),
            })

    resources: List[Dict[str, Any]] = []
    resources_el = project.find("m:Resources", NSMAP)
    if resources_el is not None:
        for res in resources_el.findall("m:Resource", NSMAP):
            resources.append({
                "uid": _child_text(res, "UID"),
                "id": _child_text(res, "ID"),
                "name": _child_text(res, "Name"),
            })

    assignments: List[Dict[str, Any]] = []
    assignments_el = project.find("m:Assignments", NSMAP)
    if assignments_el is not None:
        for asn in assignments_el.findall("m:Assignment", NSMAP):
            assignments.append({
                "uid": _child_text(asn, "UID"),
                "task_uid": _child_text(asn, "TaskUID"),
                "resource_uid": _child_text(asn, "ResourceUID"),
                "units": _child_text(asn, "Units"),
            })

    row_labels: Dict[str, str] = {}
    row_labels_el = project.find("m:RowLabels", NSMAP)
    if row_labels_el is not None:
        for rl in row_labels_el.findall("m:RowLabel", NSMAP):
            outline_number = rl.get("OutlineNumber")
            if outline_number:
                row_labels[str(outline_number)] = rl.text or ""

    return {
        "name": name,
        "start_date": start_date,
        "finish_date": finish_date,
        "tasks": tasks,
        "resources": resources,
        "assignments": assignments,
        "row_labels": row_labels,
    }


def merge_edited_data(parsed: dict, edited_data: dict | None) -> dict:
    """Overlay saved edits and created tasks onto freshly parsed project data."""
    if not edited_data:
        return parsed

    edited = edited_data.get("edited") or {}
    created = edited_data.get("created") or []
    deleted = {str(x) for x in (edited_data.get("deleted") or [])}

    result_tasks = []
    for task in parsed.get("tasks", []):
        uid = str(task.get("uid"))
        if uid in deleted:
            continue
        merged_task = dict(task)
        if uid in edited:
            for field in ("name", "start", "finish", "percent_complete", "color"):
                if field in edited[uid]:
                    merged_task[field] = edited[uid][field]
        result_tasks.append(merged_task)

    existing_uids = {str(t.get("uid")) for t in result_tasks if t.get("uid")}
    for task in created:
        uid = str(task.get("uid"))
        if uid and uid not in existing_uids and uid not in deleted:
            result_tasks.append(dict(task))
            existing_uids.add(uid)

    base_row_labels = parsed.get("row_labels") or {}
    edited_row_labels = edited_data.get("row_labels") or {}

    result = dict(parsed)
    result["tasks"] = result_tasks
    result["row_labels"] = {**base_row_labels, **edited_row_labels}
    return result
