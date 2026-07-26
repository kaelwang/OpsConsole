#!/usr/bin/env python3
# Verify every .Values.<path> referenced in chart/templates/* exists in values.yaml.
# (Helm cannot run in this sandbox; this catches path typos structurally.)
import os, re, glob, sys
import yaml

ROOT = r"C:/Users/Eversec/WorkBuddy/2026-07-22-23-53-33"
TEMPLATES = os.path.join(ROOT, "chart", "templates")
VALUES = os.path.join(ROOT, "chart", "values.yaml")

with open(VALUES, encoding="utf-8") as f:
    values = yaml.safe_load(f)

# builtins always present at render time
BUILTINS = {"Release": ["Name", "Namespace", "Service", "Revision"],
            "Chart": ["Name", "Version", "AppVersion"]}

ref_re = re.compile(r"\.Values\.([A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*)")

def exists(path):
    cur = values
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return False
    return True

missing = []
checked = 0
for p in sorted(glob.glob(os.path.join(TEMPLATES, "*.yaml"))):
    with open(p, encoding="utf-8") as f:
        for line in f:
            for m in ref_re.findall(line):
                path = m[0]
                checked += 1
                if not exists(path):
                    missing.append((os.path.relpath(p, ROOT), path))

print(f"Checked {checked} .Values.* references across templates.")
if missing:
    print("MISSING REFERENCES:")
    for f, path in missing:
        print(f"  {f}: .Values.{path}")
    sys.exit(1)
else:
    print("ALL .Values.* references resolve against values.yaml.")
