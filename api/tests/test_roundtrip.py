import sys
import tempfile
from pathlib import Path

# Make project root importable inside the test container.
APP_ROOT = Path(__file__).parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from services import mpxj_service, xml_writer


def test_roundtrip_preserves_edits_and_flags(fixtures_dir: Path):
    sample = fixtures_dir / "sample.xml"
    parsed = mpxj_service.parse_project_file(str(sample))
    tasks = parsed["tasks"]

    by_uid = {str(t["uid"]): t for t in tasks}
    assert by_uid["2"]["milestone"] is True
    assert by_uid["3"]["summary"] is True
    assert by_uid["4"]["critical"] is True

    edited_data = {
        "edited": {
            "1": {
                "name": "Renamed normal task",
                "percent_complete": 75,
                "critical": True,
            },
            "2": {"milestone": False},
            "4": {"critical": False},
        },
        "created": [],
        "deleted": [],
        "row_labels": {"1": "Custom row label"},
    }

    merged = mpxj_service.merge_edited_data(parsed, edited_data)

    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "out.xml"
        xml_writer.write_export(
            str(sample),
            str(output),
            merged["tasks"],
            deleted_uids=[],
            row_labels=merged["row_labels"],
        )
        roundtrip = mpxj_service.parse_project_file(str(output))

    rt_by_uid = {str(t["uid"]): t for t in roundtrip["tasks"]}
    assert len(rt_by_uid) == 5

    assert rt_by_uid["1"]["name"] == "Renamed normal task"
    assert rt_by_uid["1"]["percent_complete"] == 75
    assert rt_by_uid["1"]["critical"] is True

    assert rt_by_uid["2"]["milestone"] is False
    assert rt_by_uid["3"]["summary"] is True
    assert rt_by_uid["4"]["critical"] is False

    assert roundtrip["row_labels"].get("1") == "Custom row label"
