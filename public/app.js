import {initEmailManager} from './emails.js';
import {initPasskeyManager} from './passkeys.js';
import { initMotorcycles, renderMotorcycle } from "./motorcycles.js";
import { icon, initIcons } from "./icons.js";
import { offlineApi, initOffline, syncPending, clearOffline, hasOfflineDashboard } from "./offline.js";
import { ridesToGoal } from "./metrics.js";
import { initReleaseHistory } from "./releases.js";
import { initLayout } from "./layout.js";
import { enhanceDashboard, rememberPlatform } from "./productivity.js";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDateBr = (isoDate) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};
const parseDateBr = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
};
const asLocalInput = (date = new Date()) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};
let dashboard = null;
let currentView = "inicio";
let toastTimer;
let editingRideId = null;
let editingExpenseId = null;
let pendingDelete = null;
let allRideRecords = [];
let fullRideHistory = false;
let refreshVersion = 0;
let dashboardSignature = '';
let backgroundRefresh = null;

async function api(path, options = {}) {
  return offlineApi(path, options);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2800);
}

function showLogin(show) {
  $("#boot-status")?.remove();
  $(".app-shell").classList.toggle("hidden", show);
  $(".mobile-nav").classList.toggle("hidden", show);
  $("#login-screen").classList.toggle("hidden", !show);
  if (!show) void syncPending();
}

function updateProfileIdentity(displayName) {
  const name = displayName?.trim() || "Luan";
  $(".welcome-copy h1").innerHTML = `Fala, ${escapeHtml(name)}`;
  $("#open-profile").textContent = [...name][0].toLocaleUpperCase("pt-BR");
}

function setView(name) {
  document.dispatchEvent(new Event('ljcs-layout'));
  currentView = name;
  window.scrollTo({top:0,behavior:'auto'});
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  const label = { inicio: "Visão geral", corridas: "Minhas corridas", despesas: "Despesas", historico: "Histórico" }[name];
  $("#page-title").textContent = label;
}

async function openFullHistory(type) {
  if (!dashboard) return;
  if (type === "rides") {
    setView("corridas");
    $("#ride-search").value = "";
    $("#ride-platform-filter").value = "";
    $("#ride-payment-filter").value = "";
    try {
      const response = await api("/api/rides");
      const rides = response.results ?? response;
      fullRideHistory = true;
      allRideRecords = Array.isArray(rides) ? rides : [];
      renderLists(allRideRecords, dashboard.expenses, dashboard.history);
      toast("Histórico completo de faturamento aberto.");
    } catch (error) {
      toast(error.message);
    }
  } else {
    setView("despesas");
    $("#expense-search").value = "";
    $("#expense-kind-filter").value = "";
    try {
      const response = await api("/api/expenses");
      const expenses = response.results ?? response;
      renderLists(dashboard.rides, Array.isArray(expenses) ? expenses : [], dashboard.history);
      toast("Histórico completo de despesas aberto.");
    } catch (error) {
      toast(error.message);
    }
  }
}

function setSidebarCollapsed(collapsed) {
  const shell = $(".app-shell");
  const button = $("#sidebar-toggle");
  shell.classList.toggle("sidebar-collapsed", collapsed);
  $$(".sidebar .navigation .nav-item, .sidebar .central-link, .sidebar .logout-button, .sidebar [data-release-history]")
    .forEach((item) => {
      if (collapsed) item.removeAttribute("title");
      else item.title = item.getAttribute("aria-label") || item.textContent.trim();
    });
  if (!collapsed) hideSidebarTooltip();
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  button.title = collapsed ? "Expandir menu" : "Recolher menu";
  button.querySelector("span").innerHTML = icon(collapsed ? "chevronRight" : "chevronLeft");
  localStorage.setItem("ljcs-sidebar-collapsed", String(collapsed));
}

const sidebarTooltip = document.createElement("div");
sidebarTooltip.className = "sidebar-tooltip";
sidebarTooltip.setAttribute("role", "tooltip");
sidebarTooltip.hidden = true;
document.body.append(sidebarTooltip);

function showSidebarTooltip(target) {
  if (!$(".app-shell").classList.contains("sidebar-collapsed")) return;
  const label = target.getAttribute("aria-label") || target.textContent.trim();
  if (!label) return;
  const rect = target.getBoundingClientRect();
  sidebarTooltip.textContent = label;
  sidebarTooltip.style.left = `${rect.right + 10}px`;
  sidebarTooltip.style.top = `${rect.top + rect.height / 2}px`;
  sidebarTooltip.hidden = false;
  requestAnimationFrame(() => sidebarTooltip.classList.add("visible"));
}

function hideSidebarTooltip() {
  sidebarTooltip.classList.remove("visible");
  sidebarTooltip.hidden = true;
}

const sidebarTooltipSelector = ".navigation .nav-item, .central-link, .logout-button, [data-release-history]";
$(".sidebar").addEventListener("pointerover", (event) => {
  const target = event.target.closest(sidebarTooltipSelector);
  if (target && !target.contains(event.relatedTarget)) showSidebarTooltip(target);
});
$(".sidebar").addEventListener("pointerout", (event) => {
  const target = event.target.closest(sidebarTooltipSelector);
  if (target && !target.contains(event.relatedTarget) && document.activeElement !== target) hideSidebarTooltip();
});
$(".sidebar").addEventListener("focusin", (event) => {
  const target = event.target.closest(sidebarTooltipSelector);
  if (target) showSidebarTooltip(target);
});
$(".sidebar").addEventListener("focusout", (event) => {
  const target = event.target.closest(sidebarTooltipSelector);
  if (target && !target.matches(":hover")) hideSidebarTooltip();
});

$("#sidebar-toggle").addEventListener("click", () => {
  setSidebarCollapsed(!$(".app-shell").classList.contains("sidebar-collapsed"));
});
setSidebarCollapsed(localStorage.getItem("ljcs-sidebar-collapsed") === "true");

function emptyState(symbol, heading, detail) {
  const name = { "↗": "motorcycle", "⌁": "fuel", "▤": "history" }[symbol] || "search";
  return `<div class="empty-state"><span class="empty-illustration">${icon(name)}</span><strong>${heading}</strong><p>${detail}</p></div>`;
}

function dateLabel(value, withTime = true) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}${withTime && !dateOnly ? ` · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
}

function rideRow(ride, compact = false) {
  const name = escapeHtml(ride.establishment);
  const platform = ride.platform ? `<span class="platform-tag ${ride.platform.toLowerCase().replace(/[^a-z0-9]/g, "")}">${escapeHtml(ride.platform)}</span>` : "";
  const paid = Number(ride.paid) === 1;
  return `<div class="ride-row ${compact ? "compact" : ""}">
    <span class="activity-symbol">${platformMark(ride.platform)}</span>
    <div class="activity-detail"><strong>${name}</strong><span>${platform}${escapeHtml(ride.note || "")}<span class="payment-tag ${paid ? "paid" : "pending"}">${paid ? "Recebido" : "Pendente"}</span></span></div>
    <div class="activity-amount"><strong>${brl(ride.amount_cents)}</strong><span>${dateLabel(ride.occurred_at)}</span></div>
    ${compact ? "" : `<div class="row-actions"><button class="row-action payment-action" data-ride-payment="${ride.id}" data-next-paid="${paid ? "false" : "true"}">${paid ? "Marcar pendente" : "Marcar recebida"}</button><button class="row-action ride-edit-action" data-edit-ride="${ride.id}" aria-label="Editar corrida" title="Editar">${icon("pencil")} <span>Editar</span></button><button class="delete-item" data-delete-ride="${ride.id}" aria-label="Excluir corrida" title="Excluir">${icon("trash")}</button></div>`}
  </div>`;
}

function platformMark(platform = "") {
  const key = platform.toLowerCase();
  const tone = key.includes("ifood") ? "ifood" : key.includes("rappi") ? "rappi" : key.includes("99") ? "ninety" : "direct";
  return `<span class="mini-mark ${tone}">${icon("route")}</span>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function expenseRow(expense) {
  const fuel = expense.kind === "fuel";
  const mileage = expense.odometer_km != null
    ? `${Number(expense.odometer_km).toLocaleString("pt-BR")} km no painel`
    : expense.distance_km != null ? `${Number(expense.distance_km).toLocaleString("pt-BR")} km desde o último abastecimento` : "";
  return `<div class="expense-row">
    <span class="expense-icon ${fuel ? "fuel" : ""}">${icon(fuel ? "fuel" : "receipt")}</span>
    <div class="activity-detail"><strong>${escapeHtml(expense.title)}</strong><span>${fuel ? `${mileage} · ${Number(expense.liters).toLocaleString("pt-BR")} L · tanque cheio` : "Outra despesa"} · ${dateLabel(expense.occurred_at)}</span></div>
    <strong class="expense-amount">${brl(expense.amount_cents)}</strong>
    <div class="row-actions"><button class="row-action" data-edit-expense="${expense.id}" aria-label="Editar despesa" title="Editar">${icon("pencil")}</button><button class="delete-item" data-delete-expense="${expense.id}" aria-label="Excluir despesa" title="Excluir">${icon("trash")}</button></div>
  </div>`;
}

function renderDashboard(data) {
  const signature = JSON.stringify(data);
  if (signature === dashboardSignature) return;
  dashboardSignature = signature;
  dashboard = data;
  $("#dashboard-date").value = formatDateBr(data.date);
  $("#dashboard-date-picker").value = data.date;
  $("#goal-earned").innerHTML = `${brl(data.grossCents)} <span>faturados</span>`;
  $("#goal-progress").style.width = `${data.progress}%`;
  $("#goal-progress").parentElement.setAttribute("role", "progressbar");
  $("#goal-progress").parentElement.setAttribute("aria-label", "Progresso da meta diária");
  $("#goal-progress").parentElement.setAttribute("aria-valuemin", "0");
  $("#goal-progress").parentElement.setAttribute("aria-valuemax", "100");
  $("#goal-progress").parentElement.setAttribute("aria-valuenow", String(data.progress));
  $("#goal-progress-label").textContent = `${data.progress}% concluído`;
  $("#goal-target").textContent = brl(data.dailyGoalCents);
  $("#goal-remaining").textContent = data.remainingCents ? `Faltam ${brl(data.remainingCents)}` : "Meta batida! Mandou bem";
  let estimate = $("#goal-rides-estimate");
  if (!estimate) {
    estimate = document.createElement("p");
    estimate.id = "goal-rides-estimate";
    estimate.className = "goal-rides-estimate";
    estimate.setAttribute("aria-live", "polite");
    $("#goal-remaining").parentElement.after(estimate);
  }
  const needed = ridesToGoal(data.remainingCents);
  estimate.textContent = needed ? `Faltam ${needed} ${needed === 1 ? "corrida" : "corridas"} de R$ 9,00 para bater a meta de faturamento.` : "Meta atingida · nenhuma corrida adicional necessária.";
  $("#stat-gross").textContent = brl(data.paidCents);
  $("#stat-pending").textContent = brl(data.pendingPaymentCents);
  $("#stat-expenses").textContent = brl(data.expenseCents);
  const net = $("#stat-net");
  net.textContent = brl(data.netCents);
  net.classList.toggle("negative-value", data.netCents < 0);
  net.title = data.carryCents < 0 ? `Inclui saldo negativo anterior de ${brl(data.carryCents)}.` : "";
  net.parentElement.querySelector("small").textContent = data.carryCents < 0
    ? `inclui residual anterior de ${brl(data.carryCents)}`
    : "recebido menos despesas pagas";
  $("#stat-rides").textContent = data.rideCount;
  $("#fuel-efficiency").textContent = data.fuelEfficiency === null ? "— km/L" : `${data.fuelEfficiency.toLocaleString("pt-BR")} km/L`;
  $("#expense-today").textContent = brl(data.expenseCents);
  $("#fuel-today").textContent = data.fuelEfficiency === null ? "— km/L" : `${data.fuelEfficiency.toLocaleString("pt-BR")} km/L`;
  renderFuelGauge(data.fuelLevel);
  $("#recent-rides").innerHTML = data.rides.length ? data.rides.slice(0, 5).map((ride) => rideRow(ride, true)).join("") :
    emptyState("↗", "Sua primeira corrida começa aqui", "Registre uma entrega para acompanhar seu dia.");
  if (!fullRideHistory) allRideRecords = data.rides;
  renderLists(allRideRecords, data.expenses, data.history);
}

function renderFuelGauge(level) {
  renderMotorcycle({...dashboard, fuelLevel:level}, {api, refresh, toast});
}

function renderLists(rides, expenses, history) {
  const searchRides = $("#ride-search").value.trim().toLocaleLowerCase("pt-BR");
  const platformFilter = $("#ride-platform-filter").value;
  const paymentFilter = $("#ride-payment-filter").value;
  const filteredRides = rides.filter((ride) => {
    const text = `${ride.establishment} ${ride.platform} ${ride.note}`.toLocaleLowerCase("pt-BR");
    const platformMatches = !platformFilter || (platformFilter === "direct" ? !ride.platform : ride.platform === platformFilter);
    const paid = Number(ride.paid) === 1;
    const paymentMatches = !paymentFilter || (paymentFilter === "paid" ? paid : !paid);
    return text.includes(searchRides) && platformMatches && paymentMatches;
  });
  const searchExpenses = $("#expense-search").value.trim().toLocaleLowerCase("pt-BR");
  const kindFilter = $("#expense-kind-filter").value;
  const filteredExpenses = expenses.filter((expense) =>
    `${expense.title} ${expense.kind}`.toLocaleLowerCase("pt-BR").includes(searchExpenses) &&
    (!kindFilter || expense.kind === kindFilter)
  );
  const totalCents = filteredRides.reduce((total, ride) => total + ride.amount_cents, 0);
  const receivedCents = filteredRides.reduce((total, ride) => total + (Number(ride.paid) === 1 ? ride.amount_cents : 0), 0);
  const pendingCents = totalCents - receivedCents;
  const paidCount = filteredRides.filter((ride) => Number(ride.paid) === 1).length;
  const establishmentCounts = new Map();
  for (const ride of filteredRides) {
    const name = ride.establishment.trim();
    const key = name.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
    if (!key || key === "não informado") continue;
    const current = establishmentCounts.get(key) ?? { name, count: 0 };
    current.count++;
    establishmentCounts.set(key, current);
  }
  const topEstablishments = [...establishmentCounts.values()].sort((a, b) => b.count - a.count);
  const topEstablishment = topEstablishments[0];
  const highestRide = filteredRides.reduce((highest, ride) =>
    !highest || ride.amount_cents > highest.amount_cents ? ride : highest, null);
  $("#ride-summary-count").textContent = String(filteredRides.length);
  $("#ride-summary-total").textContent = brl(totalCents);
  $("#ride-summary-paid").textContent = brl(receivedCents);
  $("#ride-summary-paid-count").textContent = `${paidCount} ${paidCount === 1 ? "corrida paga" : "corridas pagas"}`;
  $("#ride-summary-pending").textContent = brl(pendingCents);
  $("#ride-summary-pending-count").textContent = `${filteredRides.length - paidCount} ${(filteredRides.length - paidCount) === 1 ? "corrida pendente" : "corridas pendentes"}`;
  $("#ride-summary-top-place").textContent = topEstablishment?.name ?? "Sem dados";
  $("#ride-summary-top-count").textContent = topEstablishment
    ? `${topEstablishment.count} ${topEstablishment.count === 1 ? "corrida" : "corridas"}`
    : "nenhum estabelecimento informado";
  $("#ride-summary-highest").textContent = highestRide ? brl(highestRide.amount_cents) : "—";
  $("#ride-summary-highest-place").textContent = highestRide
    ? highestRide.establishment.trim() || "Estabelecimento não informado"
    : "nenhuma corrida na seleção";
  $("#ride-count").textContent = `${filteredRides.length}${filteredRides.length !== rides.length ? ` de ${rides.length}` : ""} ${filteredRides.length === 1 ? "registro" : "registros"}`;
  $("#all-rides").innerHTML = filteredRides.length ? `<div class="table-head"><span>ESTABELECIMENTO</span><span>PLATAFORMA / DATA</span><span>VALOR</span><span></span></div>${filteredRides.map((ride) => `<div class="table-row">${rideRow(ride)}</div>`).join("")}` :
    emptyState("↗", rides.length ? "Nenhum resultado encontrado" : "Nenhuma corrida por enquanto", rides.length ? "Tente outra busca ou remova os filtros." : "Quando registrar uma corrida, ela vai aparecer aqui.");
  $("#all-expenses").innerHTML = filteredExpenses.length ? filteredExpenses.map(expenseRow).join("") :
    emptyState("⌁", expenses.length ? "Nenhum resultado encontrado" : "Nenhuma despesa por enquanto", expenses.length ? "Tente outra busca ou remova os filtros." : "Registre abastecimentos e outros gastos para acompanhar seu saldo.");
  $("#history-list").innerHTML = history.length ? history.map((day) => `
    <div class="history-row"><div class="history-date"><span class="history-date-icon">${icon("calendar")}</span><strong>${new Date(`${day.day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</strong></div><span>${day.count} ${Number(day.count) === 1 ? "corrida" : "corridas"}</span><strong>${brl(day.total ?? 0)}</strong><span class="history-state">${Number(day.total ?? 0) >= dashboard.dailyGoalCents ? "Meta atingida" : "Registrado"}</span></div>`).join("") :
    emptyState("▤", "Ainda não há histórico", "Seu movimento diário vai aparecer aqui.");
  $$("[data-delete-ride]").forEach((button) => button.addEventListener("click", () => deleteItem("rides", button.dataset.deleteRide)));
  $$("[data-delete-expense]").forEach((button) => button.addEventListener("click", () => deleteItem("expenses", button.dataset.deleteExpense)));
  $$("[data-edit-ride]").forEach((button) => button.addEventListener("click", () => editRide(button.dataset.editRide)));
  $$("[data-edit-expense]").forEach((button) => button.addEventListener("click", () => editExpense(button.dataset.editExpense)));
  $$("[data-ride-payment]").forEach((button) => button.addEventListener("click", () => setRidePayment(button.dataset.ridePayment, button.dataset.nextPaid === "true", button)));
}

async function setRidePayment(id, paid, button) {
  setBusy(button, true, "Atualizando…");
  try {
    await api(`/api/rides/${encodeURIComponent(id)}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ paid })
    });
    for (const ride of allRideRecords) if (ride.id === id) ride.paid = Number(paid);
    for (const ride of dashboard.rides) if (ride.id === id) ride.paid = Number(paid);
    renderLists(allRideRecords, dashboard.expenses, dashboard.history);
    await refresh();
    toast(paid ? "Pagamento da corrida marcado como recebido." : "Corrida voltou para pagamentos pendentes.");
  } catch (error) {
    toast(error.message);
    setBusy(button, false);
  }
}

async function refresh() {
  const version = ++refreshVersion;
  const date = $("#dashboard-date-picker").value || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  // Independent reads start together. Only the newest refresh may update the screen.
  const extraRequest = api(`/api/productivity?date=${date}`).then(data => ({data}), error => ({error}));
  const result = await api(`/api/dashboard?date=${encodeURIComponent(date)}`);
  if (version !== refreshVersion) return;
  renderDashboard(result);
  const extra = await extraRequest;
  if (version !== refreshVersion) return;
  if (extra.error) throw extra.error;
  await enhanceDashboard(result, {api, toast, refresh, brl, escapeHtml, openFullHistory}, extra.data);
}

async function deleteItem(kind, id) {
  const confirmed = await confirmDelete(kind === "rides" ? "Excluir esta corrida?" : "Excluir esta despesa?");
  if (!confirmed) return;
  await api(`/api/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
  await refresh();
  toast(kind === "rides" ? "Corrida removida." : "Despesa removida.");
}

function confirmDelete(message) {
  $("#confirm-message").textContent = message;
  pendingDelete = null;
  $("#confirm-modal").showModal();
  return new Promise((resolve) => {
    $("#confirm-modal").addEventListener("close", () => resolve(pendingDelete), { once: true });
  });
}

$("#confirm-delete").addEventListener("click", () => { pendingDelete = true; });

function openDialog(id) {
  const dialog = $(`#${id}`);
  if (id === "ride-modal") {
    editingRideId = null;
    $("#ride-form").reset();
    $("#ride-date").value = asLocalInput();
    $("#ride-platform").value = localStorage.getItem("ljcs-last-platform") || "";
    $("#ride-modal h2").textContent = "Adicionar corrida";
    $("#ride-form .button-primary").innerHTML = 'Salvar corrida <span data-icon="arrow"></span>';
  }
  if (id === "expense-modal") {
    editingExpenseId = null;
    $("#expense-form").reset();
    $("#expense-kind").dispatchEvent(new Event("change"));
    $("#expense-date").value = asLocalInput();
    $("#expense-modal h2").textContent = "Adicionar despesa";
    $("#expense-form .button-primary").innerHTML = 'Salvar despesa <span data-icon="arrow"></span>';
  }
  if (id === "goal-modal") $("#goal-value").value = (dashboard.dailyGoalCents / 100).toFixed(2);
  dialog.showModal();
}

function asDateTimeInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00` : value.slice(0, 16);
}

function editRide(id) {
  const ride = allRideRecords.find((item) => item.id === id);
  if (!ride) return;
  editingRideId = id;
  $("#ride-date").value = asDateTimeInput(ride.occurred_at);
  $("#ride-value").value = (ride.amount_cents / 100).toFixed(2);
  $("#ride-establishment").value = ride.establishment;
  $("#ride-platform").value = ride.platform;
  $("#ride-note").value = ride.note;
  $("#ride-paid").value = Number(ride.paid) === 1 ? "paid" : "pending";
  $("#ride-modal h2").textContent = "Editar corrida";
  $("#ride-form .button-primary").innerHTML = 'Salvar alterações <span data-icon="arrow"></span>';
  $("#ride-modal").showModal();
}

function editExpense(id) {
  const expense = dashboard.expenses.find((item) => item.id === id);
  if (!expense) return;
  editingExpenseId = id;
  $("#expense-kind").value = expense.kind;
  $("#expense-kind").dispatchEvent(new Event("change"));
  $("#expense-date").value = asDateTimeInput(expense.occurred_at);
  $("#expense-value").value = (expense.amount_cents / 100).toFixed(2);
  $("#expense-title").value = expense.title;
  if (expense.kind === "fuel") {
    $("#fuel-mileage-mode").value = expense.odometer_km != null ? "odometer" : "distance";
    $("#fuel-mileage-mode").dispatchEvent(new Event("change"));
    $("#fuel-odometer").value = expense.odometer_km ?? "";
    $("#fuel-distance").value = expense.distance_km ?? "";
    $("#fuel-liters").value = expense.liters ?? "";
    $("#tank-full").checked = true;
  }
  $("#expense-modal h2").textContent = "Editar despesa";
  $("#expense-form .button-primary").innerHTML = 'Salvar alterações <span data-icon="arrow"></span>';
  $("#expense-modal").showModal();
}

function downloadCsv(filename, rows) {
  const csvEscape = (value) => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const content = `\uFEFF${rows.map((row) => row.map(csvEscape).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportRecords(kind) {
  if (!dashboard) return;
  const rows = kind === "rides"
    ? [["Data", "Estabelecimento", "Plataforma", "Valor (R$)", "Pagamento", "Observações"], ...dashboard.rides.map((ride) => [
      ride.occurred_at, ride.establishment, ride.platform, (ride.amount_cents / 100).toFixed(2), Number(ride.paid) === 1 ? "Recebido" : "Pendente", ride.note
    ])]
    : [["Data", "Tipo", "Descrição", "Valor (R$)", "Odômetro (km)", "Distância desde o último abastecimento (km)", "Litros"], ...dashboard.expenses.map((expense) => [
      expense.occurred_at, expense.kind === "fuel" ? "Combustível" : "Outra despesa", expense.title,
      (expense.amount_cents / 100).toFixed(2), expense.odometer_km ?? "", expense.distance_km ?? "", expense.liters ?? ""
    ])];
  if (rows.length === 1) {
    toast("Não há registros para exportar nesta data.");
    return;
  }
  downloadCsv(`${kind === "rides" ? "corridas" : "despesas"}-${dashboard.date}.csv`, rows);
  toast("Arquivo CSV exportado.");
}

function setBusy(button, busy, text) {
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

async function setupLogin() {
  try {
    const [status, access, me] = await Promise.all([api("/api/auth/status"), api("/api/access/me"), api("/api/auth/me")]);
    if(access.authenticated && access.role!=="admin"){clearOffline();localStorage.removeItem("ljcs-owner-offline");location.replace("/central/");return;}
    if (me.authenticated) {
      localStorage.setItem("ljcs-owner-offline","1");
      updateProfileIdentity(me.displayName);
      await refresh();
      showLogin(false);
      return;
    }
    showLogin(true);
    $("#setup-passkey").classList.toggle("hidden", status.hasPasskey || !status.setupAvailable);
    $("#password-login-fields").classList.remove("hidden");
    $("#password-login").classList.remove("hidden");
    $("#passkey-login").classList.remove("hidden");
    $("#login-title").innerHTML="Boas-vindas<br>de volta.";
    $("#login-description").textContent="Uma entrada para administrador, estabelecimento e entregador. Sua conta abre a área correta.";
    $("#setup-token-wrap").classList.toggle("hidden", status.hasPasskey || !status.setupAvailable);
    $("#login-hint").textContent="A passkey é opcional e pode ser adicionada depois de criar sua conta com e-mail e senha.";
  } catch (error) {
    if (!navigator.onLine && localStorage.getItem("ljcs-owner-offline")==="1" && hasOfflineDashboard()) {
      showLogin(false);
      await refresh().catch(() => toast("Esta data não está disponível sem conexão."));
    } else {
      showLogin(true);
      $("#login-error").textContent = error.message;
    }
  }
}

async function login() {
  const button = $("#passkey-login");
  const error = $("#login-error");
  error.textContent = "";
  setBusy(button, true, "Aguardando passkey…");
  try {
    const { options, challengeId } = await api("/api/access/passkey/options", { method: "POST", body: "{}" });
    const response = await startAuthentication({ optionsJSON: options });
    const result=await api("/api/access/passkey/verify", { method: "POST", body: JSON.stringify({ challengeId, response }) });
    if(result.role!=="admin"){clearOffline();localStorage.removeItem("ljcs-owner-offline");location.replace("/central/");return;}
    await setupLogin();
  } catch (reason) {
    error.textContent = reason.message || "Não foi possível entrar.";
  } finally {
    setBusy(button, false);
  }
}

async function passwordLogin(event) {
  event.preventDefault();
  const button = $("#password-login");
  const error = $("#login-error");
  error.textContent = "";
  const form = new FormData(event.currentTarget);
  setBusy(button, true, "Entrando…");
  try {
    const result = await api("/api/access/login/password", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    if(result.role!=="admin"){clearOffline();localStorage.removeItem("ljcs-owner-offline");location.replace("/central/");return;}
    showLogin(false);
    updateProfileIdentity(result.displayName);
    await setupLogin();
  } catch (reason) {
    error.textContent = reason.message || "Não foi possível entrar.";
  } finally {
    setBusy(button, false);
  }
}

async function registerPasskey() {
  const button = $("#setup-passkey");
  const error = $("#login-error");
  error.textContent = "";
  const setupToken = $("#setup-token").value.trim();
  if (!setupToken) {
    error.textContent = "Informe o código de configuração inicial.";
    return;
  }
  setBusy(button, true, "Preparando sua passkey…");
  try {
    const { options, challengeId } = await api("/api/auth/register/options", {
      method: "POST",
      body: JSON.stringify({ setupToken })
    });
    const response = await startRegistration({ optionsJSON: options });
    await api("/api/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, setupToken, response })
    });
    $("#setup-token").value = "";
    toast("Passkey configurada. Entre para acessar seu painel.");
    await setupLogin();
  } catch (reason) {
    error.textContent = reason.message || "Não foi possível configurar sua passkey.";
  } finally {
    setBusy(button, false);
  }
}

$("#passkey-login").addEventListener("click", login);
$("#password-login-form").addEventListener("submit", passwordLogin);
$("#setup-passkey").addEventListener("click", registerPasskey);
$("#logout").addEventListener("click", async () => {
  await api("/api/access/logout", { method: "POST", body: "{}" });
  clearOffline();
  localStorage.removeItem("ljcs-owner-offline");
  showLogin(true);
  await setupLogin();
});
$$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-open]").forEach((button) => button.addEventListener("click", () => openDialog(button.dataset.open)));
$$("[data-export]").forEach((button) => button.addEventListener("click", () => exportRecords(button.dataset.export)));
["#ride-search", "#ride-platform-filter", "#ride-payment-filter", "#expense-search", "#expense-kind-filter"].forEach((selector) => {
  $(selector).addEventListener("input", () => {
    if (dashboard) renderLists(allRideRecords, dashboard.expenses, dashboard.history);
  });
  $(selector).addEventListener("change", () => {
    if (dashboard) renderLists(allRideRecords, dashboard.expenses, dashboard.history);
  });
});
$("#open-profile").addEventListener("click", async () => {
  try {
    const profile = await api("/api/profile");
    $("#profile-name").value = profile.displayName;
    $("#profile-email").value = profile.email;
    $("#profile-current-password").value = "";
    $("#profile-new-password").value = "";
    $("#profile-confirm-password").value = "";
    $("#current-password-field").classList.toggle("hidden", !profile.hasPassword);
    $("#profile-new-password").required = !profile.hasPassword;
    $("#profile-message").textContent = "";
    $("#profile-modal").showModal();
  } catch (error) {
    toast(error.message);
  }
});
$$(".close-modal").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

$("#dashboard-date").addEventListener("change", () => {
  const selectedDate = parseDateBr($("#dashboard-date").value);
  if (!selectedDate) {
    toast("Digite uma data válida no formato dd/mm/aaaa.");
    $("#dashboard-date").value = formatDateBr(dashboard?.date ?? $("#dashboard-date-picker").value);
    return;
  }
  $("#dashboard-date-picker").value = selectedDate;
  refresh().catch((error) => toast(error.message));
});
$("#dashboard-date-picker").addEventListener("change", (event) => {
  if (!event.currentTarget.value) return;
  $("#dashboard-date").value = formatDateBr(event.currentTarget.value);
  refresh().catch((error) => toast(error.message));
});
$("#dashboard-date-open").addEventListener("click", () => {
  const picker = $("#dashboard-date-picker");
  if (typeof picker.showPicker === "function") picker.showPicker();
  else {
    picker.focus();
    picker.click();
  }
});
$("#edit-goal").addEventListener("click", () => openDialog("goal-modal"));

$("#ride-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const button = formElement.querySelector('button[type="submit"], .button-primary');
  setBusy(button, true, "Salvando…");
  try {
    const saved = await api(editingRideId ? `/api/rides/${encodeURIComponent(editingRideId)}` : "/api/rides", {
      method: editingRideId ? "PUT" : "POST", body: JSON.stringify({
      motorcycleId: dashboard.motorcycle.id, occurredAt: form.get("occurredAt"), establishment: form.get("establishment"),
      platform: form.get("platform"), amount: Number(form.get("amount")), note: form.get("note"),
      paid: form.get("paid") === "paid"
    }) });
    rememberPlatform(form.get("platform"));
    const wasEditing = Boolean(editingRideId);
    editingRideId = null;
    fullRideHistory = false;
    formElement.reset();
    $("#ride-modal").close();
    await refresh().catch(() => {});
    toast(saved.queued ? "Corrida guardada no dispositivo. Aguarda sincronização." : wasEditing ? "Corrida atualizada." : "Corrida registrada. Boa!");
  } catch (error) { toast(error.message); }
  finally { setBusy(button, false); }
});

$("#expense-kind").addEventListener("change", (event) => {
  const isFuel = event.target.value === "fuel";
  $("#fuel-fields").classList.toggle("hidden", !isFuel);
  updateFuelMileageFields();
  $("#fuel-liters").required = isFuel;
  $("#tank-full").required = isFuel;
  $("#expense-title-label").textContent = isFuel ? "Posto / combustível" : "Nome da despesa";
  $("#expense-title").placeholder = isFuel ? "Nome do posto" : "Ex.: alimentação, manutenção";
});

function updateFuelMileageFields() {
  const isFuel = $("#expense-kind").value === "fuel";
  const useOdometer = $("#fuel-mileage-mode").value === "odometer";
  $("#fuel-odometer-field").classList.toggle("hidden", !useOdometer);
  $("#fuel-distance-field").classList.toggle("hidden", useOdometer);
  $("#fuel-odometer").required = isFuel && useOdometer;
  $("#fuel-distance").required = isFuel && !useOdometer;
}

$("#fuel-mileage-mode").addEventListener("change", updateFuelMileageFields);
updateFuelMileageFields();

$("#expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const kind = form.get("kind");
  const button = formElement.querySelector(".button-primary");
  setBusy(button, true, "Salvando…");
  try {
    const saved = await api(editingExpenseId ? `/api/expenses/${encodeURIComponent(editingExpenseId)}` : "/api/expenses", {
      method: editingExpenseId ? "PUT" : "POST", body: JSON.stringify({
      motorcycleId: dashboard.motorcycle.id, occurredAt: form.get("occurredAt"), kind, title: form.get("title"),
      amount: Number(form.get("amount")),
      odometerKm: kind === "fuel" && $("#fuel-mileage-mode").value === "odometer" ? Number(form.get("odometerKm")) : undefined,
      distanceKm: kind === "fuel" && $("#fuel-mileage-mode").value === "distance" ? Number(form.get("distanceKm")) : undefined,
      liters: Number(form.get("liters")), tankFull: $("#tank-full").checked
    }) });
    const wasEditing = Boolean(editingExpenseId);
    editingExpenseId = null;
    formElement.reset();
    $("#expense-kind").dispatchEvent(new Event("change"));
    $("#expense-modal").close();
    await refresh().catch(() => {});
    toast(saved.queued ? "Despesa guardada no dispositivo. Aguarda sincronização." : wasEditing ? "Despesa atualizada." : "Despesa registrada.");
  } catch (error) { toast(error.message); }
  finally { setBusy(button, false); }
});

$("#goal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector(".button-primary");
  setBusy(button, true, "Atualizando…");
  try {
    await api("/api/settings/goal", { method: "PUT", body: JSON.stringify({ dailyGoal: Number($("#goal-value").value) }) });
    $("#goal-modal").close();
    await refresh();
    toast("Meta diária atualizada.");
  } catch (error) { toast(error.message); }
  finally { setBusy(button, false); }
});

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const newPassword = form.get("newPassword");
  const confirmation = form.get("confirmPassword");
  const message = $("#profile-message");
  const button = event.currentTarget.querySelector(".button-primary");
  message.textContent = "";
  if (newPassword && newPassword !== confirmation) {
    message.textContent = "A confirmação da senha não corresponde.";
    return;
  }
  if (!newPassword && confirmation) {
    message.textContent = "Informe a nova senha ou deixe os dois campos em branco.";
    return;
  }
  setBusy(button, true, "Salvando…");
  try {
    const profile = await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName: form.get("displayName"),
        email: form.get("email"),
        currentPassword: form.get("currentPassword"),
        newPassword
      })
    });
    updateProfileIdentity(profile.displayName);
    $("#profile-modal").close();
    toast("Perfil atualizado.");
    await setupLogin();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    setBusy(button, false);
  }
});

initIcons();
initMotorcycles();
initReleaseHistory();
initLayout();
initOffline();
document.addEventListener("ljcs-synced", () => refresh().catch(error => toast(error.message)));
document.addEventListener("ljcs-cloud-refresh", () => {
  if (dashboard && !$(".app-shell").classList.contains("hidden") && !backgroundRefresh && !document.querySelector('dialog[open]')) {
    backgroundRefresh = refresh().catch(() => {}).finally(() => { backgroundRefresh = null; });
  }
});
setupLogin().then(syncPending);

initPasskeyManager({api,say:toast,base:"/api/passkeys"});

initEmailManager({api,say:toast,base:'/api/emails',refresh:async()=>{const p=await api('/api/profile');document.querySelector('#profile-email').value=p.email;}});
