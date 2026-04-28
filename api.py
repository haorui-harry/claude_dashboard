"""Claude Code Dashboard - Flask JSON API"""
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Flask, jsonify

CLAUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = CLAUDE_DIR / "projects"
TZ_OFFSET = timedelta(hours=8)

app = Flask(__name__)

@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"] = "*"
    return r

# ── data loading ──────────────────────────────────────────────────
_events_cache: dict = {}  # sid -> events list

def _parse_ts(ts):
    if not ts: return datetime.now(timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc) + TZ_OFFSET
    try:
        return datetime.fromisoformat(str(ts).rstrip("Z")).replace(tzinfo=timezone.utc) + TZ_OFFSET
    except:
        return datetime.now(timezone.utc)

def _build_events(lines):
    events = []
    tool_results = {}
    for obj in lines:
        if obj.get("type") == "user":
            for c in (obj.get("message", {}).get("content", []) or []):
                if isinstance(c, dict) and c.get("type") == "tool_result":
                    tid = c.get("tool_use_id", "")
                    rc = c.get("content", "")
                    if isinstance(rc, list):
                        rc = rc[0].get("text","") if rc and isinstance(rc[0],dict) else str(rc[0]) if rc else ""
                    tool_results[tid] = str(rc)

    for obj in lines:
        typ = obj.get("type")
        ts = _parse_ts(obj.get("timestamp")).isoformat()
        if typ == "user":
            if obj.get("isMeta"): continue
            content = obj.get("message", {}).get("content", "")
            if isinstance(content, list):
                content = " ".join(c.get("text","") for c in content
                                   if isinstance(c,dict) and c.get("type")=="text")
            content = str(content).strip()
            # Skip slash commands and shell output injections
            if ("<command-name>" in content or "<local-command-stdout>" in content
                    or "<command-message>" in content or "<local-command-caveat>" in content):
                continue
            if content:
                events.append({"kind":"USER","ts":ts,"content":content})
        elif typ == "assistant":
            for c in obj.get("message", {}).get("content", []):
                ct = c.get("type","")
                if ct == "thinking":
                    events.append({"kind":"THINK","ts":ts,"content":c.get("thinking","")})
                elif ct == "text":
                    txt = c.get("text","").strip()
                    if txt and txt != "No response requested.":
                        events.append({"kind":"SAY","ts":ts,"content":txt})
                elif ct == "tool_use":
                    name = c.get("name","TOOL").upper()
                    tid = c.get("id","")
                    inp = c.get("input", {})
                    summary = (inp.get("command") or inp.get("file_path") or
                               inp.get("url") or inp.get("query") or str(inp))
                    events.append({"kind":name,"ts":ts,"content":str(summary),"tid":tid})
                    if tid in tool_results:
                        events.append({"kind":"RESULT","ts":ts,"content":tool_results[tid],"parent":name})
    return events

def _extract_model(lines):
    models = set()
    for obj in lines:
        if obj.get("type") == "assistant":
            m = obj.get("message", {}).get("model", "")
            if m and m != "<synthetic>":
                models.add(Path(m).name)
    return ", ".join(sorted(models))

def load_all():
    _events_cache.clear()
    meta = []
    if not PROJECTS_DIR.exists(): return meta
    for jsonl in sorted(PROJECTS_DIR.rglob("*.jsonl")):
        sid = jsonl.stem
        try:
            lines = []
            with open(jsonl, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try: lines.append(json.loads(line))
                        except: pass
            events = _build_events(lines)
        except Exception:
            continue
        if not events: continue
        _events_cache[sid] = events
        ts_list = [e["ts"] for e in events]
        start_str, end_str = min(ts_list), max(ts_list)
        dur_ms = (datetime.fromisoformat(end_str) - datetime.fromisoformat(start_str)).total_seconds() * 1000
        tool_counts: dict = defaultdict(int)
        file_counts: dict = defaultdict(int)
        for e in events:
            tool_counts[e["kind"]] += 1
            if e["kind"] in ("READ","WRITE","EDIT"):
                fp = e["content"].split()[0] if e["content"] else ""
                if fp and "/" in fp: file_counts[Path(fp).name] += 1
        first_user = next((e["content"] for e in events if e["kind"]=="USER"), "")
        search_text = " ".join(e["content"] for e in events if e["kind"] in ("USER","SAY")).lower()
        model = _extract_model(lines)
        meta.append({
            "id": sid, "start": start_str, "end": end_str, "dur_ms": dur_ms,
            "tool_counts": dict(tool_counts), "file_counts": dict(file_counts),
            "first_msg": first_user, "total": len(events),
            "search_text": search_text[:3000],
            "model": model,
        })
    meta.sort(key=lambda s: s["end"], reverse=True)  # sort by last activity
    return meta

# ── routes ────────────────────────────────────────────────────────
@app.route("/api/sessions")
def get_sessions():
    return jsonify(load_all())

@app.route("/api/sessions/<sid>/events")
def get_events(sid):
    if sid not in _events_cache:
        load_all()
    return jsonify(_events_cache.get(sid, []))

if __name__ == "__main__":
    print("🚀 API → http://localhost:8998")
    app.run(host="0.0.0.0", port=8998, debug=False)
