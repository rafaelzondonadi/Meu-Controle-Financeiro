const STORAGE_KEY = "controleFinanceiroState";
const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const state = {
  movements: [],
  cardExpenses: [],
  imported: [],
  selectedMonth: currentMonth,
};

const groupRules = [
  ["Educacao", ["faculdade", "mensalidade", "curso", "livro", "estacio", "universidade", "educacao"]],
  ["Alimentacao", ["mercado", "supermercado", "restaurante", "ifood", "lanche", "padaria", "acai", "pizza"]],
  ["Transporte", ["posto", "combustivel", "uber", "99", "taxi", "onibus", "estacionamento"]],
  ["Saude", ["farmacia", "drogaria", "hospital", "clinica", "consulta", "exame", "laboratorio"]],
  ["Moradia", ["aluguel", "energia", "agua", "internet", "condominio", "gas"]],
  ["Lazer", ["cinema", "netflix", "spotify", "prime", "show", "bar", "viagem"]],
  ["Compras", ["loja", "amazon", "magazine", "shopee", "mercado livre", "roupa", "calcado"]],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const parseAmount = (value) => {
  const text = String(value || "").replace(/[^\d,.-]/g, "").trim();
  if (!text) return 0;
  if (text.includes(",")) return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(text) || 0;
};

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const classify = (description) => {
  const clean = normalize(description);
  const match = groupRules.find(([, words]) => words.some((word) => clean.includes(normalize(word))));
  return match ? match[0] : "Outros";
};

const monthKey = (date) => {
  const text = String(date || "");
  const iso = text.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = text.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2]}`;
  return state.selectedMonth || currentMonth;
};

const normalizeDate = (date, fallbackMonth = state.selectedMonth) => {
  const text = String(date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const br = text.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2]}-${br[1]}`;
  }

  const shortBr = text.match(/^(\d{2})[/-](\d{2})$/);
  if (shortBr) {
    const year = (fallbackMonth || currentMonth).slice(0, 4);
    return `${year}-${shortBr[2]}-${shortBr[1]}`;
  }

  return `${fallbackMonth || currentMonth}-01`;
};

const monthLabel = (month) => {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const load = () => {
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
    state.selectedMonth = state.selectedMonth || currentMonth;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
};

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const replaceState = (data) => {
  if (!data || !Array.isArray(data.movements) || !Array.isArray(data.cardExpenses)) {
    throw new Error("Arquivo de backup invalido.");
  }

  state.movements = data.movements;
  state.cardExpenses = data.cardExpenses;
  state.imported = Array.isArray(data.imported) ? data.imported : [];
  state.selectedMonth = data.selectedMonth || currentMonth;
};

const setDefaultDates = () => {
  $$("input[type=\"date\"]").forEach((input) => {
    if (!input.value) input.value = today;
  });
};

const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const sameMonth = (item) => monthKey(item.date) === state.selectedMonth;
const monthMovements = () => state.movements.filter(sameMonth);
const monthCards = () => state.cardExpenses.filter(sameMonth);

const manualExpenses = () => [
  ...monthMovements().filter((item) => item.kind === "expense"),
  ...monthCards().map((item) => ({ ...item, type: item.card })),
];

const analysisItems = () => {
  const scope = $("#analysisScope").value;
  if (scope === "manual") return manualExpenses();
  if (scope === "imported") return state.imported;
  return [...manualExpenses(), ...state.imported];
};

const availableMonths = () => {
  const months = new Set([currentMonth, state.selectedMonth]);
  [...state.movements, ...state.cardExpenses, ...state.imported].forEach((item) => months.add(monthKey(item.date)));
  return [...months].filter(Boolean).sort().reverse();
};

const renderMonthSelect = () => {
  const select = $("#monthSelect");
  select.value = state.selectedMonth;
};

const renderSummary = () => {
  const movements = monthMovements();
  const income = sum(movements.filter((item) => item.kind === "income"));
  const expenses = sum(movements.filter((item) => item.kind === "expense"));
  const cards = sum(monthCards());
  $("#totalIncome").textContent = money.format(income);
  $("#totalExpense").textContent = money.format(expenses + cards);
  $("#totalBalance").textContent = money.format(income - expenses - cards);
  $("#totalCards").textContent = money.format(cards);
};

const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;

const renderMovements = () => {
  const filter = $("#movementFilter").value;
  const rows = monthMovements()
    .filter((item) => filter === "all" || item.kind === filter)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (item) => `
        <tr>
          <td>${item.date}</td>
          <td>${item.description || item.source}</td>
          <td>${item.kind === "income" ? item.source : `${item.type} / ${item.group}`}</td>
          <td class="${item.kind === "income" ? "value-income" : "value-expense"}">${money.format(item.amount)}</td>
          <td><button class="icon-button" type="button" data-delete-movement="${item.id}" title="Excluir">x</button></td>
        </tr>
      `,
    )
    .join("");

  $("#movementRows").innerHTML = rows || emptyRow(5, "Nenhuma movimentacao neste mes.");
};

const renderCards = () => {
  const filter = $("#cardFilter").value;
  const cards = monthCards();
  const rows = cards
    .filter((item) => filter === "all" || item.card === filter)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (item) => `
        <tr>
          <td>${item.date}</td>
          <td>${item.card}</td>
          <td>${item.description}</td>
          <td>${item.group}</td>
          <td class="value-expense">${money.format(item.amount)}</td>
          <td><button class="icon-button" type="button" data-delete-card="${item.id}" title="Excluir">x</button></td>
        </tr>
      `,
    )
    .join("");

  $("#cardRows").innerHTML = rows || emptyRow(6, "Nenhum gasto de cartao neste mes.");
  $("#cardTotals").innerHTML = ["Itau", "Bradesco", "Sicoob"]
    .map((card) => `<div><span>${card}</span><strong>${money.format(sum(cards.filter((item) => item.card === card)))}</strong></div>`)
    .join("");
};

const renderImports = () => {
  $("#importCount").textContent = `${state.imported.length} itens`;
  $("#importRows").innerHTML =
    state.imported
      .map(
        (item) => `
          <tr>
            <td>${item.date || "-"}</td>
            <td>${item.description}</td>
            <td>${item.group}</td>
            <td class="value-expense">${money.format(item.amount)}</td>
          </tr>
        `,
      )
      .join("") || emptyRow(4, "Nenhum item identificado no ultimo upload.");
};

const renderBars = () => {
  const totals = analysisItems().reduce((acc, item) => {
    const group = item.group || classify(item.description);
    acc[group] = (acc[group] || 0) + Number(item.amount || 0);
    return acc;
  }, {});

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  $("#groupBars").innerHTML =
    entries
      .map(
        ([group, value]) => `
          <div class="bar-row">
            <div class="bar-label"><span>${group}</span><strong>${money.format(value)}</strong></div>
            <div class="bar-track"><span style="width: ${(value / max) * 100}%"></span></div>
          </div>
        `,
      )
      .join("") || '<p class="empty-block">Sem dados para analise neste mes.</p>';
};

const monthlyTotals = () =>
  availableMonths()
    .sort()
    .map((month) => {
      const movements = state.movements.filter((item) => monthKey(item.date) === month);
      const cards = state.cardExpenses.filter((item) => monthKey(item.date) === month);
      const income = sum(movements.filter((item) => item.kind === "income"));
      const expenses = sum(movements.filter((item) => item.kind === "expense"));
      const cardTotal = sum(cards);
      return { month, income, expenses, cards: cardTotal, totalExpenses: expenses + cardTotal, balance: income - expenses - cardTotal };
    });

const renderComparison = () => {
  const totals = monthlyTotals();
  const max = Math.max(...totals.map((item) => Math.max(item.income, item.totalExpenses)), 1);

  $("#comparisonCount").textContent = `${totals.length} meses`;
  $("#comparisonRows").innerHTML =
    totals
      .slice()
      .reverse()
      .map(
        (item) => `
          <tr>
            <td>${monthLabel(item.month)}</td>
            <td class="value-income">${money.format(item.income)}</td>
            <td class="value-expense">${money.format(item.expenses)}</td>
            <td class="value-expense">${money.format(item.cards)}</td>
            <td class="value-expense">${money.format(item.totalExpenses)}</td>
            <td class="${item.balance >= 0 ? "value-income" : "value-expense"}">${money.format(item.balance)}</td>
          </tr>
        `,
      )
      .join("") || emptyRow(6, "Nenhum mes salvo.");

  $("#comparisonBars").innerHTML =
    totals
      .slice(-12)
      .map(
        (item) => `
          <div class="comparison-row">
            <strong>${monthLabel(item.month)}</strong>
            <div class="comparison-line">
              <span>Entradas</span>
              <div class="comparison-track income-track"><i style="width: ${(item.income / max) * 100}%"></i></div>
              <em>${money.format(item.income)}</em>
            </div>
            <div class="comparison-line">
              <span>Saidas</span>
              <div class="comparison-track expense-track"><i style="width: ${(item.totalExpenses / max) * 100}%"></i></div>
              <em>${money.format(item.totalExpenses)}</em>
            </div>
          </div>
        `,
      )
      .join("") || '<p class="empty-block">Sem dados para comparar.</p>';
};

const render = () => {
  renderMonthSelect();
  renderSummary();
  renderMovements();
  renderCards();
  renderImports();
  renderBars();
  renderComparison();
};

const addMovement = (kind, data) => {
  state.movements.push({ id: uid(), kind, ...data, date: normalizeDate(data.date) });
  save();
  render();
};

const addCardExpense = (data) => {
  state.cardExpenses.push({ id: uid(), ...data, date: normalizeDate(data.date) });
  save();
  render();
};

const formData = (form) => Object.fromEntries(new FormData(form).entries());

$("#expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  addMovement("expense", {
    date: data.date,
    type: data.type,
    group: data.group,
    amount: parseAmount(data.amount),
    description: data.description,
  });
  event.currentTarget.reset();
  setDefaultDates();
});

$("#incomeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  addMovement("income", {
    date: data.date,
    source: data.source,
    amount: parseAmount(data.amount),
    description: data.description,
  });
  event.currentTarget.reset();
  setDefaultDates();
});

$$(".card-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    addCardExpense({
      card: form.dataset.card,
      date: data.date,
      amount: parseAmount(data.amount),
      group: data.group,
      description: data.description,
    });
    form.reset();
    setDefaultDates();
  });
});

document.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (tab) {
    $$(".tab").forEach((button) => button.classList.toggle("active", button === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tab.dataset.tab));
  }

  const movementId = event.target.dataset.deleteMovement;
  if (movementId) {
    state.movements = state.movements.filter((item) => item.id !== movementId);
    save();
    render();
  }

  const cardId = event.target.dataset.deleteCard;
  if (cardId) {
    state.cardExpenses = state.cardExpenses.filter((item) => item.id !== cardId);
    save();
    render();
  }
});

$("#monthSelect").addEventListener("change", (event) => {
  state.selectedMonth = event.target.value;
  save();
  render();
});

$("#movementFilter").addEventListener("change", renderMovements);
$("#cardFilter").addEventListener("change", renderCards);
$("#analysisScope").addEventListener("change", renderBars);

const parseDelimitedLine = (line) => {
  const delimiter = line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((part) => part.trim().replace(/^"|"$/g, ""));
};

const parseStatementTextLine = (line) => {
  const date = line.match(/\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\b\d{2}[/-]\d{2}\b/)?.[0] || "";
  const amountMatches = line.match(/(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+[.,]\d{2}/g) || [];
  const amountPart = amountMatches[amountMatches.length - 1];
  const amount = Math.abs(parseAmount(amountPart || 0));
  const description = line
    .replace(date, "")
    .replace(amountPart || "", "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120);

  if (!amount || !description || normalize(description).includes("saldo")) return null;
  return { id: uid(), date: normalizeDate(date), amount, description, group: classify(description) };
};

const parseStatement = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const columns = parseDelimitedLine(line);
      if (columns.length > 1) {
        const date = columns.find((part) => /\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\b\d{2}[/-]\d{2}\b/.test(part)) || "";
        const amountPart = [...columns].reverse().find((part) => /-?\d+[.,]\d{2}/.test(part));
        const amount = Math.abs(parseAmount(amountPart || 0));
        const description = columns.filter((part) => part !== date && part !== amountPart).join(" ").slice(0, 120);
        if (!amount || !description || normalize(description).includes("saldo")) return null;
        return { id: uid(), date: normalizeDate(date), amount, description, group: classify(description) };
      }

      return parseStatementTextLine(line);
    })
    .filter(Boolean);
};

const extractPdfText = async (file) => {
  if (!window.pdfjsLib) {
    throw new Error("Leitor de PDF nao carregou. Verifique sua internet e tente abrir o app novamente.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = content.items.reduce((acc, item) => {
      const y = Math.round(item.transform[5]);
      acc[y] = acc[y] || [];
      acc[y].push({ x: item.transform[4], text: item.str });
      return acc;
    }, {});

    const text = Object.keys(rows)
      .sort((a, b) => Number(b) - Number(a))
      .map((y) =>
        rows[y]
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");

    pages.push(text);
  }

  return pages.join("\n");
};

$("#statementFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const stateLabel = $("#uploadState");
  stateLabel.textContent = "Lendo arquivo...";
  $("#saveImportedBtn").disabled = true;

  try {
    const text = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? await extractPdfText(file) : await file.text();
    state.imported = parseStatement(text);
    stateLabel.textContent = `${file.name}: ${state.imported.length} itens identificados para ${monthLabel(state.selectedMonth)}.`;
    $("#saveImportedBtn").disabled = state.imported.length === 0;
    render();
  } catch (error) {
    state.imported = [];
    stateLabel.textContent = error.message || "Nao foi possivel ler o arquivo.";
    render();
  }
});

$("#saveImportedBtn").addEventListener("click", () => {
  state.imported.forEach((item) => {
    state.movements.push({
      id: uid(),
      kind: "expense",
      date: normalizeDate(item.date, state.selectedMonth),
      type: "Extra",
      group: item.group,
      amount: item.amount,
      description: item.description,
    });
  });
  state.imported = [];
  $("#statementFile").value = "";
  $("#uploadState").textContent = "Itens importados salvos nos lancamentos do mes selecionado.";
  $("#saveImportedBtn").disabled = true;
  save();
  render();
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `controle-financeiro-${today}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$("#importBtn").addEventListener("click", () => {
  $("#backupFile").click();
});

$("#backupFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    replaceState(data);
    save();
    render();
    alert("Backup importado com sucesso.");
  } catch (error) {
    alert(error.message || "Nao foi possivel importar o backup.");
  } finally {
    event.target.value = "";
  }
});

$("#clearDataBtn").addEventListener("click", () => {
  if (!confirm("Limpar todos os lancamentos salvos?")) return;
  state.movements = [];
  state.cardExpenses = [];
  state.imported = [];
  state.selectedMonth = currentMonth;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

load();
setDefaultDates();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
  });
}
