import sys
import pytest
from pathlib import Path

# Ensure /app is on sys.path so tests can import project modules.
APP_ROOT = Path(__file__).parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).parent / "fixtures"
