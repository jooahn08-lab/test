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
const currentExchangeRate = document.querySelector("#currentExchangeRate");
const refreshRateBtn = document.querySelector("#refreshRateBtn");
const exchangeRateCard = document.querySelector("#exchangeRateCard");
const exchangeChartPanel = document.querySelector("#exchangeChartPanel");
const exchangePeriod = document.querySelector("#exchangePeriod");
const loadExchangeChartBtn = document.querySelector("#loadExchangeChartBtn");
const exchangeChartStatus = document.querySelector("#exchangeChartStatus");
const exchangeChart = document.querySelector("#exchangeChart");
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

function formatRate(value) {
  return toNumber(value).toLocaleString("ko-KR", {
    maximumFractionDigits: 4
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
    updateExchangeRateControls();
    syncStatus.textContent = "환율을 새로 가져오지 못했습니다. 마지막 저장 환율로 계산합니다.";
  } finally {
    refreshRateBtn.disabled = false;
  }
}

function updateExchangeRateControls() {
  const label = `USD/KRW ${formatRate(usdKrwRate)}${usdKrwDate ? ` (${usdKrwDate})` : ""}`;
  exchangeRateBadge.textContent = label;
  currentExchangeRate.textContent = formatRate(usdKrwRate);
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
    tr.innerHTML = `
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
    rowsElement.append(tr);
  });
}

function renderSummary() {
  const holdings = trades.filter((trade) => !isClosed(trade));
  const totalNetProfit = trades.reduce((sum, trade) => sum + toNumber(trade["Net Profit"]), 0);
  const averageReturn = trades.length
    ? trades.reduce((sum, trade) => sum + toNumber(trade["Return %"]), 0) / trades.length
    : 0;

  document.querySelector("#holdingCount").textContent = holdings.length;
  document.querySelector("#totalNetProfit").textContent = formatNumber(totalNetProfit);
  document.querySelector("#averageReturn").textContent = formatPercent(averageReturn);
}

function resetForm() {
  form.reset();
  editIndex.value = "";
  form.elements["Buy Date"].valueAsDate = new Date();
  form.elements.Fee.value = "0";
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

function getRangeStart(period) {
  const date = new Date();
  if (period === "daily") {
    date.setDate(date.getDate() - 90);
  } else if (period === "monthly") {
    date.setFullYear(date.getFullYear() - 3);
  } else {
    date.setFullYear(date.getFullYear() - 10);
  }
  return date.toISOString().slice(0, 10);
}

function aggregateRates(points, period) {
  if (period === "daily") {
    return points;
  }

  const groups = new Map();
  points.forEach((point) => {
    const key = period === "monthly" ? point.date.slice(0, 7) : point.date.slice(0, 4);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(point.rate);
  });

  return Array.from(groups, ([date, rates]) => ({
    date,
    rate: rates.reduce((sum, rate) => sum + rate, 0) / rates.length
  }));
}

function normalizeRateSeries(payload, period) {
  if (Array.isArray(payload.data)) {
    return aggregateRates(payload.data.map((item) => ({
      date: item.date,
      rate: toNumber(item.rates?.KRW || item.rate)
    })).filter((item) => item.date && item.rate), period);
  }

  if (payload.rates && typeof payload.rates === "object") {
    return aggregateRates(Object.entries(payload.rates).map(([date, rates]) => ({
      date,
      rate: toNumber(rates.KRW || rates.krw || rates)
    })).filter((item) => item.rate), period);
  }

  return [];
}

async function loadExchangeChart() {
  const period = exchangePeriod.value;
  const from = getRangeStart(period);
  exchangeChartStatus.textContent = "환율 데이터를 불러오는 중입니다.";
  loadExchangeChartBtn.disabled = true;

  try {
    const url = `https://api.frankfurter.dev/v2/rates?from=${from}&base=USD&quotes=KRW`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("과거 환율 API 응답 오류");
    }

    const points = normalizeRateSeries(await response.json(), period);
    if (!points.length) {
      throw new Error("표시할 환율 데이터가 없습니다.");
    }

    drawExchangeChart(points, period);
    exchangeChartStatus.textContent = `${points[0].date}부터 ${points[points.length - 1].date}까지 ${periodLabel(period)} 환율입니다.`;
  } catch (error) {
    exchangeChartStatus.textContent = `조회 실패: ${error.message}`;
    clearChart("환율 데이터를 표시할 수 없습니다.");
  } finally {
    loadExchangeChartBtn.disabled = false;
  }
}

function periodLabel(period) {
  if (period === "daily") {
    return "일별";
  }
  if (period === "monthly") {
    return "월별 평균";
  }
  return "년도별 평균";
}

function drawExchangeChart(points, period) {
  const canvas = exchangeChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 24, right: 28, bottom: 54, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const rates = points.map((point) => point.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#dce2dd";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#68746f";
  ctx.font = "13px Arial";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    const rate = max - (range / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(formatRate(rate), 10, y + 4);
  }

  ctx.strokeStyle = "#176b63";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = padding.left + (points.length === 1 ? 0 : (chartWidth / (points.length - 1)) * index);
    const y = padding.top + chartHeight - ((point.rate - min) / range) * chartHeight;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#176b63";
  points.forEach((point, index) => {
    const shouldDraw = points.length <= 24 || index % Math.ceil(points.length / 24) === 0 || index === points.length - 1;
    if (!shouldDraw) {
      return;
    }
    const x = padding.left + (points.length === 1 ? 0 : (chartWidth / (points.length - 1)) * index);
    const y = padding.top + chartHeight - ((point.rate - min) / range) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#1d2522";
  ctx.font = "12px Arial";
  const labelCount = period === "daily" ? 6 : Math.min(points.length, 8);
  for (let i = 0; i < labelCount; i += 1) {
    const index = labelCount === 1 ? 0 : Math.round((points.length - 1) * (i / (labelCount - 1)));
    const x = padding.left + (points.length === 1 ? 0 : (chartWidth / (points.length - 1)) * index);
    const label = points[index].date;
    ctx.save();
    ctx.translate(x - 20, height - 22);
    ctx.rotate(-0.35);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function clearChart(message) {
  const ctx = exchangeChart.getContext("2d");
  ctx.clearRect(0, 0, exchangeChart.width, exchangeChart.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, exchangeChart.width, exchangeChart.height);
  ctx.fillStyle = "#68746f";
  ctx.font = "16px Arial";
  ctx.fillText(message, 32, 52);
}

function toggleExchangeChart() {
  const willOpen = exchangeChartPanel.hidden;
  exchangeChartPanel.hidden = !willOpen;
  exchangeRateCard.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    loadExchangeChart();
  }
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
refreshRateBtn.addEventListener("click", fetchUsdKrwRate);
loadExchangeChartBtn.addEventListener("click", loadExchangeChart);
exchangePeriod.addEventListener("change", loadExchangeChart);
exchangeRateCard.addEventListener("click", toggleExchangeChart);
exchangeRateCard.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleExchangeChart();
  }
});
syncSamsungBtn.addEventListener("click", syncSamsungAccount);

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

updateExchangeRateControls();
resetForm();
render();
fetchUsdKrwRate();
