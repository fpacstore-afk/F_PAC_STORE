"""Remove obsolete CI preview URLs without deleting revisions or changing traffic shares."""
import argparse
import json
import re
import subprocess


def preview_tags(service, keep_tag):
    return sorted({item["tag"] for item in service.get("status", {}).get("traffic", [])
                   if re.fullmatch(r"c-[0-9]+", item.get("tag", "")) and item["tag"] != keep_tag})


def routing_shares(service):
    shares = {}
    for item in service.get("status", {}).get("traffic", []):
        percent = item.get("percent", 0)
        if percent:
            revision = item.get("revisionName")
            if not revision:
                raise RuntimeError("Unresolved active revision; refusing preview cleanup")
            shares[revision] = shares.get(revision, 0) + percent
    if sum(shares.values()) != 100:
        raise RuntimeError("Unconfirmed traffic allocation; refusing preview cleanup")
    return shares


def cleanup(get_service, remove_tags, keep_tag):
    before = get_service()
    if not any(item.get("tag") == keep_tag for item in before.get("status", {}).get("traffic", [])):
        raise RuntimeError("Current candidate tag is missing; refusing preview cleanup")
    shares = routing_shares(before)
    tags = preview_tags(before, keep_tag)
    if tags:
        remove_tags(tags)
        after = get_service()
        if routing_shares(after) != shares:
            raise RuntimeError("Traffic allocation changed during preview cleanup")
        if preview_tags(after, keep_tag):
            raise RuntimeError("Obsolete CI preview tags remain")
    return {"removedPreviewTags": tags, "activeTrafficPreserved": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-tag", required=True)
    arguments = parser.parse_args()
    if not re.fullmatch(r"c-[0-9]+", arguments.keep_tag):
        raise RuntimeError("Expected current CI candidate tag")
    base = ["gcloud", "run", "services"]
    common = ["f-pac-store-n-o-s-roupa-identidade", "--project=fpac-store62", "--region=us-east1"]

    def get_service():
        result = subprocess.run(base + ["describe"] + common + ["--format=json"],
                                capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def remove_tags(tags):
        subprocess.run(base + ["update-traffic"] + common + ["--remove-tags=" + ",".join(tags), "--quiet"],
                       capture_output=True, text=True, check=True)

    print("PREVIEW_ACCESS_CLEANUP " + json.dumps(cleanup(get_service, remove_tags, arguments.keep_tag)))


if __name__ == "__main__":
    main()
