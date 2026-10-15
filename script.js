"use strict";

(function () {
	const STORAGE_KEY = "student-expense-tracker-v1";
	const MAX_AMOUNT = 10000000;
	const SAVE_FAILED = "Couldn't save. Browser storage may be full or disabled.";
	const CATEGORY_LABELS = {
		food: "Food", transport: "Transport", housing: "Housing",
		education: "Education", supplies: "Supplies", personal: "Personal", other: "Other"
	};
	const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

	// Defined before first use (fixes "Cannot access 'pad' before initialization")
	const pad = (n) => String(n).padStart(2, "0");

	// ---------- State & storage ----------
	let state = loadState();
	let selectedMonth = currentMonth();

	function loadState() {
		const empty = { budgets: {}, expenses: [] };
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return empty;
			const parsed = JSON.parse(raw) || {};
			return {
				budgets: parsed.budgets && typeof parsed.budgets === "object" ? parsed.budgets : {},
				expenses: Array.isArray(parsed.expenses) ? parsed.expenses : []
			};
		} catch (error) {
			return empty;
		}
	}

	function saveState() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			return true;
		} catch (error) {
			return false;
		}
	}

	// ---------- Helpers ----------
	const round2 = (value) => Math.round(value * 100) / 100;
	const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

	function currentMonth() {
		const d = new Date();
		return d.getFullYear() + "-" + pad(d.getMonth() + 1);
	}

	function today() {
		return currentMonth() + "-" + pad(new Date().getDate());
	}

	function defaultDateFor(month) {
		return month === currentMonth() ? today() : month + "-01";
	}

	function isValidDate(value) {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
		if (!m) return false;
		const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const d = new Date(year, month - 1, day);
		return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
	}

	function formatDate(value) {
		return new Date(value + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
	}

	// ---------- Elements ----------
	const $ = (id) => document.getElementById(id);
	const monthFilter = $("month-filter");
	const budgetForm = $("budget-form");
	const budgetAmount = $("budget-amount");
	const budgetStatus = $("budget-status");
	const expenseForm = $("expense-form");
	const fields = {
		name: $("expense-name"), amount: $("expense-amount"), category: $("expense-category"),
		date: $("expense-date"), note: $("expense-note")
	};
	const expenseList = $("expense-list");
	const expenseCount = $("expense-count");

	// ---------- Validation ----------
	function setError(input, message) {
		let el = $(input.id + "-error");
		if (!el) {
			el = document.createElement("p");
			el.id = input.id + "-error";
			el.className = "field-error";
			input.insertAdjacentElement("afterend", el);
		}
		el.textContent = message;
		input.setAttribute("aria-invalid", "true");
		input.setAttribute("aria-describedby", el.id);
	}

	function clearError(input) {
		const el = $(input.id + "-error");
		if (el) el.remove();
		input.removeAttribute("aria-invalid");
		input.removeAttribute("aria-describedby");
	}

	function showStatus(message, isError) {
		budgetStatus.textContent = message;
		budgetStatus.classList.toggle("is-error", Boolean(isError));
	}

	function validateBudget() {
		clearError(budgetAmount);
		const raw = budgetAmount.value.trim();
		const value = Number(raw);
		if (raw === "") return setError(budgetAmount, "Enter your monthly budget."), null;
		if (!Number.isFinite(value) || value < 0) return setError(budgetAmount, "Budget must be 0 or more."), null;
		if (value > MAX_AMOUNT) return setError(budgetAmount, "Budget can't be more than " + money.format(MAX_AMOUNT) + "."), null;
		return round2(value);
	}

	function validateExpense() {
		Object.values(fields).forEach(clearError);
		let firstInvalid = null;
		const fail = (input, message) => {
			setError(input, message);
			firstInvalid = firstInvalid || input;
		};

		const name = fields.name.value.trim();
		if (!name) fail(fields.name, "Enter an expense name.");
		else if (name.length > 60) fail(fields.name, "Name must be 60 characters or fewer.");

		const rawAmount = fields.amount.value.trim();
		const amount = Number(rawAmount);
		if (rawAmount === "") fail(fields.amount, "Enter an amount.");
		else if (!Number.isFinite(amount) || amount <= 0) fail(fields.amount, "Amount must be greater than 0.");
		else if (amount > MAX_AMOUNT) fail(fields.amount, "Amount is too large.");

		const category = fields.category.value;
		if (!CATEGORY_LABELS[category]) fail(fields.category, "Select a category.");

		const date = fields.date.value;
		if (!date) fail(fields.date, "Pick a date.");
		else if (!isValidDate(date)) fail(fields.date, "Enter a valid date.");

		const note = fields.note.value.trim();
		if (note.length > 120) fail(fields.note, "Note must be 120 characters or fewer.");

		if (firstInvalid) {
			firstInvalid.focus();
			return null;
		}
		return { id: newId(), name, amount: round2(amount), category, date, note };
	}

	// ---------- Rendering ----------
	function monthExpenses() {
		return state.expenses
			.filter((e) => typeof e.date === "string" && e.date.slice(0, 7) === selectedMonth)
			.sort((a, b) => b.date.localeCompare(a.date));
	}

	function renderSummary(expenses) {
		const budget = Number(state.budgets[selectedMonth]) || 0;
		const spent = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
		const remaining = round2(budget - spent);

		$("summary-budget").textContent = money.format(budget);
		$("summary-spent").textContent = money.format(spent);
		$("summary-remaining").textContent = money.format(remaining);
		$("summary-remaining").classList.toggle("is-over", remaining < 0);

		let percent = 0;
		let level = "ok";
		let text = "0%";

		if (budget > 0) {
			percent = (spent / budget) * 100;
			text = Math.round(percent) + "%" + (percent > 100 ? " (over budget)" : "");
			level = percent > 100 ? "over" : percent >= 80 ? "warn" : "ok";
		} else if (spent > 0) {
			percent = 100;
			text = "No budget set";
			level = "over";
		}

		const progress = $("budget-progress");
		progress.value = Math.min(percent, 100);
		progress.textContent = Math.round(percent) + "%";
		progress.dataset.level = level;
		$("budget-used-label").textContent = text;
	}

	function makeCell(text, className) {
		const td = document.createElement("td");
		td.textContent = text;
		if (className) td.className = className;
		return td;
	}

	function renderTable(expenses) {
		expenseList.replaceChildren();
		expenseCount.textContent = expenses.length + (expenses.length === 1 ? " expense" : " expenses");

		if (expenses.length === 0) {
			const tr = document.createElement("tr");
			tr.id = "empty-state";
			const td = makeCell("No expenses recorded for this month. Add one above to get started.");
			td.colSpan = 6;
			tr.appendChild(td);
			expenseList.appendChild(tr);
			return;
		}

		expenses.forEach((expense) => {
			const tr = document.createElement("tr");
			tr.appendChild(makeCell(formatDate(expense.date)));
			tr.appendChild(makeCell(expense.name));

			const catTd = document.createElement("td");
			const badge = document.createElement("span");
			const category = CATEGORY_LABELS[expense.category] ? expense.category : "other";
			badge.className = "category-badge category-" + category;
			badge.textContent = CATEGORY_LABELS[category];
			catTd.appendChild(badge);
			tr.appendChild(catTd);

			tr.appendChild(makeCell(expense.note || "—", "note-cell"));
			tr.appendChild(makeCell(money.format(expense.amount), "amount-column"));

			const actionTd = document.createElement("td");
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "delete-button";
			btn.dataset.id = expense.id;
			btn.textContent = "Delete";
			btn.setAttribute("aria-label", "Delete expense " + expense.name);
			actionTd.appendChild(btn);
			tr.appendChild(actionTd);

			expenseList.appendChild(tr);
		});
	}

	function renderBreakdown(expenses) {
		const totals = {};
		expenses.forEach((e) => {
			const c = CATEGORY_LABELS[e.category] ? e.category : "other";
			totals[c] = round2((totals[c] || 0) + e.amount);
		});
		const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
		const bar = $("category-bar");
		const legend = $("category-legend");
		bar.replaceChildren();
		legend.replaceChildren();
		$("breakdown").hidden = sorted.length === 0;
		sorted.forEach(([c, amount]) => {
			const seg = document.createElement("span");
			seg.className = "bar-seg category-" + c;
			seg.style.flexGrow = amount;
			bar.appendChild(seg);

			const li = document.createElement("li");
			const dot = document.createElement("span");
			dot.className = "dot category-" + c;
			li.append(dot, CATEGORY_LABELS[c] + " " + money.format(amount));
			legend.appendChild(li);
		});
		bar.setAttribute("aria-label", "Spending by category: " + sorted.map(([c, a]) => CATEGORY_LABELS[c] + " " + money.format(a)).join(", "));
	}

	function render() {
		const expenses = monthExpenses();
		renderBreakdown(expenses);
		renderSummary(expenses);
		renderTable(expenses);
	}

	function syncMonthInputs() {
		monthFilter.value = selectedMonth;
		const budget = state.budgets[selectedMonth];
		budgetAmount.value = budget !== undefined ? budget : "";
		fields.date.value = defaultDateFor(selectedMonth);
		showStatus("");
	}

	// ---------- CSV export ----------
	function csvCell(value) {
		let text = String(value);
		// Stop spreadsheets from running text that starts like a formula.
		if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
		return '"' + text.replace(/"/g, '""') + '"';
	}

	function exportCsv() {
		const expenses = monthExpenses();
		if (expenses.length === 0) {
			showStatus("Nothing to export for this month.", true);
			return;
		}
		const rows = [["Date", "Expense", "Category", "Note", "Amount"]].concat(
			expenses.map((e) => [e.date, e.name, CATEGORY_LABELS[e.category] || "Other", e.note || "", e.amount])
		);
		const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = "expenses-" + selectedMonth + ".csv";
		link.click();
		URL.revokeObjectURL(url);
	}

	// ---------- Events ----------
	monthFilter.addEventListener("change", () => {
		if (!/^\d{4}-\d{2}$/.test(monthFilter.value)) {
			monthFilter.value = selectedMonth;
			return;
		}
		selectedMonth = monthFilter.value;
		clearError(budgetAmount);
		Object.values(fields).forEach(clearError);
		syncMonthInputs();
		render();
	});

	budgetForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const value = validateBudget();
		if (value === null) {
			budgetAmount.focus();
			return;
		}
		const previous = state.budgets[selectedMonth];
		state.budgets[selectedMonth] = value;
		if (!saveState()) {
			if (previous === undefined) delete state.budgets[selectedMonth];
			else state.budgets[selectedMonth] = previous;
			showStatus(SAVE_FAILED, true);
			return;
		}
		showStatus("Budget saved.");
		render();
	});

	expenseForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const expense = validateExpense();
		if (!expense) return;

		state.expenses.push(expense);
		if (!saveState()) {
			state.expenses.pop();
			setError(fields.name, SAVE_FAILED);
			fields.name.focus();
			return;
		}

		selectedMonth = expense.date.slice(0, 7); // show the month the expense belongs to
		expenseForm.reset();
		syncMonthInputs();
		fields.date.value = expense.date;
		render();
		fields.name.focus();
	});

	Object.values(fields).forEach((input) => {
		input.addEventListener("input", () => clearError(input));
		input.addEventListener("change", () => clearError(input));
	});
	budgetAmount.addEventListener("input", () => {
		clearError(budgetAmount);
		showStatus("");
	});

	expenseList.addEventListener("click", (event) => {
		const btn = event.target.closest(".delete-button");
		if (!btn) return;
		const expense = state.expenses.find((e) => e.id === btn.dataset.id);
		if (!expense) return;
		if (!window.confirm('Delete "' + expense.name + '" (' + money.format(expense.amount) + ")?")) return;

		const before = state.expenses;
		state.expenses = before.filter((e) => e.id !== expense.id);
		if (!saveState()) {
			state.expenses = before; // keep the list in sync with what is stored
			showStatus(SAVE_FAILED, true);
		}
		render();
	});

	$("export-button").addEventListener("click", exportCsv);

	// ---------- Init ----------
	[budgetForm, expenseForm].forEach((form) => (form.noValidate = true));
	syncMonthInputs();
	render();
})();