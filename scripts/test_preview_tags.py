import copy
import sys
sys.dont_write_bytecode = True
from cleanup_preview_tags import cleanup, preview_tags

fixture = {"status": {"traffic": [
    {"revisionName": "active", "percent": 100},
    {"revisionName": "old", "tag": "c-1"},
    {"revisionName": "failed", "tag": "c-2", "percent": 0},
    {"revisionName": "candidate", "tag": "c-3"},
    {"revisionName": "external", "tag": "custom-preview"},
]}}
assert preview_tags(fixture, "c-3") == ["c-1", "c-2"]
state = copy.deepcopy(fixture)
removed = []


def remove_tags(tags):
    removed.extend(tags)
    state["status"]["traffic"] = [item for item in state["status"]["traffic"] if item.get("tag") not in tags]


result = cleanup(lambda: state, remove_tags, "c-3")
assert result == {"removedPreviewTags": ["c-1", "c-2"], "activeTrafficPreserved": True}
assert state["status"]["traffic"] == [fixture["status"]["traffic"][i] for i in [0, 3, 4]]
assert cleanup(lambda: state, remove_tags, "c-3")["removedPreviewTags"] == []
assert removed == ["c-1", "c-2"]

try:
    cleanup(lambda: {"status": {"traffic": []}}, lambda tags: (_ for _ in ()).throw(AssertionError("mutation")), "c-3")
    raise AssertionError("Unconfirmed routing must fail before changes")
except RuntimeError:
    pass

states = iter([fixture, {"status": {"traffic": [{"revisionName": "other", "percent": 100}]}}])
try:
    cleanup(lambda: next(states), lambda tags: None, "c-3")
    raise AssertionError("Concurrent traffic changes must fail verification")
except RuntimeError:
    pass
print("PASS obsolete CI preview URLs are removed, current/custom tags and active traffic preserved, repeat cleanup is idempotent, and unconfirmed routing fails closed.")
