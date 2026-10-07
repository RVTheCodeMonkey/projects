import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from lxml import etree

from services import mpxj_service

MSPdi_NAMESPACE = mpxj_service.MSPdi_NAMESPACE
NSMAP = mpxj_service.NSMAP


def _to_iso_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(value, str):
        # If already ISO-like, return as-is; otherwise assume date and append time
        value = value.strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", value):
            return value
        if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
            return f"{value}T08:00:00"
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", value):
            return f"{value}:00"
    raise ValueError(f"Invalid datetime value: {value}")


def _format_duration_hours(hours: float) -> str:
    return f"PT{int(hours)}H0M0S"


def _set_child(parent: etree.Element, tag: str, value: Any) -> None:
    ns_tag = f"{{{MSPdi_NAMESPACE}}}{tag}"
    child = parent.find(ns_tag)
    if child is None:
        child = etree.SubElement(parent, ns_tag)
    child.text = str(value) if value is not None else ""


def _ensure_element(parent: etree.Element, tag: str) -> etree.Element:
    ns_tag = f"{{{MSPdi_NAMESPACE}}}{tag}"
    child = parent.find(ns_tag)
    if child is None:
        child = etree.SubElement(parent, ns_tag)
    return child


def create_blank_project_file(output_path: str, name: str) -> None:
    """Create a minimal MSPDI XML file with one starter task."""
    today = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    finish = today.replace(hour=17)

    ns = f"{{{MSPdi_NAMESPACE}}}"
    root = etree.Element(f"{ns}Project", nsmap={None: MSPdi_NAMESPACE})

    etree.SubElement(root, f"{ns}Name").text = name or "New project"
    etree.SubElement(root, f"{ns}ScheduleFromStart").text = "1"
    etree.SubElement(root, f"{ns}StartDate").text = today.strftime("%Y-%m-%dT%H:%M:%S")
    etree.SubElement(root, f"{ns}FinishDate").text = finish.strftime("%Y-%m-%dT%H:%M:%S")

    tasks_el = etree.SubElement(root, f"{ns}Tasks")
    task = etree.SubElement(tasks_el, f"{ns}Task")
    etree.SubElement(task, f"{ns}UID").text = "0"
    etree.SubElement(task, f"{ns}ID").text = "0"
    etree.SubElement(task, f"{ns}Name").text = "New task"
    etree.SubElement(task, f"{ns}OutlineLevel").text = "1"
    etree.SubElement(task, f"{ns}OutlineNumber").text = "1"
    etree.SubElement(task, f"{ns}Start").text = today.strftime("%Y-%m-%dT%H:%M:%S")
    etree.SubElement(task, f"{ns}Finish").text = finish.strftime("%Y-%m-%dT%H:%M:%S")
    etree.SubElement(task, f"{ns}Duration").text = "PT9H0M0S"
    etree.SubElement(task, f"{ns}ManualStart").text = today.strftime("%Y-%m-%dT%H:%M:%S")
    etree.SubElement(task, f"{ns}ManualFinish").text = finish.strftime("%Y-%m-%dT%H:%M:%S")
    etree.SubElement(task, f"{ns}PercentComplete").text = "0"
    etree.SubElement(task, f"{ns}PercentWorkComplete").text = "0"
    etree.SubElement(task, f"{ns}Milestone").text = "0"
    etree.SubElement(task, f"{ns}Summary").text = "0"

    etree.SubElement(root, f"{ns}Resources")
    etree.SubElement(root, f"{ns}Assignments")

    tree = etree.ElementTree(root)
    tree.write(output_path, xml_declaration=True, encoding="UTF-8", standalone=True)


def write_export(
    input_path: str,
    output_path: str,
    tasks: List[Dict[str, Any]],
    deleted_uids: Optional[List[str]] = None,
    row_labels: Optional[Dict[str, str]] = None,
) -> None:
    input_path = Path(input_path)
    suffix = input_path.suffix.lower()

    if suffix == ".xml":
        xml_path = str(input_path)
    else:
        tmp_xml = Path(output_path).with_suffix(".tmp.xml")
        mpxj_service.convert_to_xml(str(input_path), str(tmp_xml))
        xml_path = str(tmp_xml)

    tree = etree.parse(xml_path)
    root = tree.getroot()
    if root.tag == f"{{{MSPdi_NAMESPACE}}}Project" or root.tag.endswith("}Project") or root.tag == "Project":
        project = root
    else:
        project = root.find("m:Project", NSMAP)

    if project is None:
        raise ValueError("Invalid MSPDI XML: no Project element")

    tasks_el = _ensure_element(project, "Tasks")

    min_start: datetime | None = None
    max_finish: datetime | None = None

    ns_uid = f"{{{MSPdi_NAMESPACE}}}UID"
    ns_id = f"{{{MSPdi_NAMESPACE}}}ID"

    existing_by_uid: Dict[str, etree.Element] = {}
    max_id = 0
    for t in tasks_el.findall(f"{{{MSPdi_NAMESPACE}}}Task"):
        uid_el = t.find(ns_uid)
        if uid_el is not None and uid_el.text:
            existing_by_uid[uid_el.text] = t
        id_el = t.find(ns_id)
        if id_el is not None and id_el.text and id_el.text.isdigit():
            max_id = max(max_id, int(id_el.text))

    deleted_set = {str(x) for x in (deleted_uids or [])}
    for uid in deleted_set:
        task_el = existing_by_uid.get(uid)
        if task_el is not None:
            tasks_el.remove(task_el)
            existing_by_uid.pop(uid, None)

    for edit in tasks:
        uid = str(edit.get("uid"))
        if not uid:
            continue

        task_el = existing_by_uid.get(uid)
        is_new = task_el is None
        if is_new:
            task_el = etree.SubElement(tasks_el, f"{{{MSPdi_NAMESPACE}}}Task")
            _set_child(task_el, "UID", uid)
            max_id += 1
            _set_child(task_el, "ID", str(max_id))
            outline_level = edit.get("outline_level") or edit.get("OutlineLevel") or 1
            _set_child(task_el, "OutlineLevel", int(outline_level))
            outline_number = edit.get("outline_number") or edit.get("OutlineNumber") or str(max_id)
            _set_child(task_el, "OutlineNumber", outline_number)
            milestone = bool(edit.get("milestone") or edit.get("Milestone"))
            summary = bool(edit.get("summary") or edit.get("Summary"))
            _set_child(task_el, "Milestone", 1 if milestone else 0)
            _set_child(task_el, "Summary", 1 if summary else 0)

        name = edit.get("name")
        start = _to_iso_datetime(edit.get("start"))
        finish = _to_iso_datetime(edit.get("finish"))

        start_dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")
        finish_dt = datetime.strptime(finish, "%Y-%m-%dT%H:%M:%S")
        if finish_dt < start_dt:
            finish_dt = start_dt
            finish = start

        hours = max(0, int((finish_dt - start_dt).total_seconds() / 3600))
        duration = _format_duration_hours(hours)
        percent = int(edit.get("percent_complete", 0))

        if name is not None:
            _set_child(task_el, "Name", name)
        _set_child(task_el, "Start", start)
        _set_child(task_el, "Finish", finish)
        _set_child(task_el, "Duration", duration)
        _set_child(task_el, "ManualStart", start)
        _set_child(task_el, "ManualFinish", finish)
        _set_child(task_el, "PercentComplete", percent)
        _set_child(task_el, "PercentWorkComplete", percent)

        if min_start is None or start_dt < min_start:
            min_start = start_dt
        if max_finish is None or finish_dt > max_finish:
            max_finish = finish_dt

    if min_start is not None:
        _set_child(project, "StartDate", min_start.strftime("%Y-%m-%dT%H:%M:%S"))
    if max_finish is not None:
        _set_child(project, "FinishDate", max_finish.strftime("%Y-%m-%dT%H:%M:%S"))

    # Persist custom row labels inside the XML so they survive export/import.
    row_labels = row_labels or {}
    existing_row_labels = project.find(f"{{{MSPdi_NAMESPACE}}}RowLabels")
    if existing_row_labels is not None:
        project.remove(existing_row_labels)
    if row_labels:
        rl_el = etree.SubElement(project, f"{{{MSPdi_NAMESPACE}}}RowLabels")
        for outline_number, label in row_labels.items():
            if not label:
                continue
            rl = etree.SubElement(rl_el, f"{{{MSPdi_NAMESPACE}}}RowLabel")
            rl.set("OutlineNumber", str(outline_number))
            rl.text = label

    tree.write(output_path, xml_declaration=True, encoding="UTF-8", standalone=True)

    if suffix != ".xml" and tmp_xml.exists():
        tmp_xml.unlink()
