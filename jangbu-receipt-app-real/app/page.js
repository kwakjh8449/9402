"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";

const DEMO = [
  {
    id: "r1",
    date: "2026-03-26",
    store: "이마트",
    total: 17650,
    rawText: "",
    image: "",
    items: [
      { id: "i1", name: "서울우유 1L", normalizedName: "우유", qty: 1, price: 2980, category: "유제품" },
      { id: "i2", name: "계란 30구", normalizedName: "계란 30구", qty: 1, price: 6890, category: "계란" },
      { id: "i3", name: "바나나", normalizedName: "바나나", qty: 1, price: 3980, category: "과일" },
      { id: "i4", name: "물티슈", normalizedName: "물티슈", qty: 1, price: 3800, category: "생활용품" },
    ],
  },
  {
    id: "r2",
    date: "2026-03-19",
    store: "홈플러스",
    total: 18520,
    rawText: "",
    image: "",
    items: [
      { id: "i5", name: "우유", normalizedName: "우유", qty: 1, price: 3150, category: "유제품" },
      { id: "i6", name: "계란 30구", normalizedName: "계란 30구", qty: 1, price: 7490, category: "계란" },
      { id: "i7", name: "사과 4입", normalizedName: "사과 4입", qty: 1, price: 7880, category: "과일" },
    ],
  },
];

const STORE_HINTS = ["이마트", "홈플러스", "롯데마트", "트레이더스", "코스트코", "농협하나로마트", "GS더프레시"];
const APP_KEY = "jangbu_receipts_v3";
const BACKUP_KEY = "jangbu_receipts_backup_v3";
const BUDGET_KEY = "jangbu_budget_v3";

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function won(v) {
  return new Intl.NumberFormat("ko-KR").format(Number(v || 0)) + "원";
}

function categoryOf(name = "") {
  if (/(우유|치즈|요거트|버터|생크림)/.test(name)) return "유제품";
  if (/(계란|달걀)/.test(name)) return "계란";
  if (/(바나나|사과|딸기|토마토|포도|오렌지|복숭아|참외|수박)/.test(name)) return "과일";
  if (/(감자|양파|대파|오이|상추|버섯|당근|애호박|브로콜리)/.test(name)) return "채소";
  if (/(라면|과자|햇반|시리얼|빵|참치|통조림)/.test(name)) return "가공식품";
  if (/(삼겹살|목살|닭|계육|소고기|돼지고기|불고기)/.test(name)) return "정육";
  if (/(물티슈|휴지|세제|샴푸|치약)/.test(name)) return "생활용품";
  return "기타";
}

function normalizeProductName(name = "") {
  return String(name)
    .replace(/서울우유|매일우유|남양우유|파스퇴르/g, "우유")
    .replace(/\b1L\b|\b900ml\b|\b1000ml\b|\b900ML\b|\b1000ML\b/gi, "")
    .replace(/\b2입\b|\b4입\b|\b6입\b|\b10입\b/gi, (m) => m.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(text) {
  const clean = String(text).replace(/[./]/g, "-");
  const m = clean.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function detectDate(text) {
  const direct = normalizeDate(text);
  if (direct) return direct;
  const compact = String(text).match(/(20\d{2})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return new Date().toISOString().slice(0, 10);
}

function detectStore(text = "") {
  const found = STORE_HINTS.find((store) => text.includes(store));
  if (found) return found;
  const lines = String(text).split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 6);
  return lines.find(line => /[가-힣]{2,}/.test(line) && !/합계|총액|카드|영수증|전화/.test(line)) || "미분류 매장";
}

function detectTotal(text = "") {
  const lines = String(text).split(/\n+/);
  for (const line of lines) {
    if (/합계|총액|결제금액|받을금액/.test(line)) {
      const nums = [...line.matchAll(/\d{3,}/g)].map(m => Number(m[0].replace(/,/g, "")));
      if (nums.length) return Math.max(...nums);
    }
  }
  const nums = [...String(text).matchAll(/\d{3,}/g)].map(m => Number(m[0].replace(/,/g, "")));
  return nums.length ? Math.max(...nums) : 0;
}

function parseReceiptText(rawText) {
  const text = String(rawText)
    .replace(/[|]/g, " ")
    .replace(/[₩￦]/g, "")
    .replace(/,/g, "")
    .replace(/\t+/g, " ")
    .replace(/ +/g, " ");

  const lines = text.split(/\n+/).map(v => v.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    if (/합계|총액|카드|승인|사업자|전화|부가세|영수증|현금영수증|과세|면세/.test(line)) continue;
    const numbers = [...line.matchAll(/\d+/g)].map(m => ({ value: Number(m[0]), index: m.index ?? 0 }));
    if (!numbers.length) continue;
    const last = numbers[numbers.length - 1];
    if (last.value < 100) continue;
    let qty = 1;
    if (numbers.length >= 2) {
      const maybeQty = numbers[numbers.length - 2].value;
      if (maybeQty > 0 && maybeQty < 100) qty = maybeQty;
    }
    const rawName = line
      .slice(0, last.index)
      .replace(/\d+/g, " ")
      .replace(/[xX*]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawName || rawName.length < 2) continue;

    items.push({
      id: uid("item"),
      name: rawName,
      normalizedName: normalizeProductName(rawName),
      qty,
      price: last.value,
      category: categoryOf(rawName),
    });
  }

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.name}-${item.qty}-${item.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return {
    id: uid("receipt"),
    date: detectDate(text),
    store: detectStore(text),
    total: detectTotal(text),
    rawText,
    image: "",
    items: unique.length
      ? unique
      : [{ id: uid("item"), name: "직접 입력 필요", normalizedName: "직접 입력 필요", qty: 1, price: detectTotal(text), category: "확인필요" }],
  };
}

function exportJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jangbu-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function tinyPoints(rows) {
  if (!rows.length) return "";
  const width = 300;
  const height = 110;
  const pad = 14;
  const max = Math.max(...rows.map(r => r.price), 1);
  const min = Math.min(...rows.map(r => r.price), max);
  const range = Math.max(max - min, 1);
  const step = rows.length > 1 ? (width - pad * 2) / (rows.length - 1) : 0;
  return rows.map((r, idx) => {
    const x = pad + idx * step;
    const y = height - pad - ((r.price - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
}

export default function Page() {
  const [receipts, setReceipts] = useState([]);
  const [budget, setBudget] = useState(250000);
  const [tab, setTab] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showCompare, setShowCompare] = useState(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("준비 중");
  const [restoreMessage, setRestoreMessage] = useState("");
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const [manualReceipt, setManualReceipt] = useState({
    date: new Date().toISOString().slice(0, 10),
    store: "",
    total: 0,
    items: [{ id: uid("item"), name: "", qty: 1, price: 0, category: "기타", normalizedName: "" }],
  });

  useEffect(() => {
    const saved = localStorage.getItem(APP_KEY);
    const backup = localStorage.getItem(BACKUP_KEY);
    const budgetSaved = localStorage.getItem(BUDGET_KEY);
    if (budgetSaved) setBudget(Number(budgetSaved));
    if (saved) {
      const parsed = JSON.parse(saved);
      setReceipts(parsed);
      setSelectedId(parsed[0]?.id || null);
    } else if (backup) {
      const parsed = JSON.parse(backup);
      setReceipts(parsed);
      setSelectedId(parsed[0]?.id || null);
      setRestoreMessage("백업 데이터로 복구했어.");
    } else {
      setReceipts(DEMO);
      setSelectedId(DEMO[0].id);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(APP_KEY, JSON.stringify(receipts));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(receipts));
  }, [receipts]);

  useEffect(() => {
    localStorage.setItem(BUDGET_KEY, String(budget));
  }, [budget]);

  const selected = useMemo(() => receipts.find(r => r.id === selectedId) || null, [receipts, selectedId]);

  const flatItems = useMemo(() => receipts.flatMap(receipt =>
    receipt.items.map(item => ({
      ...item,
      receiptId: receipt.id,
      date: receipt.date,
      store: receipt.store,
      total: receipt.total,
    }))
  ), [receipts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flatItems;
    return flatItems.filter(item =>
      [item.name, item.normalizedName, item.category, item.store, item.date, String(item.price)].join(" ").toLowerCase().includes(q)
    );
  }, [flatItems, query]);

  const groups = useMemo(() => {
    const map = new Map();
    flatItems.forEach(item => {
      const key = item.normalizedName || item.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return Array.from(map.entries()).map(([name, rows]) => {
      const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0];
      const min = Math.min(...rows.map(r => r.price));
      const max = Math.max(...rows.map(r => r.price));
      return { name, rows: ordered, latest, min, max, count: rows.length };
    }).sort((a, b) => b.latest.date.localeCompare(a.latest.date));
  }, [flatItems]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthSpent = useMemo(() => receipts.filter(r => r.date.startsWith(currentMonth)).reduce((s, r) => s + Number(r.total || 0), 0), [receipts, currentMonth]);
  const budgetRate = Math.min(100, Math.round(monthSpent / Math.max(budget, 1) * 100));
  const avgReceipt = receipts.length ? Math.round(receipts.reduce((s, r) => s + Number(r.total || 0), 0) / receipts.length) : 0;

  async function handleReceiptImage(files) {
    const file = files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setOcrOpen(true);
    setOcrProgress(5);
    setOcrStatus("영수증 이미지 준비 중");
    try {
      const result = await Tesseract.recognize(file, "kor+eng", {
        logger: (m) => {
          if (m.status) setOcrStatus(m.status);
          if (typeof m.progress === "number") setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const parsed = parseReceiptText(result.data.text || "");
      parsed.image = preview;
      setReceipts(prev => [parsed, ...prev]);
      setSelectedId(parsed.id);
      setTab("receipts");
      setOcrProgress(100);
      setOcrStatus("완료");
    } catch (e) {
      console.error(e);
      setOcrStatus("OCR 실패");
    }
  }

  function updateReceipt(receiptId, field, value) {
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, [field]: value } : r));
  }

  function updateItem(receiptId, itemId, field, value) {
    setReceipts(prev => prev.map(receipt => {
      if (receipt.id !== receiptId) return receipt;
      return {
        ...receipt,
        items: receipt.items.map(item => {
          if (item.id !== itemId) return item;
          const next = { ...item, [field]: value };
          if (field === "name") {
            next.category = categoryOf(value);
            next.normalizedName = normalizeProductName(value);
          }
          return next;
        }),
      };
    }));
  }

  function addReceiptItem(receiptId) {
    const newItem = { id: uid("item"), name: "", qty: 1, price: 0, category: "기타", normalizedName: "" };
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, items: [...r.items, newItem] } : r));
  }

  function removeReceiptItem(receiptId, itemId) {
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, items: r.items.filter(i => i.id !== itemId) } : r));
  }

  function deleteReceipt(receiptId) {
    const next = receipts.filter(r => r.id !== receiptId);
    setReceipts(next);
    setSelectedId(next[0]?.id || null);
  }

  function resetToDemo() {
    setReceipts(DEMO);
    setSelectedId(DEMO[0].id);
    setRestoreMessage("데모 데이터로 바꿨어.");
  }

  function addManualItem() {
    setManualReceipt(prev => ({
      ...prev,
      items: [...prev.items, { id: uid("item"), name: "", qty: 1, price: 0, category: "기타", normalizedName: "" }],
    }));
  }

  function updateManualItem(itemId, field, value) {
    setManualReceipt(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        const next = { ...item, [field]: value };
        if (field === "name") {
          next.category = categoryOf(value);
          next.normalizedName = normalizeProductName(value);
        }
        return next;
      }),
    }));
  }

  function removeManualItem(itemId) {
    setManualReceipt(prev => ({ ...prev, items: prev.items.filter(i => i.id !== itemId) }));
  }

  function saveManualReceipt() {
    const cleanItems = manualReceipt.items
      .filter(i => i.name.trim())
      .map(i => ({
        ...i,
        qty: Number(i.qty || 1),
        price: Number(i.price || 0),
        category: categoryOf(i.name),
        normalizedName: normalizeProductName(i.name),
      }));

    const total = Number(manualReceipt.total || cleanItems.reduce((s, i) => s + Number(i.price || 0), 0));
    const receipt = {
      id: uid("receipt"),
      date: manualReceipt.date || new Date().toISOString().slice(0, 10),
      store: manualReceipt.store || "직접 입력",
      total,
      rawText: "",
      image: "",
      items: cleanItems.length ? cleanItems : [{ id: uid("item"), name: "직접 입력", normalizedName: "직접 입력", qty: 1, price: total, category: "기타" }],
    };
    setReceipts(prev => [receipt, ...prev]);
    setSelectedId(receipt.id);
    setShowManual(false);
    setTab("receipts");
    setManualReceipt({
      date: new Date().toISOString().slice(0, 10),
      store: "",
      total: 0,
      items: [{ id: uid("item"), name: "", qty: 1, price: 0, category: "기타", normalizedName: "" }],
    });
  }

  function importBackup(files) {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("invalid");
        setReceipts(data);
        setSelectedId(data[0]?.id || null);
        setRestoreMessage("백업 파일에서 복구했어.");
      } catch {
        setRestoreMessage("복구 실패. JSON 파일 형식을 확인해줘.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="app-title">장부</div>
          <div className="app-sub">영수증 OCR + 수기 입력 + 복구</div>
        </div>
        <div className="toolbar">
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>영수증 스캔</button>
          <button className="ghost-btn" onClick={() => setShowManual(true)}>직접 입력</button>
        </div>
      </div>

      <div className="hero">
        <div className="hero-badge">실사용형 개인 가계부</div>
        <h1>영수증 스캔 및 입력</h1>
        <p>영수증이 없을 때도 구매 날짜, 금액, 품목을 직접 적을 수 있고, 자동 통합된 상품명으로 가격비교까지 볼 수 있어.</p>
        <div className="hero-actions">
          <button className="primary-btn" onClick={() => fileRef.current?.click()}>영수증 스캔</button>
          <button className="secondary-btn" onClick={() => setShowManual(true)}>수기 입력</button>
          <button className="secondary-btn" onClick={() => exportJson(receipts)}>백업 파일 저장</button>
        </div>
      </div>

      {restoreMessage ? <div className="notice">{restoreMessage}</div> : null}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">이번 달 지출</div><div className="stat-value">{won(monthSpent)}</div></div>
        <div className="stat-card"><div className="stat-label">월 예산</div><div className="stat-value">{won(budget)}</div><input className="input" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value || 0))} /></div>
        <div className="stat-card"><div className="stat-label">예산 사용률</div><div className="stat-value">{budgetRate}%</div><div className="progress"><div className="progress-bar" style={{ width: `${budgetRate}%` }} /></div></div>
        <div className="stat-card"><div className="stat-label">평균 영수증</div><div className="stat-value">{won(avgReceipt)}</div></div>
      </div>

      <div className="tab-row">
        {[
          ["home", "홈"],
          ["search", "검색"],
          ["compare", "비교"],
          ["receipts", "영수증"],
          ["backup", "복구"],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "home" && (
        <div className="section-grid">
          <div className="panel">
            <div className="panel-title">최근 영수증</div>
            <div className="list">
              {[...receipts].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5).map(receipt => (
                <button key={receipt.id} className="list-item" onClick={() => { setSelectedId(receipt.id); setTab("receipts"); }}>
                  <div>
                    <div className="strong">{receipt.store}</div>
                    <div className="muted">{receipt.date} · {receipt.items.length}개 품목</div>
                  </div>
                  <div className="strong">{won(receipt.total)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">자동 통합 예시</div>
            <div className="muted">서울우유 1L / 우유 / 매일우유 1L 같은 이름은 비교용으로 "우유"로 묶이게 해놨어.</div>
            <div className="chip-wrap">
              {groups.slice(0, 8).map(g => <span key={g.name} className="chip">{g.name}</span>)}
            </div>
          </div>
        </div>
      )}

      {tab === "search" && (
        <div className="panel">
          <div className="panel-title">품목 검색</div>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 우유, 2026-03, 이마트, 2980" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>날짜</th><th>품목</th><th>매장</th><th>가격</th></tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.map(item => (
                  <tr key={`${item.receiptId}-${item.id}`}>
                    <td>{item.date}</td>
                    <td>
                      <div className="strong">{item.name}</div>
                      <div className="muted small">통합명: {item.normalizedName} · {item.category}</div>
                    </td>
                    <td>{item.store}</td>
                    <td className="right">{won(item.price)}</td>
                  </tr>
                )) : <tr><td colSpan="4" className="empty">검색 결과가 없어.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "compare" && (
        <div className="cards-grid">
          {groups.map(group => (
            <div key={group.name} className="panel">
              <div className="row between">
                <div>
                  <div className="panel-title">{group.name}</div>
                  <div className="muted">{group.count}번 구매</div>
                </div>
                <button className="ghost-btn" onClick={() => setShowCompare(group)}>상세</button>
              </div>
              <div className="mini-stats">
                <div><div className="muted small">최저가</div><div className="strong">{won(group.min)}</div></div>
                <div><div className="muted small">최고가</div><div className="strong">{won(group.max)}</div></div>
                <div><div className="muted small">최근가</div><div className="strong">{won(group.latest.price)}</div></div>
              </div>
              <svg viewBox="0 0 300 110" className="chart">
                <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={tinyPoints(group.rows)} />
              </svg>
            </div>
          ))}
        </div>
      )}

      {tab === "receipts" && (
        <div className="section-grid">
          <div className="panel">
            <div className="panel-title">영수증 목록</div>
            <div className="list">
              {receipts.map(receipt => (
                <button key={receipt.id} className={selectedId === receipt.id ? "list-item selected" : "list-item"} onClick={() => setSelectedId(receipt.id)}>
                  <div>
                    <div className="strong">{receipt.store}</div>
                    <div className="muted">{receipt.date}</div>
                  </div>
                  <div className="strong">{won(receipt.total)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="row between">
              <div className="panel-title">영수증 상세 수정</div>
              {selected ? <button className="danger-btn" onClick={() => deleteReceipt(selected.id)}>삭제</button> : null}
            </div>
            {selected ? (
              <>
                {selected.image ? <img src={selected.image} alt="receipt" className="receipt-img" /> : <div className="image-placeholder">영수증 이미지 없음</div>}
                <div className="three-grid">
                  <input className="input" value={selected.store} onChange={(e) => updateReceipt(selected.id, "store", e.target.value)} placeholder="매장명" />
                  <input className="input" value={selected.date} onChange={(e) => updateReceipt(selected.id, "date", e.target.value)} placeholder="날짜" />
                  <input className="input" type="number" value={selected.total} onChange={(e) => updateReceipt(selected.id, "total", Number(e.target.value || 0))} placeholder="총액" />
                </div>
                <div className="item-list">
                  {selected.items.map(item => (
                    <div key={item.id} className="item-row">
                      <input className="input" value={item.name} onChange={(e) => updateItem(selected.id, item.id, "name", e.target.value)} placeholder="품목명" />
                      <input className="input" type="number" value={item.qty} onChange={(e) => updateItem(selected.id, item.id, "qty", Number(e.target.value || 1))} placeholder="수량" />
                      <input className="input" type="number" value={item.price} onChange={(e) => updateItem(selected.id, item.id, "price", Number(e.target.value || 0))} placeholder="금액" />
                      <input className="input readonly" value={item.normalizedName} readOnly />
                      <button className="ghost-btn" onClick={() => removeReceiptItem(selected.id, item.id)}>삭제</button>
                    </div>
                  ))}
                </div>
                <button className="secondary-btn" onClick={() => addReceiptItem(selected.id)}>품목 추가</button>
              </>
            ) : <div className="empty-block">영수증을 선택해줘.</div>}
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div className="section-grid">
          <div className="panel">
            <div className="panel-title">백업 / 복구</div>
            <div className="muted">이 앱은 자동 저장되고, 같은 브라우저 안에 백업도 한 번 더 남겨둬. 추가로 JSON 파일 백업/복구도 가능하게 해놨어.</div>
            <div className="button-stack">
              <button className="primary-btn" onClick={() => exportJson(receipts)}>백업 파일 저장</button>
              <button className="secondary-btn" onClick={() => importRef.current?.click()}>백업 파일에서 복구</button>
              <button className="secondary-btn" onClick={resetToDemo}>데모 데이터로 복원</button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">복구 방식</div>
            <ul className="info-list">
              <li>앱 데이터는 localStorage에 자동 저장</li>
              <li>같은 브라우저 안에 백업 키도 따로 저장</li>
              <li>JSON 파일로 수동 백업 가능</li>
              <li>JSON 파일로 다시 불러오기 가능</li>
            </ul>
          </div>
        </div>
      )}

      {showManual && (
        <div className="modal-backdrop" onClick={() => setShowManual(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <div>
                <div className="panel-title">직접 구매내역 입력</div>
                <div className="muted">영수증이 없어도 날짜, 금액, 품목 직접 입력 가능</div>
              </div>
              <button className="ghost-btn" onClick={() => setShowManual(false)}>닫기</button>
            </div>
            <div className="three-grid">
              <input className="input" type="date" value={manualReceipt.date} onChange={(e) => setManualReceipt(prev => ({ ...prev, date: e.target.value }))} />
              <input className="input" value={manualReceipt.store} onChange={(e) => setManualReceipt(prev => ({ ...prev, store: e.target.value }))} placeholder="매장명" />
              <input className="input" type="number" value={manualReceipt.total} onChange={(e) => setManualReceipt(prev => ({ ...prev, total: Number(e.target.value || 0) }))} placeholder="총액(비워두면 합산)" />
            </div>
            <div className="item-list">
              {manualReceipt.items.map(item => (
                <div key={item.id} className="item-row">
                  <input className="input" value={item.name} onChange={(e) => updateManualItem(item.id, "name", e.target.value)} placeholder="품목명" />
                  <input className="input" type="number" value={item.qty} onChange={(e) => updateManualItem(item.id, "qty", Number(e.target.value || 1))} placeholder="수량" />
                  <input className="input" type="number" value={item.price} onChange={(e) => updateManualItem(item.id, "price", Number(e.target.value || 0))} placeholder="금액" />
                  <input className="input readonly" value={item.normalizedName} readOnly placeholder="자동 통합명" />
                  <button className="ghost-btn" onClick={() => removeManualItem(item.id)}>삭제</button>
                </div>
              ))}
            </div>
            <div className="row gap">
              <button className="secondary-btn" onClick={addManualItem}>품목 추가</button>
              <button className="primary-btn" onClick={saveManualReceipt}>저장</button>
            </div>
          </div>
        </div>
      )}

      {showCompare && (
        <div className="modal-backdrop" onClick={() => setShowCompare(null)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <div>
                <div className="panel-title">{showCompare.name} 가격 비교</div>
                <div className="muted">자동 통합된 상품명 기준으로 묶여 있어.</div>
              </div>
              <button className="ghost-btn" onClick={() => setShowCompare(null)}>닫기</button>
            </div>
            <svg viewBox="0 0 300 110" className="chart big">
              <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={tinyPoints(showCompare.rows)} />
            </svg>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>날짜</th><th>매장</th><th>수량</th><th>가격</th></tr>
                </thead>
                <tbody>
                  {[...showCompare.rows].reverse().map((row, idx) => (
                    <tr key={`${row.date}-${idx}`}>
                      <td>{row.date}</td>
                      <td>{row.store}</td>
                      <td>{row.qty}</td>
                      <td className="right">{won(row.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {ocrOpen && (
        <div className="modal-backdrop" onClick={() => setOcrOpen(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">영수증 읽는 중</div>
            <div className="muted">{ocrStatus}</div>
            <div className="progress big"><div className="progress-bar" style={{ width: `${ocrProgress}%` }} /></div>
            <div className="right muted">{ocrProgress}%</div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleReceiptImage(e.target.files)} />
      <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => importBackup(e.target.files)} />
    </div>
  );
}
