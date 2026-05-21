const headers = [
  "Buy Date",
  "Ticker",
  "Market",
  "Side",
  "Buy Price",
  "Quantity",
  "Fee",
  "Exchange Rate",
  "Current Price",
  "Sell Date",
  "Sell Price",
  "Net Profit",
  "Return %"
];

const storageKey = "stockTradingJournalV2";
const legacyStorageKey = "stockTradingJournal";
const form = document.querySelector("#tradeForm");
const editIndex = document.querySelector("#editIndex");
const holdingRows = document.querySelector("#holdingRows");
const closedRows = document.querySelector("#closedRows");
const holdingSearch = document.querySelector("#holdingSearch");
const closedSearch = document.querySelector("#closedSearch");
const holdingEmptyTemplate = document.querySelector("#holdingEmptyTemplate");
const closedEmptyTemplate = document.querySelector("#closedEmptyTemplate");
const exchangeRateBadge = document.querySelector("#exchangeRateBadge");
const refreshRateBtn = document.querySelector("#refreshRateBtn");
const samsungEndpoint = document.querySelector("#samsungEndpoint");
const samsungToken = document.querySelector("#samsungToken");
const syncSamsungBtn = document.querySelector("#syncSamsungBtn");
const syncStatus = document.querySelector("#syncStatus");

let trades = loadTrades();
let usdKrwRate = toNumber(localStorage.getItem("usdKrwRate")) || 1;
let usdKrwDate = localStorage.getItem("usdKrwDate") || "";

function loadTrades() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    return JSON.parse(saved);
  }

  const legacy = localStorage.getItem(legacyStorageKey);
  if (legacy) {
    return JSON.parse(legacy).map(convertLegacyTrade);
  }

  return [{
    "Buy Date": "2026-05-21",
    "Ticker": "AAPL",
    "Market": "US",
    "Side": "매수",
    "Buy Price": "190.00",
    "Quantity": "10",
    "Fee": "1.00",
    "Exchange Rate": "1",
    "Current Price": "195.00",
    "Sell Date": "",
    "Sell Price": "",
    "Net Profit": "49.00",
    "Return %": "2.58"
  }];
}

function convertLegacyTrade(trade) {
  return calculateTrade({
    "Buy Date": trade.Date || "",
    "Ticker": trade.Ticker || "",
    "Market": trade.Market || "",
    "Side": trade.Side === "Sell" ? "매도" : "매수",
    "Buy Price": trade["Entry Price"] || "",
    "Quantity": trade.Shares || "",
    "Fee": trade.Fees || "0",
    "Exchange Rate": "1",
    "Current Price": trade["Exit Price"] || "",
    "Sell Date": trade["Exit Price"] ? trade.Date || "" : "",
    "Sell Price": trade["Exit Price"] || "",
    "Net Profit": "",
    "Return %": ""
  });
}

function saveTrades() {
  localStorage.setItem(storageKey, JSON.stringify(trades));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function needsUsdKrw(market) {
  return ["US", "USA", "NYSE", "NASDAQ", "AMEX"].includes(String(market).trim().toUpperCase());
}

function getExchangeRateForMarket(market, exchangeRate) {
  if (!needsUsdKrw(market)) {
    return 1;
  }

  return toNumber(exchangeRate) || usdKrwRate || 1;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("ko-KR", {
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2)}%`;
}

function isClosed(trade) {
  return Boolean(trade["Sell Date"] && trade["Sell Price"]);
}

function calculateTrade(data) {
  const buyPrice = toNumber(data["Buy Price"]);
  const quantity = toNumber(data.Quantity);
  const fee = toNumber(data.Fee);
  const exchangeRate = getExchangeRateForMarket(data.Market, data["Exchange Rate"]);
  const referencePrice = isClosed(data) ? toNumber(data["Sell Price"]) : toNumber(data["Current Price"]);
  const grossProfit = (referencePrice - buyPrice) * quantity * exchangeRate;
  const netProfit = referencePrice && buyPrice && quantity ? grossProfit - fee : 0;
  const costBasis = buyPrice * quantity * exchangeRate;
  const returnPercent = costBasis ? (netProfit / costBasis) * 100 : 0;

  return {
    ...data,
    "Fee": data.Fee || "0",
    "Exchange Rate": String(exchangeRate),
    "Net Profit": netProfit ? netProfit.toFixed(2) : "0.00",
    "Return %": returnPercent ? returnPercent.toFixed(2) : "0.00"
  };
}

async function fetchUsdKrwRate() {
  exchangeRateBadge.textContent = "USD/KRW 확인 중";
  refreshRateBtn.disabled = true;

  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/USD/KRW");
    if (!response.ok) {
      throw new Error("환율 API 응답 오류");
    }

    const data = await response.json();
    usdKrwRate = toNumber(data.rate);
    usdKrwDate = data.date || "";
    localStorage.setItem("usdKrwRate", String(usdKrwRate));
    localStorage.setItem("usdKrwDate", usdKrwDate);
    updateExchangeRateControls();
    recalculateTrades();
  } catch (error) {
    exchangeRateBadge.textContent = `USD/KRW ${formatNumber(usdKrwRate)}${usdKrwDate ? ` (${usdKrwDate})` : ""}`;
    syncStatus.textContent = "환율을 새로 가져오지 못했습니다. 마지막 저장 환율로 계산합니다.";
  } finally {
    refreshRateBtn.disabled = false;
  }
}

function updateExchangeRateControls() {
  exchangeRateBadge.textContent = `USD/KRW ${formatNumber(usdKrwRate)}${usdKrwDate ? ` (${usdKrwDate})` : ""}`;
  form.elements["Exchange Rate"].value = String(usdKrwRate || 1);
}

function recalculateTrades() {
  trades = trades.map((trade) => calculateTrade({
    ...trade,
    "Exchange Rate": getExchangeRateForMarket(trade.Market, usdKrwRate)
  }));
  saveTrades();
  render();
}

function render() {
  renderTable({
    rowsElement: holdingRows,
    emptyTemplate: holdingEmptyTemplate,
    data: filterTrades(false, holdingSearch.value),
    closed: false
  });
  renderTable({
    rowsElement: closedRows,
    emptyTemplate: closedEmptyTemplate,
    data: filterTrades(true, closedSearch.value),
    closed: true
  });
  renderSummary();
}

function filterTrades(closed, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => isClosed(trade) === closed)
    .filter(({ trade }) => JSON.stringify(trade).toLowerCase().includes(normalizedQuery));
}

function renderTable({ rowsElement, emptyTemplate, data, closed }) {
  rowsElement.innerHTML = "";

  if (!data.length) {
    rowsElement.append(emptyTemplate.content.cloneNode(true));
    return;
  }

  data.forEach(({ trade, index }) => {
    const profit = toNumber(trade["Net Profit"]);
    const tr = document.createElement("tr");
    const commonCells = `
      <td>${escapeHtml(trade["Buy Date"])}</td>
      ${closed ? `<td>${escapeHtml(trade["Sell Date"])}</td>` : ""}
      <td><strong>${escapeHtml(trade.Ticker)}</strong><br><span>${escapeHtml(trade.Side)}</span></td>
      <td>${escapeHtml(trade.Market)}</td>
      <td>${formatNumber(trade["Buy Price"])}</td>
      <td>${formatNumber(closed ? trade["Sell Price"] : trade["Current Price"])}</td>
      <td>${formatNumber(trade.Quantity)}</td>
      <td class="${profit >= 0 ? "gain" : "loss"}">${formatNumber(profit)}</td>
      <td class="${profit >= 0 ? "gain" : "loss"}">${formatPercent(trade["Return %"])}</td>
      <td class="actions">
        <button type="button" class="ghost" data-edit="${index}">수정</button>
        <button type="button" class="ghost" data-delete="${index}">삭제</button>
      </td>
    `;
    tr.innerHTML = commonCells;
    rowsElement.append(tr);
  });
}

function renderSummary() {
  const holdings = trades.filter((trade) => !isClosed(trade));
  const closed = trades.filter(isClosed);
  const totalNetProfit = trades.reduce((sum, trade) => sum + toNumber(trade["Net Profit"]), 0);
  const averageReturn = trades.length
    ? trades.reduce((sum, trade) => sum + toNumber(trade["Return %"]), 0) / trades.length
    : 0;

  document.querySelector("#holdingCount").textContent = holdings.length;
  document.querySelector("#closedCount").textContent = closed.length;
  document.querySelector("#totalNetProfit").textContent = formatNumber(totalNetProfit);
  document.querySelector("#averageReturn").textContent = formatPercent(averageReturn);
}

function resetForm() {
  form.reset();
  editIndex.value = "";
  form.elements["Buy Date"].valueAsDate = new Date();
  form.elements["Fee"].value = "0";
  form.elements["Exchange Rate"].value = String(usdKrwRate || 1);
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
  data["Exchange Rate"] = String(getExchangeRateForMarket(data.Market, usdKrwRate));
  return calculateTrade(data);
}

function normalizeSamsungHolding(holding) {
  return calculateTrade({
    "Buy Date": holding.buyDate || holding.purchaseDate || new Date().toISOString().slice(0, 10),
    "Ticker": holding.ticker || holding.symbol || holding.code || "",
    "Market": holding.market || "KR",
    "Side": "매수",
    "Buy Price": String(holding.buyPrice || holding.averagePrice || holding.avgPrice || ""),
    "Quantity": String(holding.quantity || holding.qty || ""),
    "Fee": String(holding.fee || "0"),
    "Exchange Rate": String(getExchangeRateForMarket(holding.market || "KR", usdKrwRate)),
    "Current Price": String(holding.currentPrice || holding.price || ""),
    "Sell Date": "",
    "Sell Price": "",
    "Net Profit": "",
    "Return %": ""
  });
}

async function syncSamsungAccount() {
  const endpoint = samsungEndpoint.value.trim();
  const token = samsungToken.value.trim();

  if (!endpoint) {
    syncStatus.textContent = "연동 API 주소를 입력해주세요.";
    return;
  }

  syncStatus.textContent = "삼성증권 계좌 데이터를 불러오는 중입니다.";
  syncSamsungBtn.disabled = true;

  try {
    const response = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      throw new Error("계좌 연동 API 응답 오류");
    }

    const payload = await response.json();
    const holdings = Array.isArray(payload) ? payload : payload.holdings;
    if (!Array.isArray(holdings)) {
      throw new Error("holdings 배열을 찾을 수 없습니다.");
    }

    const imported = holdings.map(normalizeSamsungHolding);
    trades = [...imported, ...trades];
    saveTrades();
    render();
    syncStatus.textContent = `${imported.length}개 보유 종목을 가져왔습니다.`;
  } catch (error) {
    syncStatus.textContent = `연동 실패: ${error.message}`;
  } finally {
    samsungToken.value = "";
    syncSamsungBtn.disabled = false;
  }
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

function handleTableAction(event) {
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

holdingRows.addEventListener("click", handleTableAction);
closedRows.addEventListener("click", handleTableAction);
holdingSearch.addEventListener("input", render);
closedSearch.addEventListener("input", render);

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
refreshRateBtn.addEventListener("click", fetchUsdKrwRate);
syncSamsungBtn.addEventListener("click", syncSamsungAccount);

updateExchangeRateControls();
resetForm();
render();
fetchUsdKrwRate();
