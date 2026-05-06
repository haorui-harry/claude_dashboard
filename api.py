"""Claude Code Dashboard - Flask JSON API"""
import json
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Flask, jsonify, request
from analyzer import analyze_jsonl, load_analysis_cache, save_analysis_cache, has_analysis_cache

SESSION_FILTER_CWD = os.getenv("SESSION_FILTER_CWD", "").rstrip("/")

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
_path_cache: dict = {}     # sid -> jsonl Path


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
                        rc_text = rc[0].get("text","") if rc and isinstance(rc[0],dict) else str(rc[0]) if rc else ""
                    else:
                        rc_text = str(rc)
                    tool_results[tid] = rc_text

    turn_index = 0
    has_seen_user = False
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
            if ("<command-name>" in content or "<local-command-stdout>" in content
                    or "<command-message>" in content or "<local-command-caveat>" in content):
                continue
            has_tool_result = any(isinstance(c, dict) and c.get("type") == "tool_result"
                                  for c in (obj.get("message", {}).get("content", []) or []))
            if content and not has_tool_result:
                if has_seen_user:
                    turn_index += 1
                has_seen_user = True
                events.append({"kind":"USER","ts":ts,"content":content,"turn_index":turn_index})
        elif typ == "assistant":
            for c in obj.get("message", {}).get("content", []):
                ct = c.get("type","")
                if ct == "thinking":
                    events.append({"kind":"THINK","ts":ts,"content":c.get("thinking",""),"turn_index":turn_index})
                elif ct == "text":
                    txt = c.get("text","").strip()
                    if txt and txt != "No response requested.":
                        events.append({"kind":"SAY","ts":ts,"content":txt,"turn_index":turn_index})
                elif ct == "tool_use":
                    name = c.get("name","TOOL").upper()
                    tid = c.get("id","")
                    inp = c.get("input", {})
                    summary = (inp.get("command") or inp.get("file_path") or
                               inp.get("url") or inp.get("query") or str(inp))
                    events.append({"kind":name,"ts":ts,"content":str(summary),"tid":tid,"turn_index":turn_index})
                    if tid in tool_results:
                        events.append({"kind":"RESULT","ts":ts,"content":tool_results[tid],"parent":name,"turn_index":turn_index})
    return events

def _extract_model(lines):
    models = set()
    for obj in lines:
        if obj.get("type") == "assistant":
            m = obj.get("message", {}).get("model", "")
            if m and m != "<synthetic>":
                models.add(Path(m).name)
    return ", ".join(sorted(models))

def load_all(force=False):
    if not force and getattr(load_all, "_meta_cache", None) is not None:
        return load_all._meta_cache
    _events_cache.clear()
    _path_cache.clear()
    meta = []
    if not PROJECTS_DIR.exists():
        load_all._meta_cache = meta
        return meta
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
            if SESSION_FILTER_CWD:
                cwds = set()
                for o in lines:
                    cwd = o.get("cwd", "")
                    if cwd:
                        cwds.add(cwd.rstrip("/"))
                if not any(cwd == SESSION_FILTER_CWD or cwd.startswith(SESSION_FILTER_CWD + "/") for cwd in cwds):
                    continue
            events = _build_events(lines)
        except Exception:
            continue
        if not events: continue
        _events_cache[sid] = events
        _path_cache[sid] = str(jsonl)
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
        search_text = (sid + " ").lower() + " ".join(e["content"] for e in events if e["kind"] in ("USER","SAY")).lower()
        model = _extract_model(lines)
        meta.append({
            "id": sid, "start": start_str, "end": end_str, "dur_ms": dur_ms,
            "tool_counts": dict(tool_counts), "file_counts": dict(file_counts),
            "first_msg": first_user, "total": len(events),
            "search_text": search_text[:3000],
            "model": model,
            "path": str(jsonl),
        })
    meta.sort(key=lambda s: s["end"], reverse=True)  # sort by last activity
    load_all._meta_cache = meta
    return meta

# ── routes ────────────────────────────────────────────────────────
@app.route("/api/sessions")
def get_sessions():
    return jsonify(load_all(force=request.args.get("refresh", "").lower() in ("1", "true")))

@app.route("/api/sessions/<sid>/events")
def get_events(sid):
    if sid not in _events_cache:
        load_all()
    return jsonify(_events_cache.get(sid, []))

@app.route("/api/sessions/<sid>", methods=["DELETE"])
def delete_session(sid):
    """Delete a session trajectory file (.jsonl). Only removes the JSONL file itself."""
    try:
        for jsonl in PROJECTS_DIR.rglob("*.jsonl"):
            if jsonl.stem == sid:
                jsonl.unlink()
                _events_cache.pop(sid, None)
                load_all._meta_cache = None  # invalidate cache
                return jsonify({"success": True})
        return jsonify({"success": False, "error": "Session not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/sessions/<sid>/analyze", methods=["GET", "POST"])
def analyze_session(sid):
    if sid not in _path_cache:
        load_all()
    path = _path_cache.get(sid)
    if not path or not Path(path).exists():
        return jsonify({"error": "Session file not found"}), 404

    path_obj = Path(path)

    # GET — return cache status
    if request.method == "GET":
        cached = has_analysis_cache(path_obj)
        if cached:
            cache_path = path_obj.with_suffix(".analysis.json")
            mtime = cache_path.stat().st_mtime
            return jsonify({"cached": True, "cachedAt": mtime})
        return jsonify({"cached": False})

    # POST — check force param
    force = request.args.get("force", "false").lower() == "true"

    if not force:
        cached = load_analysis_cache(path_obj)
        if cached is not None:
            cached["_from_cache"] = True
            return jsonify(cached)

    try:
        result = analyze_jsonl(path_obj)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("🚀 API → http://localhost:8998")
    load_all()
    app.run(host="0.0.0.0", port=8998, debug=False, threaded=True)
