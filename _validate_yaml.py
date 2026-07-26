#!/usr/bin/env python3
import sys, os, re, glob
import yaml

ROOT = r"C:/Users/Eversec/WorkBuddy/2026-07-22-23-53-33"

PURE_YAML = [
    os.path.join(ROOT, "chart", "Chart.yaml"),
    os.path.join(ROOT, "chart", "values.yaml"),
    os.path.join(ROOT, "docker-compose.yml"),
    os.path.join(ROOT, ".gitlab-ci.yml"),
]

TPL_GLOB = os.path.join(ROOT, "chart", "templates", "*.yaml")

TPL_LINE = re.compile(r"^\s*\{\{.*\}\}\s*$")          # whole-line template action
TPL_INLINE = re.compile(r"\{\{.*?\}\}")              # inline template action

def strip_template(text):
    out = []
    for line in text.splitlines():
        if TPL_LINE.fullmatch(line):
            continue
        out.append(TPL_INLINE.sub("X", line))
    return "\n".join(out)

results = []
def check(path, docs_iter):
    try:
        n = 0
        for _ in docs_iter:
            n += 1
        results.append((path, True, f"OK ({n} doc(s))", None))
    except Exception as e:
        results.append((path, False, "FAIL", str(e)))

print("=== PURE YAML (direct safe_load) ===")
for p in PURE_YAML:
    with open(p, "r", encoding="utf-8") as f:
        check(p, yaml.safe_load_all(f))

print("=== HELM TEMPLATES (strip {{ }} then safe_load) ===")
for p in sorted(glob.glob(TPL_GLOB)):
    with open(p, "r", encoding="utf-8") as f:
        txt = strip_template(f.read())
    check(p, yaml.safe_load_all(txt))

print()
all_ok = True
for path, ok, status, err in results:
    tag = "PASS" if ok else "FAIL"
    if not ok:
        all_ok = False
    name = os.path.relpath(path, ROOT)
    print(f"[{tag}] {name}  {status}")
    if err:
        print(f"        -> {err}")

print()
print("SUMMARY:", "ALL YAML VALID" if all_ok else "ERRORS FOUND")
sys.exit(0 if all_ok else 1)
