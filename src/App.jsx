import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// CLAUDE API  —  通过 /api/claude 代理，Key 安全隐藏在服务器
// ─────────────────────────────────────────────────────────────
async function claudeCall(messages, system = "", signal = null) {
  const res = await fetch("/api/claude", {          // ← 走代理，不暴露 Key
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.[0]?.text || "";
}

async function apiTranslate(text, signal) {
  const isEnglish = /^[a-zA-Z\s\-'.]+$/.test(text.trim());
  const system = `你是专业英汉词典。只返回JSON，禁止任何其他文字或markdown代码块。

JSON结构：
{
  "word": "原始输入",
  "isEnglish": true或false,
  "isWord": true（单词/短语）或false（句子）,
  "translation": "主要翻译",
  "phonetic": "国际音标，仅英文单词填写，否则空字符串",
  "pos": "词性如adj./n./v.，句子为空字符串",
  "definitions": [{"pos":"词性","meaning":"释义"}],
  "examples": [{"en":"英文例句","zh":"中文翻译"}]
}

规则：单词给完整词典信息(1-2条definitions和examples)；句子isWord=false，translation给完整翻译；中文给英文翻译。`;

  const raw = await claudeCall(
    [{ role: "user", content: `翻译：${text}` }],
    system,
    signal
  );
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      word: text.trim(), isEnglish, isWord: false,
      translation: raw.slice(0, 200), phonetic: "", pos: "",
      definitions: [], examples: [],
    };
  }
}

function buildChatSystem(vocabWords, mode) {
  const wordList = vocabWords.length
    ? `用户生词本练习词汇：${vocabWords.slice(0, 30).map(w => `${w.word}（${w.translation}）`).join("、")}`
    : "用户暂无生词本词汇。";

  const modeInstructions = {
    free:    "进行自由轻松的英语对话，话题不限。",
    vocab:   "每次回复自然地用到用户生词本中1-2个词汇，引导用户在对话中练习这些词。",
    scene:   "扮演真实场景角色（咖啡店店员、公司同事、面试官等），用情境对话帮用户练习实际场景英语，每次回复先说明当前场景。",
    correct: "用户提交中文或有语法错误的英文，分析问题、给出纠正后的地道表达并解释原因，语气友好像语言老师。",
  };

  return `你是 MyEnglish 的 AI 英语学习助手。${wordList}

当前模式：${modeInstructions[mode] || modeInstructions.free}

核心规则：
1. 支持中英文混合对话，根据用户输入语言灵活切换
2. 回复中用到生词本词汇时，用**双星号**包裹（如 **ephemeral**），方便前端高亮显示
3. 语气自然友好，像聊天而非课堂
4. 回复长度适中，不要过长
5. 如果用户在输入中正确使用了生词本词汇，在回复末尾加 🏆 并指出`;
}

// ─────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────
const SEED = [
  { id:1,  word:"ephemeral",   phonetic:"/ɪˈfem.ər.əl/",      pos:"adj.", translation:"短暂的，瞬息的",         definitions:[{pos:"adj.",meaning:"短暂的，瞬息的；朝生暮死的"}],         examples:[{en:"Fame in the digital age is often ephemeral.",zh:"数字时代的名气往往转瞬即逝。"}],             level:"learning", tags:["文学","高频"], source:"auto",   addedAt:"2026-02-20T10:00:00Z", reviewCount:3, lastReviewedAt:"2026-02-24T10:00:00Z" },
  { id:2,  word:"serendipity", phonetic:"/ˌser.ənˈdɪp.ɪ.ti/", pos:"n.",   translation:"意外发现美好事物的能力", definitions:[{pos:"n.",meaning:"意外惊喜；偶然发现好事物的天赋"}],        examples:[{en:"It was pure serendipity that we met.",zh:"我们的相遇纯属美丽的意外。"}],                 level:"mastered", tags:["文学"],        source:"manual", addedAt:"2026-02-15T08:30:00Z", reviewCount:7, lastReviewedAt:"2026-02-26T08:00:00Z" },
  { id:3,  word:"ubiquitous",  phonetic:"/juːˈbɪk.wɪ.təs/",   pos:"adj.", translation:"无处不在的；普遍存在的", definitions:[{pos:"adj.",meaning:"似乎无处不在的；十分普遍的"}],          examples:[{en:"Smartphones have become ubiquitous.",zh:"智能手机已无处不在。"}],                         level:"learning", tags:["科技","高频"], source:"auto",   addedAt:"2026-02-22T14:20:00Z", reviewCount:2, lastReviewedAt:"2026-02-25T14:00:00Z" },
  { id:4,  word:"pragmatic",   phonetic:"/præɡˈmæt.ɪk/",       pos:"adj.", translation:"务实的；注重实际的",     definitions:[{pos:"adj.",meaning:"注重实际效果的；讲求实用的"}],         examples:[{en:"We need a pragmatic approach.",zh:"我们需要务实的方法。"}],                               level:"learning", tags:["工作","高频"], source:"auto",   addedAt:"2026-02-23T09:10:00Z", reviewCount:1, lastReviewedAt:null },
  { id:5,  word:"meticulous",  phonetic:"/məˈtɪk.jə.ləs/",     pos:"adj.", translation:"一丝不苟的；细致入微的", definitions:[{pos:"adj.",meaning:"极为注意细节的；谨小慎微的"}],         examples:[{en:"She is meticulous about her research.",zh:"她对研究工作一丝不苟。"}],                     level:"new",      tags:["学术"],        source:"import", addedAt:"2026-02-24T11:45:00Z", reviewCount:0, lastReviewedAt:null },
  { id:6,  word:"resilient",   phonetic:"/rɪˈzɪl.i.ənt/",      pos:"adj.", translation:"有弹性的；能快速恢复的", definitions:[{pos:"adj.",meaning:"能很快恢复的；有复原力的"}],            examples:[{en:"Children are surprisingly resilient.",zh:"孩子们的适应力出人意料地强。"}],               level:"learning", tags:["励志","高频"], source:"auto",   addedAt:"2026-02-18T13:30:00Z", reviewCount:4, lastReviewedAt:"2026-02-23T10:00:00Z" },
  { id:7,  word:"eloquent",    phonetic:"/ˈel.ə.kwənt/",        pos:"adj.", translation:"口才流利的；有说服力的", definitions:[{pos:"adj.",meaning:"能言善辩的；雄辩的"}],                 examples:[{en:"He gave an eloquent speech.",zh:"他发表了一篇雄辩的演讲。"}],                           level:"mastered", tags:["工作","学术"], source:"manual", addedAt:"2026-02-10T16:00:00Z", reviewCount:5, lastReviewedAt:"2026-02-27T08:00:00Z" },
  { id:8,  word:"tenacious",   phonetic:"/təˈneɪ.ʃəs/",         pos:"adj.", translation:"坚韧不拔的；顽强的",     definitions:[{pos:"adj.",meaning:"坚持不懈的；固执的"}],                 examples:[{en:"Her tenacious spirit helped her succeed.",zh:"她坚韧不拔的精神帮助她成功了。"}],         level:"new",      tags:["励志"],        source:"import", addedAt:"2026-02-24T11:45:00Z", reviewCount:0, lastReviewedAt:null },
  { id:9,  word:"articulate",  phonetic:"/ɑːˈtɪk.jə.lət/",     pos:"adj./v.", translation:"表达清晰的；清楚地表达", definitions:[{pos:"adj.",meaning:"表达清晰的"},{pos:"v.",meaning:"清楚地表达想法"}], examples:[{en:"She is very articulate.",zh:"她表达非常清晰。"}], level:"mastered", tags:["工作"], source:"manual", addedAt:"2026-02-08T10:00:00Z", reviewCount:9, lastReviewedAt:"2026-02-26T10:00:00Z" },
  { id:10, word:"paradigm",    phonetic:"/ˈpær.ə.daɪm/",        pos:"n.",   translation:"范式；典范；模式",       definitions:[{pos:"n.",meaning:"思想体系的范式；典型例子"}],              examples:[{en:"This represents a paradigm shift.",zh:"这代表了一次范式转变。"}],                       level:"learning", tags:["科技","学术"], source:"auto",   addedAt:"2026-02-21T15:00:00Z", reviewCount:2, lastReviewedAt:"2026-02-25T10:00:00Z" },
];

const ALL_TAGS    = ["全部","高频","工作","学术","文学","科技","励志"];
const LEVEL_META  = {
  new:      { label:"未学习", color:"#64748B", bg:"#F1F5F9", dot:"#CBD5E1" },
  learning: { label:"学习中", color:"#D97706", bg:"#FEF3C7", dot:"#FBBF24" },
  mastered: { label:"已掌握", color:"#059669", bg:"#D1FAE5", dot:"#34D399" },
};

function uid()       { return Date.now() + Math.random(); }
function fmtDate(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso)) / 86400000;
  if (diff < 1) return "今天"; if (diff < 2) return "昨天";
  if (diff < 7) return `${Math.floor(diff)}天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month:"short", day:"numeric" });
}

async function stLoad(key, fb) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; }
}
async function stSave(key, v) {
  try { await window.storage.set(key, JSON.stringify(v)); } catch {}
}

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const C = {
  bg:"#F7F5F1", surface:"#FFFFFF", surface2:"#EEEAE3",
  ink:"#1A1612", ink2:"#6B6560", ink3:"#A09A94",
  blue:"#1D4ED8", blueLight:"#DBEAFE",
  gold:"#B45309", goldLight:"#FEF3C7",
  green:"#047857", greenLight:"#D1FAE5",
  red:"#B91C1C", redLight:"#FEE2E2",
  border:"rgba(26,22,18,0.1)",
};

// ─────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────
function GStyle() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { display: none; } * { scrollbar-width: none; }
    html, body, #root { height: 100%; background: ${C.bg}; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    @keyframes fadeUp   { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
    @keyframes spin     { to { transform: rotate(360deg) } }
    @keyframes pulse    { 0%,100% { opacity:1 } 50% { opacity:.2 } }
    @keyframes toastIn  { from { opacity:0; transform:translateX(-50%) translateY(14px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
    @keyframes shimmer  { 0% { background-position:-400px 0 } 100% { background-position:400px 0 } }
    .card-hover { transition: border-color .15s, box-shadow .15s, transform .15s; }
    .card-hover:hover { border-color:#BFDBFE!important; box-shadow:0 4px 18px rgba(29,78,216,.08); transform:translateY(-1px); }
    .btn-press:active { transform: scale(.97); }
    input:focus, textarea:focus { outline:none; border-color:${C.blue}!important; box-shadow:0 0 0 3px rgba(29,78,216,.1); }
    button { -webkit-tap-highlight-color: transparent; font-family: inherit; }
    ::placeholder { color: rgba(160,154,148,.7); }
  `}</style>;
}

// ─────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────
const Chip = ({ ch, color=C.ink2, bg=C.surface2, active, onClick, sm }) => (
  <span onClick={onClick} style={{ display:"inline-flex", alignItems:"center", padding:sm?"2px 8px":"3px 10px", borderRadius:100, fontSize:sm?10:11, fontWeight:700, background:active?color:bg, color:active?"#fff":color, cursor:onClick?"pointer":"default", transition:"all .15s", userSelect:"none", border:`1.5px solid ${active?color:"transparent"}`, flexShrink:0 }}>
    {ch}
  </span>
);

const Btn = ({ ch, onClick, v="primary", sz="md", disabled, full, sx={} }) => {
  const sizes = { sm:{fontSize:12,padding:"7px 14px",borderRadius:10}, md:{fontSize:13,padding:"11px 20px",borderRadius:12}, lg:{fontSize:14,padding:"13px 24px",borderRadius:14} };
  const variants = {
    primary: { background:C.ink,       color:"#fff",  boxShadow:"0 2px 8px rgba(26,22,18,.2)" },
    blue:    { background:C.blue,      color:"#fff",  boxShadow:"0 2px 10px rgba(29,78,216,.3)" },
    sec:     { background:C.surface2,  color:C.ink,   border:`1px solid ${C.border}` },
    ghost:   { background:"transparent", color:C.blue, border:`1px solid #BFDBFE` },
    danger:  { background:C.redLight,  color:C.red },
    success: { background:C.greenLight,color:C.green },
  };
  return (
    <button className="btn-press" onClick={onClick} disabled={disabled}
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, border:"none", cursor:disabled?"not-allowed":"pointer", opacity:disabled?.45:1, width:full?"100%":"auto", fontFamily:"inherit", fontWeight:600, transition:"all .15s", ...sizes[sz], ...variants[v], ...sx }}>
      {ch}
    </button>
  );
};

function Spinner({ light, sm }) {
  const s = sm ? 12 : 14;
  return <span style={{ display:"inline-block", width:s, height:s, border:`2px solid ${light?"rgba(255,255,255,.3)":C.border}`, borderTopColor:light?"white":C.ink2, borderRadius:"50%", animation:"spin .7s linear infinite" }} />;
}

function SkeletonLine({ w="100%", h=14, r=6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#e8e4de 25%,#f2ede8 50%,#e8e4de 75%)", backgroundSize:"800px 100%", animation:"shimmer 1.4s ease infinite" }} />;
}

function Toast({ msg, type="info" }) {
  const bg = { success:C.green, info:C.ink, warn:C.gold, danger:C.red }[type] || C.ink;
  return (
    <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:bg, color:"white", borderRadius:14, padding:"11px 20px", fontSize:13, fontWeight:500, zIndex:999, boxShadow:"0 8px 28px rgba(0,0,0,.22)", animation:"toastIn .25s ease", whiteSpace:"nowrap", maxWidth:340 }}>
      {msg}
    </div>
  );
}

function BkBtn({ onClick, label="←" }) {
  return <button onClick={onClick} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.ink3, padding:4, display:"flex", alignItems:"center", justifyContent:"center", width:36, height:36, borderRadius:10, fontFamily:"inherit" }}>{label}</button>;
}

function Sec({ title, children }) {
  return <div style={{ marginBottom:16 }}><div style={{ fontSize:11, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.8, marginBottom:8 }}>{title}</div>{children}</div>;
}

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]   = useState("translate");
  const [vocab, setVocab] = useState(SEED);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => { stLoad("me-vocab-v4", SEED).then(v => setVocab(v)); }, []);

  const persist = useCallback((next) => { setVocab(next); stSave("me-vocab-v4", next); }, []);

  const showToast = useCallback((msg, type="info") => {
    clearTimeout(toastRef.current);
    setToast({ msg, type, id:Date.now() });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const addToVocab = useCallback((entry) => {
    if (!entry?.word) return false;
    const exists = vocab.find(v => v.word.toLowerCase() === entry.word.toLowerCase());
    if (exists) { showToast(`「${entry.word}」已在生词本 ✓`); return false; }
    const w = { id:uid(), word:entry.word, phonetic:entry.phonetic||"", pos:entry.pos||"", translation:entry.translation||"", definitions:entry.definitions||[], examples:entry.examples||[], level:"new", tags:[], source:"auto", addedAt:new Date().toISOString(), reviewCount:0, lastReviewedAt:null };
    persist([w, ...vocab]);
    showToast(`📌 「${entry.word}」已加入生词本`, "success");
    return true;
  }, [vocab, persist, showToast]);

  const TABS = [
    { id:"translate", icon:"🔤", label:"翻译" },
    { id:"vocab",     icon:"📚", label:"生词本" },
    { id:"plan",      icon:"📅", label:"今日" },
    { id:"chat",      icon:"💬", label:"对话" },
  ];

  return (
    <div style={{ maxWidth:430, minHeight:"100dvh", margin:"0 auto", background:C.bg, display:"flex", flexDirection:"column", fontFamily:"'Plus Jakarta Sans',sans-serif", color:C.ink }}>
      <GStyle />
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden" }}>
        {tab==="translate" && <TranslateTab vocab={vocab} addToVocab={addToVocab} showToast={showToast} />}
        {tab==="vocab"     && <VocabTab     vocab={vocab} persist={persist}        showToast={showToast} />}
        {tab==="plan"      && <PlanTab      vocab={vocab} persist={persist}        showToast={showToast} />}
        {tab==="chat"      && <ChatTab      vocab={vocab}                          showToast={showToast} />}
      </div>
      <nav style={{ position:"sticky", bottom:0, background:"rgba(247,245,241,.95)", backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`, display:"flex", zIndex:50 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"9px 0 12px", border:"none", background:"transparent", cursor:"pointer" }}>
            <span style={{ fontSize:22, lineHeight:1, transform:tab===t.id?"scale(1.15)":"scale(1)", transition:"transform .2s" }}>{t.icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color:tab===t.id?C.blue:C.ink3, transition:"color .15s" }}>{t.label}</span>
            {tab===t.id && <div style={{ position:"absolute", bottom:0, width:20, height:3, borderRadius:2, background:C.blue }} />}
          </button>
        ))}
      </nav>
      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1 — TRANSLATE
// ═══════════════════════════════════════════════════════════
function TranslateTab({ vocab, addToVocab, showToast }) {
  const [input, setInput]   = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [history, setHistory] = useState([]);
  const [dir, setDir]       = useState("en→zh");
  const abortRef = useRef(null);
  const taRef    = useRef(null);

  useEffect(() => { stLoad("me-hist-v2", []).then(h => setHistory(h)); }, []);

  const doTranslate = async () => {
    const q = input.trim();
    if (!q) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setResult(null); setError(null);
    try {
      const data = await apiTranslate(q, abortRef.current.signal);
      setResult(data);
      const newH = [{ word:data.word||q, translation:data.translation, time:new Date().toISOString() }, ...history.slice(0,39)];
      setHistory(newH); stSave("me-hist-v2", newH);
      if (data.isWord && data.isEnglish) setTimeout(() => addToVocab(data), 500);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "翻译失败，请重试");
    }
    setLoading(false);
  };

  const inVocab = result && vocab.find(v => v.word.toLowerCase() === result.word?.toLowerCase());

  return (
    <div style={{ paddingBottom:24 }}>
      <div style={{ background:"linear-gradient(155deg,#0D1F3C 0%,#1E3A8A 100%)", padding:"52px 20px 24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(147,197,253,.6)", letterSpacing:1.2, textTransform:"uppercase", marginBottom:5 }}>MY ENGLISH · 翻译</div>
            <h1 style={{ fontFamily:"'Lora',serif", fontSize:28, color:"#fff", lineHeight:1 }}>查词翻译</h1>
          </div>
          <button onClick={() => setDir(d => d==="en→zh"?"zh→en":"en→zh")}
            style={{ display:"flex", alignItems:"center", gap:7, background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)", borderRadius:100, padding:"6px 14px", cursor:"pointer", color:"white", fontSize:12, fontWeight:700 }}>
            <span style={{ opacity:.7 }}>{dir==="en→zh"?"EN":"中"}</span>
            <span>⇄</span>
            <span style={{ opacity:.7 }}>{dir==="en→zh"?"中":"EN"}</span>
          </button>
        </div>
        <div style={{ background:"rgba(255,255,255,.08)", border:"1.5px solid rgba(255,255,255,.15)", borderRadius:18, padding:16 }}>
          <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); doTranslate(); } }}
            placeholder={dir==="en→zh"?"输入英文单词或句子 (Enter 翻译)…":"输入中文词语或句子 (Enter 翻译)…"}
            rows={2} style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:"white", fontSize:19, fontFamily:"'Lora',serif", resize:"none", lineHeight:1.45 }} />
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={doTranslate} disabled={loading||!input.trim()}
              style={{ flex:1, padding:"10px 0", borderRadius:12, border:"1px solid rgba(255,255,255,.25)", background:loading||!input.trim()?"rgba(255,255,255,.07)":"rgba(255,255,255,.18)", color:"white", fontSize:13, fontWeight:700, cursor:loading||!input.trim()?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all .15s" }}>
              {loading ? <><Spinner light sm /> 翻译中…</> : "🔍 翻译"}
            </button>
            {input && <button onClick={() => { setInput(""); setResult(null); setError(null); taRef.current?.focus(); }}
              style={{ width:42, height:42, borderRadius:12, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", color:"rgba(255,255,255,.7)", cursor:"pointer", fontSize:16 }}>✕</button>}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ margin:"16px 16px 0", background:C.surface, borderRadius:20, border:`1px solid ${C.border}`, padding:20 }}>
          <SkeletonLine w="55%" h={28} r={8} />
          <div style={{ marginTop:8 }}><SkeletonLine w="30%" h={14} r={5} /></div>
          <div style={{ marginTop:14, display:"flex", gap:8 }}><SkeletonLine w={44} h={22} r={11} /><SkeletonLine w={60} h={22} r={11} /></div>
          <div style={{ marginTop:14 }}><SkeletonLine h={16} /><div style={{marginTop:6}}><SkeletonLine w="80%" h={16}/></div></div>
          <div style={{ marginTop:12, background:C.bg, borderRadius:10, padding:12 }}><SkeletonLine h={14}/><div style={{marginTop:5}}><SkeletonLine w="60%" h={12}/></div></div>
        </div>
      )}

      {error && (
        <div style={{ margin:"16px 16px 0", background:C.redLight, borderRadius:16, padding:"14px 16px", border:`1px solid rgba(185,28,28,.2)`, color:C.red, fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}

      {result && !loading && (
        <div style={{ margin:"16px 16px 0", animation:"fadeUp .3s ease" }}>
          <div style={{ background:C.surface, borderRadius:20, border:`1px solid ${C.border}`, boxShadow:"0 4px 20px rgba(0,0,0,.07)", overflow:"hidden" }}>
            <div style={{ background:"linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%)", padding:"18px 20px 14px", borderBottom:"1px solid #BFDBFE" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:32, color:"#0D1F3C", lineHeight:1.1 }}>{result.word}</div>
                  {result.phonetic && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:C.blue, marginTop:3 }}>{result.phonetic}</div>}
                  <div style={{ display:"flex", gap:6, marginTop:9, flexWrap:"wrap" }}>
                    {result.pos && <Chip ch={result.pos} color={C.gold} bg={C.goldLight} />}
                    {inVocab
                      ? <Chip ch="✓ 已在生词本" color={C.green} bg={C.greenLight} />
                      : result.isWord && result.isEnglish && <Chip ch="📌 已自动收录" color={C.blue} bg={C.blueLight} />}
                  </div>
                </div>
                <div style={{ width:40,height:40,borderRadius:12,background:"#EFF6FF",border:"1px solid #BFDBFE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,cursor:"pointer",flexShrink:0 }}>🔊</div>
              </div>
            </div>
            <div style={{ padding:"14px 20px" }}>
              {result.definitions?.length > 0 ? result.definitions.map((d,i) => (
                <div key={i} style={{ display:"flex", gap:8, marginBottom:7, alignItems:"flex-start" }}>
                  {d.pos && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, fontWeight:700, color:C.gold, background:C.goldLight, padding:"2px 7px", borderRadius:5, flexShrink:0, marginTop:2 }}>{d.pos}</span>}
                  <span style={{ fontSize:14, color:C.ink, lineHeight:1.6 }}>{d.meaning}</span>
                </div>
              )) : (
                <div style={{ fontSize:16, color:C.ink, lineHeight:1.55, padding:"4px 0" }}>{result.translation}</div>
              )}
              {result.examples?.[0] && (
                <div style={{ background:C.bg, borderRadius:11, padding:"10px 14px", marginTop:12, borderLeft:"3px solid #BFDBFE" }}>
                  <div style={{ fontSize:13, color:"#334155", fontStyle:"italic", lineHeight:1.7 }}>"{result.examples[0].en}"</div>
                  {result.examples[0].zh && <div style={{ fontSize:12, color:C.ink3, marginTop:4 }}>{result.examples[0].zh}</div>}
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginTop:14 }}>
                {result.isWord && <Btn ch={inVocab?"✓ 已在生词本":"📚 加入生词本"} v={inVocab?"success":"blue"} sz="sm" sx={{flex:1}} onClick={() => !inVocab && addToVocab(result)} />}
                <Btn ch="📋" v="sec" sz="sm" onClick={() => navigator.clipboard?.writeText(result.translation||"")} />
              </div>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && !loading && (
        <div style={{ marginTop:22 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.ink3, letterSpacing:.8, textTransform:"uppercase", padding:"0 20px 10px" }}>最近查询</div>
          <div style={{ padding:"0 16px" }}>
            {history.slice(0,8).map((h,i) => (
              <div key={i} onClick={() => { setInput(h.word); }}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 0", borderBottom:i<7?`1px solid ${C.border}`:"none", cursor:"pointer" }}>
                <div>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:16, color:C.ink }}>{h.word}</div>
                  <div style={{ fontSize:12, color:C.ink3, marginTop:2 }}>{h.translation}</div>
                </div>
                <div style={{ fontSize:11, color:C.ink3 }}>{fmtDate(h.time)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — VOCAB BOOK
// ═══════════════════════════════════════════════════════════
function VocabTab({ vocab, persist, showToast }) {
  const [view, setView]   = useState("list");
  const [selId, setSelId] = useState(null);
  const [filt, setFilt]   = useState({ level:"all", tag:"全部", search:"" });
  const [sort, setSort]   = useState("newest");
  const [imp, setImp]     = useState({ step:"input", text:"", preview:[] });
  const [form, setForm]   = useState({ word:"", phonetic:"", translation:"", example:"", tags:[] });

  const stats = { total:vocab.length, new:vocab.filter(v=>v.level==="new").length, learning:vocab.filter(v=>v.level==="learning").length, mastered:vocab.filter(v=>v.level==="mastered").length };

  const filtered = vocab.filter(v => {
    if (filt.level!=="all" && v.level!==filt.level) return false;
    if (filt.tag!=="全部" && !v.tags.includes(filt.tag)) return false;
    if (filt.search) { const q=filt.search.toLowerCase(); return v.word.toLowerCase().includes(q)||v.translation.includes(q); }
    return true;
  }).sort((a,b) => sort==="alpha"?a.word.localeCompare(b.word):sort==="reviews"?b.reviewCount-a.reviewCount:new Date(b.addedAt)-new Date(a.addedAt));

  const setLevel = (id,level) => { persist(vocab.map(v=>v.id===id?{...v,level}:v)); showToast(`已标记为「${LEVEL_META[level].label}」`,"success"); };
  const del      = (id)       => { persist(vocab.filter(v=>v.id!==id)); setView("list"); showToast("已删除"); };
  const addWord  = () => {
    if (!form.word.trim()||!form.translation.trim()) return;
    const w={id:uid(),word:form.word.trim(),phonetic:form.phonetic.trim(),pos:"",translation:form.translation.trim(),definitions:[{pos:"",meaning:form.translation.trim()}],examples:form.example?[{en:form.example,zh:""}]:[],level:"new",tags:form.tags,source:"manual",addedAt:new Date().toISOString(),reviewCount:0,lastReviewedAt:null};
    persist([w,...vocab]); setForm({word:"",phonetic:"",translation:"",example:"",tags:[]}); setView("list"); showToast(`✅ 已添加「${w.word}」`,"success");
  };
  const parseImp = () => {
    const items = imp.text.trim().split("\n").filter(l=>l.trim()).map(line=>{const p=line.split(/[,，\t]/);const word=p[0]?.trim(),meaning=p[1]?.trim()||"";return{word,meaning,isDup:vocab.some(v=>v.word.toLowerCase()===word?.toLowerCase()),checked:true};}).filter(i=>i.word);
    items.forEach(i=>{if(i.isDup)i.checked=false;});
    setImp(s=>({...s,step:"preview",preview:items}));
  };
  const confirmImp = () => {
    const toAdd=imp.preview.filter(i=>i.checked&&!i.isDup);
    persist([...toAdd.map(i=>({id:uid(),word:i.word,phonetic:"",pos:"",translation:i.meaning||i.word,definitions:i.meaning?[{pos:"",meaning:i.meaning}]:[],examples:[],level:"new",tags:[],source:"import",addedAt:new Date().toISOString(),reviewCount:0,lastReviewedAt:null})),...vocab]);
    showToast(`✅ 已导入 ${toAdd.length} 个词汇`,"success");
    setImp({step:"done",text:"",preview:[],count:toAdd.length});
  };

  if (view==="detail") {
    const w = vocab.find(v=>v.id===selId); if (!w) { setView("list"); return null; }
    return (
      <div style={{paddingBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 16px 0"}}><BkBtn onClick={()=>setView("list")}/><span style={{fontFamily:"'Lora',serif",fontSize:18}}>词条详情</span></div>
        <div style={{padding:"16px 16px 0"}}>
          <div style={{background:"linear-gradient(135deg,#0D1F3C 0%,#1E3A8A 100%)",borderRadius:22,padding:"24px 22px",marginBottom:14,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,background:"radial-gradient(circle,rgba(255,255,255,.07) 0%,transparent 70%)",borderRadius:"50%"}}/>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(147,197,253,.5)",letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>{w.source==="auto"?"🔍 自动收录":w.source==="import"?"📥 批量导入":"✍️ 手动添加"} · {fmtDate(w.addedAt)}</div>
            <div style={{fontFamily:"'Lora',serif",fontSize:36,color:"#fff",lineHeight:1.1}}>{w.word}</div>
            {w.phonetic&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:"#93C5FD",marginTop:4}}>{w.phonetic}</div>}
            <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
              {w.pos&&<span style={{background:"rgba(255,255,255,.12)",color:"rgba(255,255,255,.85)",padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:700}}>{w.pos}</span>}
              <span style={{background:LEVEL_META[w.level].bg+"22",color:LEVEL_META[w.level].dot,padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:700,border:`1px solid ${LEVEL_META[w.level].dot}55`}}>{LEVEL_META[w.level].label}</span>
            </div>
          </div>
          <Sec title="释义"><div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>{w.definitions.map((d,i)=><div key={i} style={{display:"flex",gap:8,padding:"12px 14px",borderBottom:i<w.definitions.length-1?`1px solid ${C.bg}`:"none"}}>{d.pos&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:C.gold,background:C.goldLight,padding:"2px 7px",borderRadius:5,flexShrink:0,marginTop:2}}>{d.pos}</span>}<span style={{fontSize:14,color:C.ink,lineHeight:1.6}}>{d.meaning}</span></div>)}</div></Sec>
          {w.examples?.length>0&&<Sec title="例句">{w.examples.map((ex,i)=><div key={i} style={{background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:8}}><div style={{fontSize:13,color:C.ink,fontStyle:"italic",lineHeight:1.7}}>"{ex.en}"</div>{ex.zh&&<div style={{fontSize:12,color:C.ink3,marginTop:4}}>{ex.zh}</div>}</div>)}</Sec>}
          <Sec title="标签"><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{w.tags.length>0?w.tags.map(t=><Chip key={t} ch={t} color="#1E3A5F" bg="#EFF6FF" active/>):<span style={{fontSize:13,color:C.ink3}}>暂无标签</span>}{ALL_TAGS.slice(1).filter(t=>!w.tags.includes(t)).map(t=><Chip key={t} ch={`+ ${t}`} color={C.ink3} bg={C.bg} onClick={()=>persist(vocab.map(v=>v.id===w.id?{...v,tags:[...v.tags,t]}:v))}/>)}</div></Sec>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>{[{label:"复习次数",val:w.reviewCount,icon:"🔁"},{label:"加入时间",val:fmtDate(w.addedAt),icon:"📅"}].map(s=><div key={s.label} style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,padding:"14px 16px"}}><div style={{fontSize:20,marginBottom:5}}>{s.icon}</div><div style={{fontFamily:"'Lora',serif",fontSize:22,color:C.ink}}>{s.val}</div><div style={{fontSize:11,color:C.ink3,fontWeight:600,marginTop:2}}>{s.label}</div></div>)}</div>
          <Sec title="掌握程度"><div style={{display:"flex",gap:8}}>{Object.entries(LEVEL_META).map(([k,m])=><button key={k} onClick={()=>setLevel(w.id,k)} style={{flex:1,padding:"11px 6px",borderRadius:12,border:`2px solid ${w.level===k?m.dot:C.border}`,background:w.level===k?m.bg:C.surface,cursor:"pointer",textAlign:"center",transition:"all .15s"}}><div style={{width:10,height:10,borderRadius:"50%",background:m.dot,margin:"0 auto 5px"}}/><div style={{fontSize:11,fontWeight:700,color:w.level===k?m.color:C.ink3}}>{m.label}</div></button>)}</div></Sec>
          <Btn ch="🗑 从生词本删除" v="danger" sz="md" full onClick={()=>del(w.id)}/>
        </div>
      </div>
    );
  }

  if (view==="add") return (
    <div style={{paddingBottom:24}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 16px 0"}}><BkBtn onClick={()=>setView("list")}/><span style={{fontFamily:"'Lora',serif",fontSize:18}}>手动添加</span></div>
      <div style={{padding:"20px 16px"}}>
        {[{k:"word",l:"英文单词 *",ph:"e.g. ephemeral",mono:true},{k:"phonetic",l:"音标",ph:"e.g. /ɪˈfem.ər.əl/",mono:true},{k:"translation",l:"中文释义 *",ph:"e.g. 短暂的，瞬息的"},{k:"example",l:"例句（可选）",ph:"e.g. Fame is ephemeral."}].map(f=>(
          <div key={f.k} style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,letterSpacing:.5}}>{f.l}</div><input value={form[f.k]} onChange={e=>setForm(s=>({...s,[f.k]:e.target.value}))} placeholder={f.ph} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:f.mono?14:15,fontFamily:f.mono?"'JetBrains Mono',monospace":"inherit",color:C.ink,background:C.surface,transition:"border-color .15s",boxSizing:"border-box"}}/></div>
        ))}
        <div style={{marginBottom:20}}><div style={{fontSize:11,fontWeight:700,color:C.ink2,marginBottom:8}}>标签</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ALL_TAGS.slice(1).map(t=><Chip key={t} ch={t} color="#1E3A5F" bg="#EFF6FF" active={form.tags.includes(t)} onClick={()=>setForm(s=>({...s,tags:s.tags.includes(t)?s.tags.filter(x=>x!==t):[...s.tags,t]}))}/>)}</div></div>
        <Btn ch="✅ 添加到生词本" v="primary" sz="lg" full disabled={!form.word.trim()||!form.translation.trim()} onClick={addWord}/>
      </div>
    </div>
  );

  if (view==="import") return (
    <div style={{paddingBottom:24}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 16px 0"}}><BkBtn onClick={()=>{setView("list");setImp({step:"input",text:"",preview:[]});}}/><span style={{fontFamily:"'Lora',serif",fontSize:18}}>批量导入</span></div>
      <div style={{padding:"20px 16px"}}>
        {imp.step==="done"?<div style={{textAlign:"center",padding:"48px 20px"}}><div style={{fontSize:56,marginBottom:14}}>🎉</div><div style={{fontFamily:"'Lora',serif",fontSize:24,marginBottom:8}}>导入成功</div><div style={{fontSize:15,color:C.ink2,marginBottom:28}}>已添加 <strong style={{color:C.green}}>{imp.count}</strong> 个词汇</div><Btn ch="返回生词本" sz="lg" onClick={()=>{setView("list");setImp({step:"input",text:"",preview:[]});}}/></div>
        :imp.step==="input"?<>
          <div style={{background:"#EFF6FF",borderRadius:12,border:"1px solid #BFDBFE",padding:"11px 14px",marginBottom:12,fontSize:12,color:"#1E40AF",lineHeight:1.8}}>格式：每行一词 — <span style={{fontFamily:"monospace",background:"#DBEAFE",padding:"1px 5px",borderRadius:4}}>word,释义</span> 或只填单词</div>
          <textarea value={imp.text} onChange={e=>setImp(s=>({...s,text:e.target.value}))} placeholder={"tenacious,坚韧不拔的\nvoracious,贪婪的\npertinent\nambiguous,模糊的"} rows={8} style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:C.ink,resize:"none",background:C.surface,boxSizing:"border-box",lineHeight:1.8}}/>
          <Btn ch="解析预览 →" v="primary" sz="lg" full disabled={!imp.text.trim()} onClick={parseImp} sx={{marginTop:12}}/>
        </>:<>
          <div style={{display:"flex",gap:7,marginBottom:12}}><Chip ch={`✓ 新词 ${imp.preview.filter(i=>!i.isDup).length}`} color={C.green} bg={C.greenLight} active/>{imp.preview.filter(i=>i.isDup).length>0&&<Chip ch={`⚠ 重复 ${imp.preview.filter(i=>i.isDup).length}`} color={C.gold} bg={C.goldLight} active/>}</div>
          <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:10}}>
            {imp.preview.map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<imp.preview.length-1?`1px solid ${C.bg}`:"none",opacity:item.isDup?.5:1,cursor:item.isDup?"default":"pointer"}} onClick={()=>!item.isDup&&setImp(s=>({...s,preview:s.preview.map((p,j)=>j===i?{...p,checked:!p.checked}:p)}))}>
                <div style={{width:22,height:22,borderRadius:7,border:`1.5px solid ${item.isDup?"#FBBF24":item.checked?"#1E3A5F":"#CBD5E1"}`,background:item.isDup?C.goldLight:item.checked?"#1E3A5F":C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:item.isDup?C.gold:"white",flexShrink:0}}>
                  {item.isDup?"⚠":item.checked?"✓":""}
                </div>
                <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:15,color:C.ink}}>{item.word}</div>{item.meaning&&<div style={{fontSize:12,color:C.ink2}}>{item.meaning}</div>}{item.isDup&&<div style={{fontSize:11,color:C.gold}}>已在生词本</div>}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.ink,borderRadius:12,padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:"white",fontSize:13}}>导入 <span style={{color:"#93C5FD",fontWeight:700}}>{imp.preview.filter(i=>i.checked&&!i.isDup).length} 个新词</span></span>
            <Btn ch="确认 →" sz="sm" sx={{background:"#3B82F6",color:"white"}} disabled={!imp.preview.filter(i=>i.checked&&!i.isDup).length} onClick={confirmImp}/>
          </div>
          <Btn ch="← 重新编辑" v="ghost" sz="sm" full onClick={()=>setImp(s=>({...s,step:"input"}))}/>
        </>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{background:"linear-gradient(155deg,#0D1F3C 0%,#1E3A8A 100%)",padding:"48px 20px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18}}>
          <div><div style={{fontSize:10,fontWeight:700,color:"rgba(147,197,253,.6)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:5}}>MY ENGLISH</div><h1 style={{fontFamily:"'Lora',serif",fontSize:28,color:"#fff"}}>生词本</h1></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setView("import")} style={{width:40,height:40,borderRadius:12,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",color:"white",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>📥</button>
            <button onClick={()=>setView("add")} style={{width:40,height:40,borderRadius:12,background:"#3B82F6",border:"none",color:"white",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(59,130,246,.4)"}}>+</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[["all","全部",stats.total,"#93C5FD"],["new","未学",stats.new,LEVEL_META.new.dot],["learning","学习中",stats.learning,LEVEL_META.learning.dot],["mastered","已掌握",stats.mastered,LEVEL_META.mastered.dot]].map(([k,l,v,c])=>(
            <button key={k} onClick={()=>setFilt(f=>({...f,level:k}))} style={{background:filt.level===k?"rgba(255,255,255,.15)":"rgba(255,255,255,.06)",border:`1.5px solid ${filt.level===k?"rgba(255,255,255,.3)":"transparent"}`,borderRadius:14,padding:"10px 4px",cursor:"pointer",transition:"all .15s"}}>
              <div style={{fontFamily:"'Lora',serif",fontSize:22,color:c}}>{v}</div><div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:2,fontWeight:600}}>{l}</div>
            </button>
          ))}
        </div>
        <div style={{marginTop:14}}><div style={{height:5,background:"rgba(255,255,255,.1)",borderRadius:100,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#34D399,#10B981)",borderRadius:100,width:`${stats.total?stats.mastered/stats.total*100:0}%`,transition:"width .5s"}}/></div><div style={{display:"flex",justifyContent:"flex-end",fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>掌握进度 {stats.total?Math.round(stats.mastered/stats.total*100):0}%</div></div>
      </div>
      <div style={{background:C.bg,padding:"14px 16px 0"}}>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:C.surface,borderRadius:14,border:`1.5px solid ${C.border}`,padding:"0 14px",height:44}}>
            <span style={{color:C.ink3}}>🔍</span>
            <input value={filt.search} onChange={e=>setFilt(f=>({...f,search:e.target.value}))} placeholder="搜索词汇或释义…" style={{flex:1,border:"none",fontSize:14,color:C.ink,background:"transparent",fontFamily:"inherit"}}/>
            {filt.search&&<button onClick={()=>setFilt(f=>({...f,search:""}))} style={{background:"none",border:"none",cursor:"pointer",color:C.ink3,fontSize:16,fontFamily:"inherit"}}>✕</button>}
          </div>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:"0 10px",borderRadius:12,border:`1.5px solid ${C.border}`,background:C.surface,fontSize:12,color:C.ink2,fontFamily:"inherit",fontWeight:600,cursor:"pointer",outline:"none"}}>
            <option value="newest">最新</option><option value="alpha">字母</option><option value="reviews">复习多</option>
          </select>
        </div>
        <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:12}}>
          {ALL_TAGS.map(t=><button key={t} onClick={()=>setFilt(f=>({...f,tag:t}))} style={{flexShrink:0,padding:"5px 14px",borderRadius:100,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:filt.tag===t?C.ink:C.surface,color:filt.tag===t?"#fff":C.ink2,boxShadow:filt.tag===t?"0 2px 8px rgba(26,22,18,.2)":"0 1px 3px rgba(0,0,0,.06)",transition:"all .15s"}}>{t}</button>)}
        </div>
      </div>
      <div style={{padding:"4px 16px 20px",background:C.bg}}>
        <div style={{fontSize:12,color:C.ink3,fontWeight:600,marginBottom:10}}>共 {filtered.length} 个词汇</div>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:C.ink3}}><div style={{fontSize:40,marginBottom:10}}>📭</div><div style={{fontFamily:"'Lora',serif",fontSize:18}}>没有找到词汇</div></div>}
        {filtered.map((w,idx)=>(
          <div key={w.id} className="card-hover" onClick={()=>{setSelId(w.id);setView("detail");}}
            style={{background:C.surface,borderRadius:18,border:`1px solid ${C.border}`,marginBottom:10,display:"flex",overflow:"hidden",cursor:"pointer",animation:"fadeUp .3s ease both",animationDelay:`${Math.min(idx,8)*.04}s`}}>
            <div style={{width:5,background:LEVEL_META[w.level].dot,flexShrink:0}}/>
            <div style={{flex:1,padding:"13px 14px"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                <div><div style={{display:"flex",alignItems:"baseline",gap:7,flexWrap:"wrap"}}><span style={{fontFamily:"'Lora',serif",fontSize:19,color:C.ink}}>{w.word}</span>{w.phonetic&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.blue}}>{w.phonetic}</span>}</div><div style={{fontSize:13,color:C.ink2,marginTop:3,lineHeight:1.4}}>{w.translation}</div></div>
                <span style={{fontSize:10,fontWeight:700,color:LEVEL_META[w.level].color,background:LEVEL_META[w.level].bg,padding:"3px 8px",borderRadius:100,flexShrink:0}}>{LEVEL_META[w.level].label}</span>
              </div>
              {w.tags.length>0&&<div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>{w.tags.map(t=><span key={t} style={{fontSize:10,color:"#1E3A5F",background:"#EFF6FF",padding:"2px 8px",borderRadius:100,fontWeight:700}}>{t}</span>)}<span style={{fontSize:10,color:C.ink3,background:C.bg,padding:"2px 8px",borderRadius:100}}>{w.source==="auto"?"自动收录":w.source==="import"?"批量导入":"手动添加"}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 3 — DAILY PLAN
// ═══════════════════════════════════════════════════════════
function PlanTab({ vocab, persist, showToast }) {
  const [fcIdx, setFcIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [streak] = useState(14);

  const newWords    = vocab.filter(v=>v.level==="new").slice(0,8);
  const reviewWords = vocab.filter(v=>{if(v.level==="mastered"||v.level==="new")return false;if(!v.lastReviewedAt)return true;return(Date.now()-new Date(v.lastReviewedAt))/86400000>=1;});
  const done  = vocab.filter(v=>v.level!=="new"&&v.reviewCount>0).length;
  const pct   = vocab.length?Math.round(done/vocab.length*100):0;
  const card  = reviewWords[fcIdx];

  const handleFC = (mastered) => {
    if(!card)return;
    persist(vocab.map(v=>v.id===card.id?{...v,level:mastered?"mastered":"learning",lastReviewedAt:new Date().toISOString(),reviewCount:(v.reviewCount||0)+1}:v));
    setFlipped(false);
    if(fcIdx<reviewWords.length-1)setFcIdx(i=>i+1);
    else{showToast("🎉 今日复习全部完成！","success");setReviewing(false);setFcIdx(0);}
  };

  const upcoming=[{day:"明天",words:vocab.filter(v=>v.level==="learning"&&v.reviewCount===1).slice(0,4)},{day:"后天",words:vocab.filter(v=>v.level==="learning"&&v.reviewCount===2).slice(0,3)},{day:"7天后",words:vocab.filter(v=>v.level==="learning"&&v.reviewCount>=3).slice(0,2)}].filter(r=>r.words.length>0);

  return (
    <div style={{paddingBottom:24}}>
      <div style={{background:"linear-gradient(155deg,#064E3B 0%,#059669 100%)",padding:"48px 20px 22px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:10,fontWeight:700,color:"rgba(167,243,208,.6)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:5}}>MY ENGLISH</div><h1 style={{fontFamily:"'Lora',serif",fontSize:26,color:"#fff",lineHeight:1.1}}>今日计划</h1><div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:3}}>{new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"long"})}</div></div>
          <div style={{textAlign:"center"}}><div style={{width:56,height:56,borderRadius:"50%",background:"rgba(255,255,255,.12)",border:"2px solid rgba(255,255,255,.25)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:18,lineHeight:1}}>🔥</span><span style={{color:"white",fontSize:11,fontWeight:800}}>{streak}</span></div><div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginTop:4,fontWeight:600}}>连续天</div></div>
        </div>
        <div style={{marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"rgba(255,255,255,.55)",marginBottom:5}}><span>整体掌握进度</span><span>{pct}% ({done}/{vocab.length}词)</span></div><div style={{height:6,background:"rgba(255,255,255,.15)",borderRadius:100,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#6EE7B7,#34D399)",borderRadius:100,width:`${pct}%`,transition:"width .6s"}}/></div></div>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <div style={{fontSize:11,fontWeight:700,color:C.ink3,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>今日任务</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[{icon:"📖",label:"新词学习",count:newWords.length,color:"#EFF6FF",accent:C.blue,done:newWords.length===0},{icon:"🃏",label:"闪卡复习",count:reviewWords.length,color:C.goldLight,accent:C.gold,done:reviewWords.length===0,onClick:()=>reviewWords.length&&setReviewing(true)}].map(t=>(
            <div key={t.label} onClick={t.onClick} style={{background:C.surface,borderRadius:18,border:`1.5px solid ${t.done?"#D1FAE5":C.border}`,padding:"16px 14px",cursor:t.onClick?"pointer":"default",position:"relative",overflow:"hidden",transition:"all .15s"}}>
              {t.done&&<div style={{position:"absolute",top:10,right:10,width:22,height:22,background:C.green,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"white"}}>✓</div>}
              <div style={{width:40,height:40,borderRadius:12,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,marginBottom:10}}>{t.icon}</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:26,color:t.done?C.ink3:t.accent}}>{t.count}</div>
              <div style={{fontSize:11,color:C.ink3,fontWeight:600,marginTop:2}}>{t.label}</div>
            </div>
          ))}
        </div>
        {card&&!reviewing&&(<><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:C.ink3,letterSpacing:.8,textTransform:"uppercase"}}>快速复习</div><button onClick={()=>setReviewing(true)} style={{fontSize:12,color:C.blue,background:"none",border:"none",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>全部 {reviewWords.length} 词 →</button></div><FCCard card={card} flipped={flipped} onFlip={()=>setFlipped(f=>!f)} onResult={handleFC} idx={fcIdx} total={reviewWords.length}/></>)}
        {newWords.length>0&&(<div style={{marginTop:16}}><div style={{fontSize:11,fontWeight:700,color:C.ink3,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>今日新词</div>{newWords.map(w=>(<div key={w.id} style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{fontFamily:"'Lora',serif",fontSize:17,color:C.ink}}>{w.word}</span>{w.phonetic&&<span style={{fontFamily:"monospace",fontSize:11,color:C.blue}}>{w.phonetic}</span>}</div><div style={{fontSize:12,color:C.ink2,marginTop:3}}>{w.translation}</div></div><button onClick={()=>{persist(vocab.map(v=>v.id===w.id?{...v,level:"learning",reviewCount:1,lastReviewedAt:new Date().toISOString()}:v));showToast(`开始学习「${w.word}」`,"success");}} style={{padding:"6px 12px",borderRadius:10,background:"#EFF6FF",border:"1px solid #BFDBFE",color:C.blue,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>开始学 →</button></div>))}</div>)}
        {upcoming.length>0&&(<div style={{marginTop:16}}><div style={{fontSize:11,fontWeight:700,color:C.ink3,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>近期复习预告</div>{upcoming.map(r=>(<div key={r.day} style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}><div style={{width:40,height:40,borderRadius:12,background:"#F0FDF4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📆</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.ink}}>{r.day}</div><div style={{fontSize:12,color:C.ink2,marginTop:2}}>{r.words.map(w=>w.word).join("、")} 等 {r.words.length} 词</div></div><span style={{fontSize:12,fontWeight:700,color:C.green,background:C.greenLight,padding:"3px 10px",borderRadius:100}}>{r.words.length}词</span></div>))}</div>)}
      </div>
      {reviewing&&card&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:C.bg,borderRadius:24,width:"100%",maxWidth:390,overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,.25)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}><span style={{fontWeight:700}}>闪卡复习 {fcIdx+1}/{reviewWords.length}</span><BkBtn onClick={()=>{setReviewing(false);setFcIdx(0);setFlipped(false);}} label="✕"/></div><div style={{padding:20}}><FCCard card={card} flipped={flipped} onFlip={()=>setFlipped(f=>!f)} onResult={handleFC} idx={fcIdx} total={reviewWords.length} large/></div></div></div>)}
    </div>
  );
}

function FCCard({ card, flipped, onFlip, onResult, idx, total, large }) {
  return (
    <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{background:"linear-gradient(135deg,#1e40af 0%,#2563eb 100%)",padding:large?"36px 24px":"24px 20px",textAlign:"center",cursor:"pointer",minHeight:large?160:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={onFlip}>
        <div style={{fontFamily:"'Lora',serif",fontSize:large?34:26,color:"white"}}>{card.word}</div>
        {card.phonetic&&<div style={{fontFamily:"monospace",fontSize:13,color:"rgba(255,255,255,.6)",marginTop:5}}>{card.phonetic}</div>}
        {flipped&&<div style={{color:"white",fontSize:large?18:15,marginTop:14,animation:"fadeUp .25s ease"}}>{card.translation}</div>}
        {!flipped&&<div style={{color:"rgba(255,255,255,.35)",fontSize:12,marginTop:12}}>👆 点击翻牌</div>}
      </div>
      <div style={{padding:14}}>
        {flipped?<div style={{display:"flex",gap:8}}>
          <button onClick={()=>onResult(false)} style={{flex:1,padding:10,borderRadius:12,border:"none",background:C.redLight,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>😕 还不熟</button>
          <button onClick={()=>onResult(true)} style={{flex:1,padding:10,borderRadius:12,border:"none",background:C.greenLight,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>😊 已掌握</button>
        </div>:<button onClick={onFlip} style={{width:"100%",padding:10,borderRadius:12,border:`1.5px solid ${C.border}`,background:C.surface,fontSize:13,fontWeight:600,cursor:"pointer",color:C.ink2,fontFamily:"inherit"}}>显示释义</button>}
        <div style={{textAlign:"center",fontSize:11,color:C.ink3,marginTop:8}}>{idx+1} / {total}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 4 — CHAT
// ═══════════════════════════════════════════════════════════
function ChatTab({ vocab, showToast }) {
  const [mode, setMode]       = useState("free");
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);
  const inputRef  = useRef(null);

  const MODES = [
    {id:"free",icon:"🌊",name:"自由对话",sub:"随时开聊"},
    {id:"vocab",icon:"🃏",name:"词汇练习",sub:"融入生词本"},
    {id:"scene",icon:"🎭",name:"情境模拟",sub:"场景练习"},
    {id:"correct",icon:"✏️",name:"纠错模式",sub:"语法反馈"},
  ];

  const learningWords = vocab.filter(v=>v.level==="learning"||v.level==="new");

  useEffect(() => {
    const greet = `Hi! I'm your English learning companion 👋\n\nI can see you have **${learningWords.length} words** in your practice list${learningWords.length?` — including **${learningWords.slice(0,3).map(w=>w.word).join("**, **")}**`:""}. I'll weave them naturally into our conversation to help you practice.\n\nFeel free to chat in Chinese or English!`;
    setMsgs([{role:"assistant",content:greet,time:new Date()}]);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text||loading) return;
    setInput(""); setApiError(null);
    const history = [...msgs, {role:"user",content:text,time:new Date()}];
    setMsgs(history);
    setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const system  = buildChatSystem(learningWords, mode);
      const apiMsgs = history.map(m=>({role:m.role,content:m.content}));
      const reply   = await claudeCall(apiMsgs, system, abortRef.current.signal);
      setMsgs(m=>[...m,{role:"assistant",content:reply,time:new Date()}]);
      const used = learningWords.filter(w=>text.toLowerCase().includes(w.word.toLowerCase()));
      if (used.length>0) showToast(`🏆 使用了生词：${used.map(w=>w.word).join("、")}`,"success");
    } catch(e) {
      if (e.name!=="AbortError") {
        setApiError("回复失败，请重试");
        setMsgs(m=>[...m,{role:"assistant",content:"*(网络错误，请重试)*",time:new Date()}]);
      }
    }
    setLoading(false);
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),80);
  };

  const changeMode = (newMode) => {
    if (newMode===mode) return;
    setMode(newMode);
    const notes = {vocab:"已切换到**词汇练习**模式 🃏 — 我会在每次回复中自然地用到你生词本里的词汇！",scene:"已切换到**情境模拟**模式 🎭 — 你想模拟哪种场景？（咖啡店、求职面试、商务会议…）",correct:"已切换到**纠错模式** ✏️ — 发给我任何中文句子或有语法问题的英文，我来分析并给出地道表达！",free:"已切换到**自由对话**模式 🌊 — 聊什么都可以！"};
    setMsgs(m=>[...m,{role:"assistant",content:notes[newMode]||"",time:new Date()}]);
  };

  const renderContent = (text) => {
    return text.split(/(\*\*[^*\n]+\*\*)/g).map((p,i)=>
      p.startsWith("**")&&p.endsWith("**")
        ?<span key={i} style={{background:"#DBEAFE",color:"#1D4ED8",fontWeight:700,borderRadius:4,padding:"0 3px"}}>{p.slice(2,-2)}</span>
        :<span key={i}>{p}</span>
    );
  };

  const PROMPTS = {
    free:    ["Tell me about your day!",`Use "${learningWords[0]?.word||"ephemeral"}" in a sentence`,"What's something interesting you learned recently?"],
    vocab:   [`Give me a sentence with "${learningWords[0]?.word||"resilient"}"`,`Difference between "${learningWords[0]?.word||"pragmatic"}" and "${learningWords[1]?.word||"practical"}"?`,"Quiz me on my vocabulary!"],
    scene:   ["模拟咖啡店点单场景","Simulate a job interview","模拟向外国同事介绍项目"],
    correct: ["帮我翻译：我对这个结果感到非常失望。","Is this correct: 'I very like this movie'?","帮我改进：The meeting was cancelled because of the bad weather condition."],
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 66px)"}}>
      <div style={{background:"linear-gradient(155deg,#0D1F3C 0%,#1E3A8A 100%)",padding:"48px 20px 16px",flexShrink:0}}>
        <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:700,color:"rgba(147,197,253,.6)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:5}}>MY ENGLISH</div><h1 style={{fontFamily:"'Lora',serif",fontSize:26,color:"#fff"}}>AI 对话练习</h1></div>
        <div style={{display:"flex",gap:7,overflowX:"auto"}}>
          {MODES.map(m=>(
            <button key={m.id} onClick={()=>changeMode(m.id)} style={{flexShrink:0,background:m.id===mode?"rgba(255,255,255,.18)":"rgba(255,255,255,.07)",border:`1.5px solid ${m.id===mode?"rgba(255,255,255,.35)":"transparent"}`,borderRadius:14,padding:"8px 12px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
              <div style={{fontSize:18,marginBottom:2}}>{m.icon}</div>
              <div style={{fontSize:11,fontWeight:700,color:"white"}}>{m.name}</div>
              <div style={{fontSize:10,color:m.id===mode?"rgba(255,255,255,.65)":"rgba(255,255,255,.35)",marginTop:1}}>{m.sub}</div>
            </button>
          ))}
        </div>
      </div>
      {learningWords.length>0&&(<div style={{margin:"10px 16px 0",background:C.greenLight,borderRadius:12,padding:"9px 14px",display:"flex",gap:8,alignItems:"center",border:`1px solid #6EE7B7`,flexShrink:0}}><span style={{fontSize:16}}>📚</span><span style={{fontSize:12,color:C.green,fontWeight:600}}>已加载 <strong>{learningWords.length}</strong> 个练习词汇 · Claude 将在对话中自然融入</span></div>)}
      {apiError&&<div style={{margin:"8px 16px 0",background:C.redLight,borderRadius:10,padding:"9px 14px",fontSize:12,color:C.red,flexShrink:0}}>⚠️ {apiError}</div>}

      <div style={{flex:1,overflowY:"auto",padding:"12px 16px 0",display:"flex",flexDirection:"column",gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"fadeUp .25s ease"}}>
            {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:"50%",background:"#1E3A5F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginRight:8,marginTop:3}}>🤖</div>}
            <div style={{maxWidth:"80%",background:m.role==="user"?"#1E3A5F":C.surface,color:m.role==="user"?"white":C.ink,borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"11px 14px",fontSize:14,lineHeight:1.65,border:m.role==="assistant"?`1px solid ${C.border}`:"none",boxShadow:"0 2px 8px rgba(0,0,0,.05)",whiteSpace:"pre-wrap"}}>
              {m.role==="assistant"?renderContent(m.content):m.content}
            </div>
          </div>
        ))}
        {loading&&(<div style={{display:"flex",justifyContent:"flex-start",gap:8,alignItems:"flex-end"}}><div style={{width:28,height:28,borderRadius:"50%",background:"#1E3A5F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🤖</div><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"18px 18px 18px 4px",padding:"14px 16px",display:"flex",gap:5,alignItems:"center"}}>{[0,1,2].map(n=><span key={n} style={{width:7,height:7,borderRadius:"50%",background:C.ink3,animation:`pulse 1.2s ease ${n*.2}s infinite`,display:"inline-block"}}/>)}</div></div>)}
        <div ref={bottomRef}/>
      </div>

      {msgs.length<=2&&(<div style={{padding:"10px 16px 0",flexShrink:0}}><div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:2}}>{(PROMPTS[mode]||PROMPTS.free).map(s=>(<button key={s} onClick={()=>{setInput(s);setTimeout(()=>inputRef.current?.focus(),50);}} style={{flexShrink:0,padding:"7px 12px",borderRadius:100,border:`1px solid ${C.border}`,background:C.surface,fontSize:12,color:C.ink2,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>{s.length>28?s.slice(0,28)+"…":s}</button>))}</div></div>)}

      <div style={{padding:"10px 16px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(247,245,241,.95)",backdropFilter:"blur(20px)",flexShrink:0}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="用中文或英文发消息…" rows={1} style={{flex:1,padding:"11px 16px",borderRadius:22,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:"inherit",color:C.ink,resize:"none",background:C.surface,lineHeight:1.4,transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
          <button onClick={send} disabled={loading||!input.trim()} style={{width:44,height:44,borderRadius:"50%",background:loading||!input.trim()?"#E2E8F0":"#2563EB",border:"none",color:loading||!input.trim()?C.ink3:"white",fontSize:18,cursor:loading||!input.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",boxShadow:!loading&&input.trim()?"0 4px 12px rgba(37,99,235,.35)":"none",flexShrink:0}}>
            {loading?<Spinner/>:"↑"}
          </button>
        </div>
      </div>
    </div>
  );
}
