const headers = [
  "Date",
  "Ticker",
  "Market",
  "Side",
  "Strategy",
  "Entry Price",
  "Exit Price",
  "Shares",
  "Fees",
  "Realized P/L",
  "Return %",
  "Risk Amount",
  "Stop Loss",
  "Target Price",
  "R Multiple",
  "Reason For Entry",
  "Reason For Exit",
  "Emotion",
  "Lesson",
  "Screenshot/Link"
];

const storageKey = "stockTradingJournal";
const form = document.querySelector("#tradeForm");
const rows = document.querySelector("#tradeRows");
const emptyTemplate = document.querySelector("#emptyTemplate");
const searchInput = document.querySelector("#searchInput");
const editIndex = document.querySelector("#editIndex");

let trades = loadTrades();

function loadTrades() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    return JSON.parse(saved);
  }

  return [{
    "Date": "2026-05-21",
    "Ticker": "AAPL",
    "Market": "US",
    "Side": "Buy",
    "Strategy": "Breakout",
    "Entry Price": "190.00",
    "Exit Price": "195.00",
    "Shares": "10",
    "Fees": "1.00",
    "Realized P/L": "49.00",
    "Return %": "2.58",
    "Risk Amount": "100.00",
    "Stop Loss": "180.00",
    "Target Price": "200.00",
    "R Multiple": "0.49",
    "Reason For Entry": "Example: broke above resistance with volume",
    "Reason For Exit": "Example: took profit near target",
    "Emotion": "Calm",
    "Lesson": "Example: waited for confirmation",
    "Screenshot/Link": ""
  }];
}

function saveTrades() {
  localStorage.setItem(storageKey, JSON.stringify(trades));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return toNumber(value).toLocaleString("ko-KR", {
    maximumFractionDigits: 2
  });
}

function calculateTrade(data) {
  const entry = toNumber(data["Entry Price"]);
  const exit = toNumber(data["Exit Price"]);
  const shares = toNumber(data.Shares);
  const fees = toNumber(data.Fees);
  const risk = toNumber(data["Risk Amount"]);

  const pnl = entry && exit && shares ? ((exit - entry) * shares) - fees : toNumber(data["Realized P/L"]);
  const returnPercent = entry ? ((exit - entry) / entry) * 100 : toNumber(data["Return %"]);
  const rMultiple = risk ? pnl / risk : toNumber(data["R Multiple"]);

  return {
    ...data,
    "Realized P/L": pnl ? pnl.toFixed(2) : "",
    "Return %": returnPercent ? returnPercent.toFixed(2) : "",
    "R Multiple": rMultiple ? rMultiple.toFixed(2) : ""
  };
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => JSON.stringify(trade).toLowerCase().includes(query));

  rows.innerHTML = "";
  if (!filtered.length) {
    rows.append(emptyTemplate.content.cloneNode(true));
  }

  filtered.forEach(({ trade, index }) => {
    const pnl = toNumber(trade["Realized P/L"]);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(trade.Date)}</td>
      <td><strong>${escapeHtml(trade.Ticker)}</strong><br><span>${escapeHtml(trade.Market)}</span></td>
      <td>${escapeHtml(trade.Side)}</td>
      <td>${escapeHtml(trade.Strategy)}</td>
      <td class="${pnl >= 0 ? "gain" : "loss"}">${formatMoney(pnl)}</td>
      <td>${escapeHtml(trade["Return %"])}%</td>
      <td>${escapeHtml(trade["R Multiple"])}</td>
      <td class="actions">
        <button type="button" class="ghost" data-edit="${index}">수정</button>
        <button type="button" class="ghost" data-delete="${index}">삭제</button>
      </td>
    `;
    rows.append(tr);
  });

  renderSummary();
}

function renderSummary() {
  const total = trades.length;
  const totalPnl = trades.reduce((sum, trade) => sum + toNumber(trade["Realized P/L"]), 0);
  const wins = trades.filter((trade) => toNumber(trade["Realized P/L"]) > 0).length;
  const avgR = total ? trades.reduce((sum, trade) => sum + toNumber(trade["R Multiple"]), 0) / total : 0;

  document.querySelector("#totalTrades").textContent = total;
  document.querySelector("#totalPnl").textContent = formatMoney(totalPnl);
  document.querySelector("#winRate").textContent = total ? `${((wins / total) * 100).toFixed(1)}%` : "0%";
  document.querySelector("#avgR").textContent = avgR.toFixed(2);
}

function resetForm() {
  form.reset();
  editIndex.value = "";
  form.elements.Date.valueAsDate = new Date();
}

function fillForm(index) {
  const trade = trades[index];
  headers.forEach((header) => {
    if (form.elements[header]) {
      form.elements[header].value = trade[header] || "";
    }
  });
  editIndex.value = String(index);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function serializeForm() {
  const data = {};
  headers.forEach((header) => {
    data[header] = form.elements[header] ? form.elements[header].value.trim() : "";
  });
  return calculateTrade(data);
}

function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    records.push(row);
  }

  const [csvHeaders, ...csvRows] = records.filter((record) => record.some(Boolean));
  return csvRows.map((record) => {
    const trade = {};
    headers.forEach((header) => {
      const index = csvHeaders.indexOf(header);
      trade[header] = index >= 0 ? record[index] || "" : "";
    });
    return calculateTrade(trade);
  });
}

function toCsv(data) {
  const escapeCsv = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.join(","),
    ...data.map((trade) => headers.map((header) => escapeCsv(trade[header])).join(","))
  ].join("\n");
}

function downloadCsv() {
  const blob = new Blob([toCsv(trades)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stock_trading_journal.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const trade = serializeForm();
  const index = editIndex.value;

  if (index !== "") {
    trades[Number(index)] = trade;
  } else {
    trades.unshift(trade);
  }

  saveTrades();
  resetForm();
  render();
});

rows.addEventListener("click", (event) => {
  const edit = event.target.dataset.edit;
  const remove = event.target.dataset.delete;

  if (edit !== undefined) {
    fillForm(Number(edit));
  }

  if (remove !== undefined && confirm("이 거래를 삭제할까요?")) {
    trades.splice(Number(remove), 1);
    saveTrades();
    render();
  }
});

document.querySelector("#csvInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  trades = parseCsv(await file.text());
  saveTrades();
  render();
  event.target.value = "";
});

document.querySelector("#exportBtn").addEventListener("click", downloadCsv);
document.querySelector("#clearBtn").addEventListener("click", () => {
  if (confirm("저장된 매매일지를 모두 초기화할까요?")) {
    trades = [];
    saveTrades();
    resetForm();
    render();
  }
});
document.querySelector("#resetFormBtn").addEventListener("click", resetForm);
searchInput.addEventListener("input", render);

resetForm();
render();
