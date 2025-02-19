// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA6ZFSK7jPIkiEv47yl8q-O1jh8DNvOsiI",
  authDomain: "budget-data-b9bcc.firebaseapp.com",
  databaseURL: "https://budget-data-b9bcc-default-rtdb.firebaseio.com",
  projectId: "budget-data-b9bcc",
  storageBucket: "budget-data-b9bcc.appspot.com",
  messagingSenderId: "798831217373",
  appId: "1:798831217373:web:0d011f497ad3b9ca85a934"
};

// Initialize Firebase (using compat libraries)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let expensesListener = null;
let spendingChart;
let chartUpdateTimeout = null;

// Track whether we're showing only newest 5 or all
let showAllExpenses = false;

// Global budget data array
const budgetDataArray = [
  { name: "Groceries", monthly: 1200 },
  { name: "Dining Out", monthly: 400 },
  { name: "Entertainment", monthly: 200 },
  { name: "Haircuts", monthly: 52 },
  { name: "Alcohol", monthly: 150 },
  { name: "Weekly Allowance", monthly: 1040 },
  { name: "Miscellaneous", monthly: 0 }
];

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(setDefaultDate, 500);
  loadBudget();
  populateFilters();
  initializeChart();

  // Add listeners for the Add Expense button
  document.getElementById("add-expense-button").addEventListener("click", addExpense);

  // Listeners for the month/year dropdown
  document.getElementById("filter-month").addEventListener("change", loadExpenses);
  document.getElementById("filter-year").addEventListener("change", loadExpenses);

  // Listener for the toggle button to show newest 5 vs all expenses
  const toggleButton = document.getElementById("toggle-expenses-button");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      showAllExpenses = !showAllExpenses;
      loadExpenses();
    });
  }
});

function setDefaultDate() {
  const dateInput = document.getElementById("expense-date");
  if (!dateInput) {
    console.error("Date input field not found.");
    return;
  }
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function loadBudget() {
  const budgetTable = document.getElementById("budget-table");
  const categoryDropdown = document.getElementById("expense-category");

  if (!budgetTable || !categoryDropdown) {
    console.error("Budget table or category dropdown not found");
    return;
  }

  budgetTable.innerHTML = `
    <tr>
      <th>Category</th>
      <th>Monthly Budget</th>
      <th>Weekly Budget</th>
      <th>Actual (Month)</th>
      <th>Actual (Week)</th>
    </tr>
  `;

  let totalMonthly = 0;
  let totalWeekly = 0;
  categoryDropdown.innerHTML = "";

  budgetDataArray.forEach(category => {
    const weeklyBudget = (category.monthly * 12 / 52).toFixed(2);
    totalMonthly += category.monthly;
    totalWeekly += parseFloat(weeklyBudget);

    const row = budgetTable.insertRow();
    row.innerHTML = `
      <td>${category.name}</td>
      <td>$${category.monthly.toFixed(2)}</td>
      <td>$${weeklyBudget}</td>
      <td class="actual-month">$0.00</td>
      <td class="actual-week">$0.00</td>
    `;

    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    categoryDropdown.appendChild(option);
  });

  const totalRow = budgetTable.insertRow();
  totalRow.innerHTML = `
    <td><strong>Total</strong></td>
    <td><strong>$${totalMonthly.toFixed(2)}</strong></td>
    <td><strong>$${totalWeekly.toFixed(2)}</strong></td>
    <td class="actual-month"><strong>$0.00</strong></td>
    <td class="actual-week"><strong>$0.00</strong></td>
  `;
  totalRow.classList.add("total-row");
}

function addExpense() {
  const date = document.getElementById("expense-date")?.value;
  const category = document.getElementById("expense-category")?.value;
  const description = document.getElementById("expense-description")?.value.trim();
  const amount = parseFloat(document.getElementById("expense-amount")?.value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert("Please fill out all fields with valid data.");
    return;
  }

  const newExpense = { date, category, description, amount };

  db.ref("expenses").push(newExpense)
    .then(() => {
      console.log("Expense added successfully");
      showNotification("Expense added successfully");
      setDefaultDate();
      document.getElementById("expense-category").selectedIndex = 0;
      document.getElementById("expense-description").value = "";
      document.getElementById("expense-amount").value = "";
    })
    .catch(error => {
      console.error("Error adding expense:", error);
      showNotification("Error adding expense");
    });
}

function loadExpenses() {
  const expensesTable = document.getElementById("expenses-table");
  if (!expensesTable) {
    console.error("Expenses table not found");
    return;
  }

  // Toggle button text
  const toggleButton = document.getElementById("toggle-expenses-button");
  if (toggleButton) {
    toggleButton.textContent = showAllExpenses ? "Show Newest 5" : "Show All";
  }

  // Prepare for weekly logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getDay() - 5 + 7) % 7;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - diff);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  if (expensesListener) {
    db.ref("expenses").off("value", expensesListener);
  }

  expensesListener = (snapshot) => {
    // Clear the table header each time the snapshot callback runs
    expensesTable.innerHTML = `
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Description</th>
        <th>Amount</th>
        <th>Action</th>
      </tr>
    `;

    resetBudgetActuals();

    const selectedMonth = document.getElementById("filter-month")?.value;
    const selectedYear = document.getElementById("filter-year")?.value;

    // Collect all monthly expenses in an array
    const monthlyExpenses = [];

    snapshot.forEach(childSnapshot => {
      const expense = childSnapshot.val();
      const expenseDate = parseLocalDate(expense.date);
      const expenseMonth = (expenseDate.getMonth() + 1).toString();
      const expenseYear = expenseDate.getFullYear().toString();

      // If this expense matches the selected month/year
      if (expenseMonth === selectedMonth && expenseYear === selectedYear) {
        // Always update monthly totals
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "month");

        // Add it to our monthlyExpenses array (for table display)
        monthlyExpenses.push({
          key: childSnapshot.key,
          date: expense.date,
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          parsedDate: expenseDate
        });
      }

      // Update weekly totals if the expense is in the current week
      if (expenseDate >= startOfWeek && expenseDate < endOfWeek) {
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "week");
      }
    });

    // Sort monthlyExpenses by date descending
    monthlyExpenses.sort((a, b) => b.parsedDate - a.parsedDate);

    // If we're not showing all, just keep the newest 5
    const finalExpenses = showAllExpenses ? monthlyExpenses : monthlyExpenses.slice(0, 5);

    // Now build the table rows for finalExpenses
    finalExpenses.forEach(exp => {
      const formattedDate = formatDate(exp.date);
      const row = document.createElement("tr");

      const dateCell = document.createElement("td");
      dateCell.textContent = formattedDate;
      row.appendChild(dateCell);

      const categoryCell = document.createElement("td");
      categoryCell.textContent = exp.category;
      row.appendChild(categoryCell);

      const descCell = document.createElement("td");
      descCell.textContent = exp.description || "—";
      row.appendChild(descCell);

      const amountCell = document.createElement("td");
      amountCell.textContent = `$${exp.amount.toFixed(2)}`;
      row.appendChild(amountCell);

      const actionCell = document.createElement("td");
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        deleteExpense(exp.key);
      });
      actionCell.appendChild(deleteBtn);
      row.appendChild(actionCell);

      expensesTable.appendChild(row);
    });

    updateTotalRow();
    updateChartDebounced();
  };

  db.ref("expenses").on("value", expensesListener);
}

function deleteExpense(expenseId) {
  if (!expenseId) {
    console.error("Invalid expense ID");
    return;
  }
  db.ref("expenses/" + expenseId).remove()
    .then(() => {
      console.log("Expense deleted successfully");
      showNotification("Expense deleted successfully");
    })
    .catch(error => {
      console.error("Error deleting expense:", error);
      showNotification("Error deleting expense");
    });
}

function resetBudgetActuals() {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");
  for (let i = 1; i < rows.length; i++) {
    rows[i].cells[3].textContent = "$0.00";
    rows[i].cells[4].textContent = "$0.00";
  }
}

function updateBudgetTotals(category, amount, expenseDate, type) {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");

  for (let i = 1; i < rows.length - 1; i++) {
    const row = rows[i];
    const rowCategory = row.cells[0].textContent;
    if (rowCategory === category) {
      if (type === "month") {
        const actualMonthCell = row.cells[3];
        const currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
        const newMonthTotal = currentMonthTotal + amount;
        actualMonthCell.textContent = `$${newMonthTotal.toFixed(2)}`;
        applyBudgetColors(actualMonthCell, newMonthTotal, parseFloat(row.cells[1].textContent.replace("$", "")));
      } else if (type === "week") {
        const actualWeekCell = row.cells[4];
        const currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;
        const newWeekTotal = currentWeekTotal + amount;
        actualWeekCell.textContent = `$${newWeekTotal.toFixed(2)}`;
        applyBudgetColors(actualWeekCell, newWeekTotal, parseFloat(row.cells[2].textContent.replace("$", "")));
      }
    }
  }
}

function updateTotalRow() {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");
  let totalMonthActual = 0;
  let totalWeekActual = 0;

  for (let i = 1; i < rows.length - 1; i++) {
    totalMonthActual += parseFloat(rows[i].cells[3].textContent.replace("$", "")) || 0;
    totalWeekActual += parseFloat(rows[i].cells[4].textContent.replace("$", "")) || 0;
  }

  const totalRow = rows[rows.length - 1];
  totalRow.cells[3].innerHTML = `<strong>$${totalMonthActual.toFixed(2)}</strong>`;
  totalRow.cells[4].innerHTML = `<strong>$${totalWeekActual.toFixed(2)}</strong>`;

  highlightCell(totalRow.cells[4]);
}

function highlightCell(cell) {
  cell.setAttribute("tabindex", "-1");
  cell.classList.add("highlight-week");
  cell.focus();
  setTimeout(() => {
    cell.classList.remove("highlight-week");
  }, 1500);
}

function applyBudgetColors(cell, actual, budget) {
  cell.classList.remove("over-budget", "near-budget", "under-budget");
  if (actual > budget) {
    cell.classList.add("over-budget");
  } else if (actual > budget * 0.75) {
    cell.classList.add("near-budget");
  } else {
    cell.classList.add("under-budget");
  }
}

function populateFilters() {
  const monthSelect = document.getElementById("filter-month");
  const yearSelect = document.getElementById("filter-year");

  if (!monthSelect || !yearSelect) {
    console.error("Dropdowns not found.");
    return;
  }

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  monthSelect.innerHTML = months
    .map((month, index) => {
      const isSelected = (index + 1 === currentMonth) ? "selected" : "";
      return `<option value="${index + 1}" ${isSelected}>${month}</option>`;
    })
    .join("");

  yearSelect.innerHTML = [...Array(11)]
    .map((_, i) => {
      const year = currentYear - i;
      const isSelected = (year === currentYear) ? "selected" : "";
      return `<option value="${year}" ${isSelected}>${year}</option>`;
    })
    .join("");

  loadExpenses();
}

function initializeChart() {
  const ctx = document.getElementById("chart-canvas").getContext("2d");
  spendingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Monthly Budget",
          data: [],
          backgroundColor: "#1D72B8", // Deep blue (fully opaque)
        },
        {
          label: "Actual Spending",
          data: [],
          backgroundColor: "#FF3B30", // Bright red (fully opaque)
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    }
  });
}


function updateChartDebounced() {
  if (chartUpdateTimeout) clearTimeout(chartUpdateTimeout);
  chartUpdateTimeout = setTimeout(() => {
    updateChart();
    chartUpdateTimeout = null;
  }, 300);
}

function updateChart() {
  const budgetTable = document.getElementById("budget-table");
  if (!budgetTable) return;
  const rows = budgetTable.getElementsByTagName("tr");
  const labels = [];
  const budgetValues = [];
  const actualValues = [];

  for (let i = 1; i < rows.length - 1; i++) {
    const cells = rows[i].cells;
    labels.push(cells[0].textContent);
    const budgetValue = parseFloat(cells[1].textContent.replace("$", "")) || 0;
    const actualValue = parseFloat(cells[3].textContent.replace("$", "")) || 0;
    budgetValues.push(budgetValue);
    actualValues.push(actualValue);
  }

  if (spendingChart) {
    spendingChart.data.labels = labels;
    spendingChart.data.datasets[0].data = budgetValues;
    spendingChart.data.datasets[1].data = actualValues;
    spendingChart.update();
  }
}

function showNotification(message) {
  const notification = document.getElementById("notification");
  if (!notification) return;
  notification.textContent = message;
  notification.classList.add("show");
  setTimeout(() => {
    notification.classList.remove("show");
  }, 2000);
}
