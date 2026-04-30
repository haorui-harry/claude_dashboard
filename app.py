"""Claude Code Dashboard - Light Theme, Collapsible, Better Fonts"""
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import dash
from dash import dcc, html, Input, Output, State, ALL, ctx
import plotly.graph_objects as go

CLAUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = CLAUDE_DIR / "projects"
TZ_OFFSET = timedelta(hours=8)

def parse_ts(ts):
    if not ts: return datetime.now(timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc) + TZ_OFFSET
    try:
        return datetime.fromisoformat(str(ts).rstrip("Z")).replace(tzinfo=timezone.utc) + TZ_OFFSET
    except:
        return datetime.now(timezone.utc)

def fmt_dur(ms):
    if ms < 0: return "—"
    s = ms / 1000
    if s < 60: return f"{s:.1f}s"
    m = int(s // 60)
    return f"{m}m {int(s % 60)}s" if m < 60 else f"{m // 60}h {m % 60}m"

KIND_STYLE = {
    "USER":      {"bg":"#dbeafe","color":"#1d4ed8","label":"User"},
    "THINK":     {"bg":"#ede9fe","color":"#7c3aed","label":"Think"},
    "SAY":       {"bg":"#d1fae5","color":"#065f46","label":"Say"},
    "BASH":      {"bg":"#fef3c7","color":"#b45309","label":"Bash"},
    "READ":      {"bg":"#e0f2fe","color":"#0369a1","label":"Read"},
    "WRITE":     {"bg":"#dcfce7","color":"#15803d","label":"Write"},
    "EDIT":      {"bg":"#f3e8ff","color":"#7e22ce","label":"Edit"},
    "WEBFETCH":  {"bg":"#fce7f3","color":"#be185d","label":"WebFetch"},
    "WEBSEARCH": {"bg":"#cffafe","color":"#0e7490","label":"WebSearch"},
    "RESULT":    {"bg":"#fff7ed","color":"#c2410c","label":"Result"},
    "AGENT":     {"bg":"#ccfbf1","color":"#0f766e","label":"Agent"},
}

def kind_style(k):
    return KIND_STYLE.get(k.upper(), {"bg":"#f1f5f9","color":"#475569","label":k})

# ── data loading ───────────────────────────────────────────────
def load_sessions():
    sessions = []
    if not PROJECTS_DIR.exists(): return sessions

    for jsonl in sorted(PROJECTS_DIR.rglob("*.jsonl")):
        sid = jsonl.stem
        events = []
        tool_results = {}

        with open(jsonl, encoding="utf-8") as f:
            lines = []
            for line in f:
                line = line.strip()
                if not line: continue
                try: lines.append(json.loads(line))
                except: pass

        # Pass 1: collect tool results
        for obj in lines:
            if obj.get("type") == "user":
                content = obj.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "tool_result":
                            tid = c.get("tool_use_id", "")
                            rc = c.get("content", "")
                            if isinstance(rc, list):
                                rc = rc[0].get("text","") if rc and isinstance(rc[0],dict) else str(rc[0]) if rc else ""
                            tool_results[tid] = str(rc)

        # Pass 2: build events
        for obj in lines:
            typ = obj.get("type")
            ts = parse_ts(obj.get("timestamp"))

            if typ == "user":
                if obj.get("isMeta"): continue
                content = obj.get("message", {}).get("content", "")
                if isinstance(content, list):
                    texts = [c.get("text","") for c in content if isinstance(c,dict) and c.get("type")=="text"]
                    content = " ".join(texts)
                content = str(content).strip()
                # Skip slash commands and command outputs
                if ("<command-name>" in content or "<local-command-stdout>" in content
                        or "<command-message>" in content):
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
                        # Skip meta/empty responses
                        if txt and txt not in ("No response requested.",):
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

        if not events: continue

        start = min(e["ts"] for e in events)
        end   = max(e["ts"] for e in events)
        dur_ms = (end - start).total_seconds() * 1000

        tool_counts = defaultdict(int)
        file_counts = defaultdict(int)
        for e in events:
            tool_counts[e["kind"]] += 1
            if e["kind"] in ("READ","WRITE","EDIT"):
                fp = e["content"].split()[0] if e["content"] else ""
                if fp and "/" in fp: file_counts[Path(fp).name] += 1

        first_user = next((e["content"] for e in events if e["kind"]=="USER"), "")
        search_text = " ".join(e["content"] for e in events if e["kind"] in ("USER","SAY")).lower()

        sessions.append({
            "id": sid,
            "start": start,
            "end": end,
            "dur_ms": dur_ms,
            "events": events,
            "tool_counts": dict(tool_counts),
            "file_counts": dict(file_counts),
            "first_msg": first_user,
            "total": len(events),
            "search_text": search_text[:3000],
        })

    sessions.sort(key=lambda s: s["end"], reverse=True)  # sort by last activity
    return sessions

# ── Dash app ──────────────────────────────────────────────────
app = dash.Dash(__name__, title="Claude Code Dashboard", suppress_callback_exceptions=True)

app.index_string = '''<!DOCTYPE html>
<html>
<head>{%metas%}<title>{%title%}</title>{%css%}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter','Segoe UI',system-ui,sans-serif; background:#f8fafc; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: #f1f5f9; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.sess-card:hover { background: #eff6ff !important; }
.filt-btn:hover { opacity: .85; }
.expand-btn:hover { background: #e2e8f0 !important; }
#search-input:focus { outline: none; border-color: #3b82f6 !important; }
</style>
</head>
<body>{%app_entry%}<footer>{%config%}{%scripts%}{%renderer%}</footer>
</body>
</html>'''

app.layout = html.Div([
    dcc.Store(id="sessions"),
    dcc.Store(id="sel-idx", data=0),
    dcc.Store(id="filter",  data="All"),
    dcc.Store(id="expanded", data=[]),
    dcc.Interval(id="refresh", interval=15000),

    # ── top bar ──
    html.Div([
        html.Span("⚡", style={"fontSize":"20px"}),
        html.Div("Claude Code Dashboard",
                 style={"fontSize":"17px","fontWeight":"700","color":"#0f172a","letterSpacing":"-.02em"}),
        html.Div(id="status-badge",
                 style={"marginLeft":"auto","display":"flex","alignItems":"center","gap":"8px"}),
    ], style={"display":"flex","alignItems":"center","gap":"14px","padding":"12px 20px",
              "background":"#fff","borderBottom":"1px solid #e2e8f0",
              "boxShadow":"0 1px 4px rgba(0,0,0,.06)","position":"sticky","top":"0","zIndex":"100"}),

    html.Div([
        # ── left: session list ──
        html.Div([
            html.Div([
                html.Div("SESSIONS",
                         style={"fontSize":"11px","fontWeight":"700","color":"#94a3b8",
                                "letterSpacing":".08em","marginBottom":"6px"}),
                dcc.Input(id="search-input", type="text", placeholder="搜索 session 内容或 ID...",
                          debounce=True,
                          style={"width":"100%","padding":"6px 10px","fontSize":"12px",
                                 "border":"1px solid #e2e8f0","borderRadius":"6px",
                                 "background":"#fff","color":"#1e293b","outline":"none"}),
            ], style={"padding":"10px 12px","borderBottom":"1px solid #e2e8f0"}),
            html.Div(id="session-list",
                     style={"overflowY":"auto","height":"calc(100vh - 140px)"}),
        ], style={"width":"240px","minWidth":"240px","background":"#f8fafc",
                  "borderRight":"1px solid #e2e8f0"}),

        # ── center: timeline ──
        html.Div([
            html.Div(id="filter-bar",
                     style={"padding":"10px 16px","borderBottom":"1px solid #e2e8f0",
                            "display":"flex","gap":"6px","flexWrap":"wrap","background":"#fff"}),
            html.Div(id="timeline",
                     style={"overflowY":"auto","height":"calc(100vh - 110px)","background":"#fff"}),
        ], style={"flex":"1","borderRight":"1px solid #e2e8f0","minWidth":"0"}),

        # ── right: summary ──
        html.Div(id="summary",
                 style={"width":"260px","minWidth":"260px","overflowY":"auto",
                        "height":"calc(100vh - 55px)","background":"#fff","padding":"14px",
                        "borderLeft":"1px solid #e2e8f0"}),
    ], style={"display":"flex","height":"calc(100vh - 55px)"}),
], style={"fontFamily":"'Inter','Segoe UI',system-ui,sans-serif","background":"#f8fafc","color":"#1e293b","minHeight":"100vh"})

# ── callbacks ─────────────────────────────────────────────────

@app.callback(Output("sessions","data"), Input("refresh","n_intervals"))
def refresh_sessions(_):
    sessions = load_sessions()
    for s in sessions:
        s["start"] = s["start"].isoformat()
        for e in s["events"]:
            e["ts"] = e["ts"].isoformat() if hasattr(e["ts"],"isoformat") else str(e["ts"])
    return sessions

@app.callback(
    Output("session-list","children"),
    Output("status-badge","children"),
    Input("sessions","data"),
    Input("search-input","value"),
    State("sel-idx","data"),
)
def render_list(sessions, query, sel):
    if not sessions:
        return [html.Div("No sessions", style={"color":"#94a3b8","padding":"20px","fontSize":"13px"})], []
    q = (query or "").strip().lower()
    rows = []
    for i, s in enumerate(sessions):
        if q and q not in s["id"].lower() and q not in s["first_msg"].lower() and q not in s.get("search_text",""):
            continue
        active = i == sel
        start_str = s["start"][5:16].replace("T"," ")
        rows.append(html.Div([
            html.Div([
                html.Span(start_str, style={"fontSize":"11px","color":"#64748b"}),
                html.Span(fmt_dur(s["dur_ms"]),
                          style={"fontSize":"11px","color":"#f59e0b","fontWeight":"700","marginLeft":"auto"}),
            ], style={"display":"flex","marginBottom":"4px"}),
            html.Div(
                (s["first_msg"][:55]+"…" if len(s["first_msg"])>55 else s["first_msg"]) or "(no message)",
                style={"fontSize":"12px","color":"#1e293b" if active else "#475569",
                       "lineHeight":"1.4","marginBottom":"4px","wordBreak":"break-word"}),
            html.Div(f"{s['total']} events", style={"fontSize":"10px","color":"#94a3b8"}),
        ],
        id={"type":"card","i":i}, n_clicks=0, className="sess-card",
        style={"borderLeft":f"3px solid {'#3b82f6' if active else 'transparent'}",
               "background":"#eff6ff" if active else "transparent",
               "padding":"10px 12px","cursor":"pointer",
               "borderBottom":"1px solid #e2e8f0","transition":"all .12s"}))
    if not rows:
        rows = [html.Div("无匹配结果", style={"color":"#94a3b8","padding":"20px","fontSize":"13px"})]
    badge = [
        html.Span("●", style={"color":"#10b981","fontSize":"12px"}),
        html.Span(f"{len(sessions)} sessions", style={"fontSize":"12px","color":"#64748b"}),
    ]
    return rows, badge

@app.callback(
    Output("sel-idx","data"),
    Input({"type":"card","i":ALL},"n_clicks"),
    State("sel-idx","data"),
    prevent_initial_call=True,
)
def select_session(clicks, cur):
    if not ctx.triggered or not any(clicks): return cur
    tid = ctx.triggered_id
    if isinstance(tid, dict): return tid.get("i", cur)
    import re
    m = re.search(r'"i":(\d+)', json.dumps(tid))
    return int(m.group(1)) if m else cur

@app.callback(
    Output("filter-bar","children"),
    Input("sessions","data"),
    Input("filter","data"),
    Input("sel-idx","data"),
)
def render_filter_bar(sessions, filt, idx):
    if not sessions or idx >= len(sessions): return []
    events = sessions[idx]["events"]
    order = ["All","USER","THINK","BASH","READ","WRITE","EDIT","WEBFETCH","WEBSEARCH","SAY","RESULT"]
    btns = []
    for k in order:
        cnt = len(events) if k=="All" else sum(1 for e in events if e["kind"]==k)
        if k != "All" and cnt == 0: continue
        active = k == filt
        st = kind_style(k)
        btns.append(html.Button(
            [html.Span(st["label"] if k!="All" else "All", style={"marginRight":"4px"}),
             html.Span(f"({cnt})", style={"opacity":".7","fontSize":"11px"})],
            id={"type":"filt","k":k}, n_clicks=0, className="filt-btn",
            style={"background":st["bg"] if active else "#f1f5f9",
                   "color":st["color"] if active else "#64748b",
                   "border":f"1.5px solid {st['color']}55" if active else "1.5px solid #e2e8f0",
                   "borderRadius":"6px","padding":"4px 12px","cursor":"pointer",
                   "fontSize":"12px","fontWeight":"600","transition":"all .12s"}))
    return btns

@app.callback(
    Output("filter","data"),
    Input({"type":"filt","k":ALL},"n_clicks"),
    State("filter","data"),
    prevent_initial_call=True,
)
def update_filter(clicks, cur):
    if not ctx.triggered or not any(clicks): return cur
    tid = ctx.triggered_id
    if isinstance(tid, dict): return tid.get("k", cur)
    import re
    m = re.search(r'"k":"([^"]+)"', json.dumps(tid))
    return m.group(1) if m else cur

@app.callback(
    Output("expanded","data"),
    Input({"type":"exp-btn","i":ALL},"n_clicks"),
    State("expanded","data"),
    prevent_initial_call=True,
)
def toggle_expand(clicks, expanded):
    if not ctx.triggered or not any(clicks): return expanded
    tid = ctx.triggered_id
    if isinstance(tid, dict):
        i = tid.get("i")
    else:
        import re
        m = re.search(r'"i":(\d+)', json.dumps(tid))
        i = int(m.group(1)) if m else None
    if i is None: return expanded
    expanded = list(expanded)
    if i in expanded: expanded.remove(i)
    else: expanded.append(i)
    return expanded

@app.callback(
    Output("timeline","children"),
    Input("sessions","data"),
    Input("filter","data"),
    Input("expanded","data"),
    Input("sel-idx","data"),
)
def render_timeline(sessions, filt, expanded, idx):
    if not sessions or idx >= len(sessions):
        return [html.Div("Select a session",
                         style={"color":"#94a3b8","padding":"40px","textAlign":"center","fontSize":"14px"})]
    events = sessions[idx]["events"]
    if filt != "All":
        events = [e for e in events if e["kind"] == filt]
    if not events:
        return [html.Div(f"No {filt} events",
                         style={"color":"#94a3b8","padding":"24px","fontSize":"13px"})]

    COLLAPSE_LEN = 300
    rows = []
    for ei, e in enumerate(events):
        kind = e["kind"]
        st = kind_style(kind)
        ts_str = e["ts"][11:19] if len(e["ts"]) > 18 else ""
        content = e.get("content","")
        is_result = kind == "RESULT"
        is_code   = kind in ("BASH","RESULT")
        is_think  = kind == "THINK"
        is_long   = len(content) > COLLAPSE_LEN
        is_expanded = ei in expanded

        if is_long and not is_expanded:
            shown = content[:COLLAPSE_LEN]
            exp_btn = html.Button(
                f"▼ Show more ({len(content)} chars)",
                id={"type":"exp-btn","i":ei}, n_clicks=0, className="expand-btn",
                style={"background":"#f1f5f9","border":"1px solid #e2e8f0","borderRadius":"4px",
                       "padding":"3px 10px","fontSize":"11px","color":"#64748b","cursor":"pointer",
                       "marginTop":"4px","display":"block","width":"100%","textAlign":"left"})
        elif is_long and is_expanded:
            shown = content
            exp_btn = html.Button(
                "▲ Show less",
                id={"type":"exp-btn","i":ei}, n_clicks=0, className="expand-btn",
                style={"background":"#f1f5f9","border":"1px solid #e2e8f0","borderRadius":"4px",
                       "padding":"3px 10px","fontSize":"11px","color":"#64748b","cursor":"pointer",
                       "marginTop":"4px","display":"block","width":"100%","textAlign":"left"})
        else:
            shown = content
            exp_btn = None

        pre_style = {
            "fontFamily":"'Consolas','Monaco','Courier New',monospace" if is_code else "inherit",
            "fontSize":"13px","lineHeight":"1.5",
            "color":"#c2410c" if is_result else "#7c3aed" if is_think else "#1e293b",
            "fontStyle":"italic" if is_think else "normal",
            "whiteSpace":"pre-wrap","wordBreak":"break-word","margin":"0",
            "background":"#fff7ed" if is_result else "#fafafa" if is_code else "transparent",
            "border":"1px solid #fed7aa" if is_result else "1px solid #f1f5f9" if is_code else "none",
            "borderRadius":"6px","padding":"8px 10px" if (is_code or is_result) else "0",
        }
        content_el = (html.Div([html.Pre(shown, style=pre_style), exp_btn])
                      if exp_btn else html.Pre(shown, style=pre_style))

        rows.append(html.Div([
            html.Div([
                html.Div(style={"width":"10px","height":"10px","borderRadius":"50%",
                                "background":st["color"],"border":f"2px solid {st['color']}44",
                                "marginTop":"2px","flexShrink":"0"}),
                html.Div(style={"width":"2px","background":"#f1f5f9","flex":"1","marginTop":"2px"}),
            ], style={"display":"flex","flexDirection":"column","alignItems":"center",
                      "width":"10px","marginRight":"12px",
                      "marginLeft":"24px" if is_result else "0"}),
            html.Div([
                html.Div([
                    html.Span(st["label"], style={
                        "background":st["bg"],"color":st["color"],
                        "padding":"2px 10px","borderRadius":"5px",
                        "fontSize":"11px","fontWeight":"700","letterSpacing":".02em"}),
                    html.Span(ts_str,
                              style={"color":"#94a3b8","fontSize":"11px","marginLeft":"8px"}),
                ], style={"marginBottom":"5px","display":"flex","alignItems":"center"}),
                content_el,
            ], style={"flex":"1","minWidth":"0","paddingBottom":"14px"}),
        ], style={"display":"flex","alignItems":"flex-start","padding":"10px 16px",
                  "borderBottom":"1px solid #f8fafc"}))
    return rows

@app.callback(
    Output("summary","children"),
    Input("sessions","data"),
    Input("sel-idx","data"),
)
def render_summary(sessions, idx):
    if not sessions or idx >= len(sessions): return []
    s = sessions[idx]

    def stat(label, val, color="#1e293b"):
        return html.Div([
            html.Span(label, style={"fontSize":"12px","color":"#64748b","flex":"1"}),
            html.Span(val, style={"fontSize":"12px","fontWeight":"700","color":color}),
        ], style={"display":"flex","justifyContent":"space-between",
                  "padding":"6px 0","borderBottom":"1px solid #f1f5f9"})

    def sec_title(t):
        return html.Div(t, style={"fontSize":"10px","fontWeight":"700","letterSpacing":".1em",
                                   "color":"#94a3b8","padding":"12px 0 6px",
                                   "borderBottom":"1px solid #e2e8f0","marginBottom":"6px"})

    tc = {k:v for k,v in s["tool_counts"].items() if k not in ("USER","THINK","SAY","RESULT")}
    if tc:
        labels = list(tc.keys()); values = list(tc.values())
        colors = [kind_style(l)["color"] for l in labels]
        fig = go.Figure(go.Pie(
            labels=labels, values=values, hole=0.65,
            marker={"colors":colors,"line":{"color":"#fff","width":2}},
            textinfo="none", hovertemplate="%{label}: %{value}<extra></extra>",
        ))
        fig.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                          margin=dict(t=4,b=4,l=4,r=4), height=150, showlegend=False)
        chart = dcc.Graph(figure=fig, config={"displayModeBar":False}, style={"height":"150px"})
        legend = [html.Div([
            html.Span("●", style={"color":kind_style(k)["color"],"marginRight":"5px","fontSize":"13px"}),
            html.Span(k, style={"fontSize":"11px","color":"#475569","flex":"1"}),
            html.Span(str(v), style={"fontSize":"11px","color":"#94a3b8","fontWeight":"600"}),
        ], style={"display":"flex","alignItems":"center","padding":"2px 0"})
        for k,v in tc.items()]
    else:
        chart = html.Div("No tools", style={"color":"#94a3b8","fontSize":"12px"})
        legend = []

    top_files = sorted(s["file_counts"].items(), key=lambda x:-x[1])[:8]
    if top_files:
        max_c = top_files[0][1]
        file_els = []
        for fname, cnt in top_files:
            pct = cnt / max_c * 100
            file_els.append(html.Div([
                html.Span(fname[:22], style={"fontSize":"11px","color":"#475569","flex":"1",
                                              "overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap"}),
                html.Span(str(cnt), style={"fontSize":"10px","color":"#94a3b8","marginLeft":"4px"}),
            ], style={"display":"flex","alignItems":"center","marginBottom":"1px"}))
            file_els.append(html.Div(
                html.Div(style={"height":"3px","background":"#3b82f6","borderRadius":"2px","width":f"{pct:.0f}%"}),
                style={"height":"3px","background":"#f1f5f9","borderRadius":"2px","marginBottom":"5px"}))
    else:
        file_els = [html.Div("No file accesses", style={"color":"#94a3b8","fontSize":"11px"})]

    return [
        sec_title("RUN STATUS"),
        stat("Duration", fmt_dur(s["dur_ms"]), "#f59e0b"),
        stat("Events",   str(s["total"])),
        stat("Thinking", str(s["tool_counts"].get("THINK",0)), "#7c3aed"),
        sec_title("TOOL USAGE"),
        chart,
        html.Div(legend, style={"marginTop":"4px"}),
        sec_title("TOP FILES"),
        *file_els,
    ]

if __name__ == "__main__":
    print("🚀 Dashboard → http://localhost:8999")
    app.run(host="0.0.0.0", port=8999, debug=False)
