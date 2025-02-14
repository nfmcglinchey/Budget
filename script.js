document.addEventListener("DOMContentLoaded", function () {
  setTimeout(setDefaultDate, 500);
  loadBudget();
  populateFilters(); // Populate month/year dropdowns first

  setTimeout(() => {
    loadExpenses(); // Ensure expenses load AFTER default values are set
  }, 100); // Slight delay to allow dropdowns to populate
});

// Auto-populate today's date
function setDefaultDate() {
  let dateInput = document.getElementById("expense-date");
  if (!dateInput) {
    console.error("Date input field not found.");
    return;
  }
  let today = new Date();
  dateInput.value = today.toLocaleDateString('en-CA');
}

// Format date from YYYY-MM-DD to MM/DD/YYYY
function formatDate(isoDate) {
  let [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

// Parse a date string in local time (YYYY-MM-DD)
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function loadBudget() {
  let budgetTable = document.getElementById("budget-table");
  let categoryDropdown = document.getElementById("expense-category");

  if (!budgetTable || !categoryDropdown) {
    console.error("Budget table or category dropdown not found");
    return;
  }

  let budget = [
    { name: "Groceries", monthly: 1200 },
    { name: "Dining Out", monthly: 400 },
    { name: "Entertainment", monthly: 200 },
    { name: "Haircuts", monthly: 52 },
    { name: "Alcohol", monthly: 150 },
    { name: "Weekly Allowance", monthly: 1040 },
    { name: "Miscellaneous", monthly: 0 }
  ];

  budgetTable.innerHTML = `<tr>
                              <th>Category</th>
                              <th>Monthly Budget</th>
                              <th>Weekly Budget</th>
                              <th>Actual (Month)</th>
                              <th>Actual (Week)</th>
                           </tr>`;

  let totalMonthly = 0;
  let totalWeekly = 0;

  budget.forEach(category => {
    let weeklyBudget = (category.monthly * 12 / 52).toFixed(2);
    totalMonthly += category.monthly;
    totalWeekly += parseFloat(weeklyBudget);

    let row = budgetTable.insertRow();
    row.innerHTML = `<td>${category.name}</td>
                     <td>$${category.monthly.toFixed(2)}</td>
                     <td>$${weeklyBudget}</td>
                     <td class="actual-month">$0.00</td>
                     <td class="actual-week">$0.00</td>`;

    let option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    categoryDropdown.appendChild(option);
  });

  // Insert Total Row at the Bottom
  let totalRow = budgetTable.insertRow();
  totalRow.innerHTML = `<td><strong>Total</strong></td>
                        <td><strong>$${totalMonthly.toFixed(2)}</strong></td>
                        <td><strong>$${totalWeekly.toFixed(2)}</strong></td>
                        <td class="actual-month"><strong>$0.00</strong></td>
                        <td class="actual-week"><strong>$0.00</strong></td>`;
  totalRow.classList.add("total-row");
}

// Add a new expense
function addExpense() {
  let date = document.getElementById("expense-date")?.value;
  let category = document.getElementById("expense-category")?.value;
  let description = document.getElementById("expense-description")?.value.trim();
  let amount = parseFloat(document.getElementById("expense-amount")?.value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert("Please fill out all fields with valid data.");
    return;
  }

  let newExpense = { date, category, description, amount };

  push(ref(db, "expenses"), newExpense)
    .then(() => {
      console.log("Expense added successfully");
      loadExpenses();
    })
    .catch(error => console.error("Error adding expense:", error));
}

// Load expenses and update the budget
function loadExpenses() {
  let expensesTable = document.getElementById("expenses-table");
  let selectedMonth = document.getElementById("filter-month")?.value;
  let selectedYear = document.getElementById("filter-year")?.value;

  if (!expensesTable) {
    console.error("Expenses table not found");
    return;
  }

  // Clear the table before loading new data (retain header row)
  expensesTable.innerHTML = `<tr>
                              <th>Date</th>
                              <th>Category</th>
                              <th>Description</th>
                              <th>Amount</th>
                              <th>Action</th>
                            </tr>`;

  const expensesRef = ref(db, "expenses");

  // Reset budget actuals before recalculating
  resetBudgetActuals();

  // Calculate current week boundaries (Friday as first day)
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  let diff = (today.getDay() - 5 + 7) % 7;
  let startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - diff);
  let endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  console.log("Start of week:", startOfWeek);
  console.log("End of week:", endOfWeek);

  onValue(expensesRef, (snapshot) => {
    // Process each expense in the snapshot
    snapshot.forEach((childSnapshot) => {
      let expense = childSnapshot.val();
      // Parse expense date using local time
      let expenseDate = parseLocalDate(expense.date);
      let expenseMonth = (expenseDate.getMonth() + 1).toString();
      let expenseYear = expenseDate.getFullYear().toString();

      // If expense matches the selected month/year, add to table and update monthly totals
      if (expenseMonth === selectedMonth && expenseYear === selectedYear) {
        let formattedDate = formatDate(expense.date);
        let row = expensesTable.insertRow();
        row.innerHTML = `<td>${formattedDate}</td>
                         <td>${expense.category}</td>
                         <td>${expense.description || "—"}</td>
                         <td>$${expense.amount.toFixed(2)}</td>
                         <td><button onclick="deleteExpense('${childSnapshot.key}', '${expense.category}', ${expense.amount})">Delete</button></td>`;

        updateBudgetTotals(expense.category, expense.amount, expenseDate, "month");
      }
      // Update weekly totals if the expense falls within the current week
      if (expenseDate >= startOfWeek && expenseDate < endOfWeek) {
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "week");
      }
    });
    // Update Total Row after processing all expenses
    updateTotalRow();
  });
}

// Delete an expense
function deleteExpense(expenseId, category, amount) {
  if (!expenseId) {
    console.error("Invalid expense ID");
    return;
  }

  remove(ref(db, `expenses/${expenseId}`))
    .then(() => {
      console.log("Expense deleted successfully");
      loadExpenses();
    })
    .catch(error => console.error("Error deleting expense:", error));
}

// Reset all budget actuals to zero before recalculating
function resetBudgetActuals() {
  let budgetTable = document.getElementById("budget-table");
  let rows = budgetTable.getElementsByTagName("tr");

  for (let i = 1; i < rows.length; i++) {
    rows[i].cells[3].textContent = "$0.00"; // Reset Actual (Month)
    rows[i].cells[4].textContent = "$0.00"; // Reset Actual (Week)
  }
}

// Update budget totals for either month or week based on the 'type' parameter
function updateBudgetTotals(category, amount, expenseDate, type) {
  let budgetTable = document.getElementById("budget-table");
  let rows = budgetTable.getElementsByTagName("tr");

  // Loop through budget rows (excluding header and Total row)
  for (let i = 1; i < rows.length - 1; i++) {
    let row = rows[i];
    let rowCategory = row.cells[0].textContent;

    if (rowCategory === category) {
      if (type === "month") {
        let actualMonthCell = row.cells[3];
        let currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
        let newMonthTotal = currentMonthTotal + amount;
        actualMonthCell.textContent = `$${newMonthTotal.toFixed(2)}`;
        applyBudgetColors(actualMonthCell, newMonthTotal, parseFloat(row.cells[1].textContent.replace("$", "")));
      } else if (type === "week") {
        let actualWeekCell = row.cells[4];
        let currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;
        let newWeekTotal = currentWeekTotal + amount;
        actualWeekCell.textContent = `$${newWeekTotal.toFixed(2)}`;
        applyBudgetColors(actualWeekCell, newWeekTotal, parseFloat(row.cells[2].textContent.replace("$", "")));
      }
    }
  }
}

// Recalculate and update the total row for monthly and weekly actuals
function updateTotalRow() {
  let budgetTable = document.getElementById("budget-table");
  let rows = budgetTable.getElementsByTagName("tr");
  let totalMonthActual = 0;
  let totalWeekActual = 0;

  // Loop through budget rows (excluding header and Total row)
  for (let i = 1; i < rows.length - 1; i++) {
    totalMonthActual += parseFloat(rows[i].cells[3].textContent.replace("$", "")) || 0;
    totalWeekActual += parseFloat(rows[i].cells[4].textContent.replace("$", "")) || 0;
  }

  // Update Total Row
  let totalRow = rows[rows.length - 1];
  totalRow.cells[3].innerHTML = `<strong>$${totalMonthActual.toFixed(2)}</strong>`;
  totalRow.cells[4].innerHTML = `<strong>$${totalWeekActual.toFixed(2)}</strong>`;
}

// Apply budget color coding
function applyBudgetColors(cell, actual, budget) {
  cell.classList.remove("over-budget", "near-budget", "under-budget");

  if (actual > budget) {
    cell.classList.add("over-budget"); // Red
  } else if (actual > budget * 0.75) {
    cell.classList.add("near-budget"); // Yellow
  } else {
    cell.classList.add("under-budget"); // Green
  }
}

// Populate filters for selecting month and year
function populateFilters() {
  let monthSelect = document.getElementById("filter-month");
  let yearSelect = document.getElementById("filter-year");

  if (!monthSelect || !yearSelect) {
    console.error("Dropdowns not found.");
    return;
  }

  let today = new Date();
  let currentMonth = today.getMonth() + 1;
  let currentYear = today.getFullYear();

  let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  monthSelect.innerHTML = months
    .map((month, index) =>
      `<option value="${index + 1}" ${index + 1 === currentMonth ? 'selected' : ''}>${month}</option>`
    )
    .join("");

  yearSelect.innerHTML = [...Array(11)]
    .map((_, i) =>
      `<option value="${currentYear - i}" ${currentYear === (currentYear - i) ? 'selected' : ''}>${currentYear - i}</option>`
    )
    .join("");

  // Load expenses after setting filters
  loadExpenses();
}

document.getElementById("filter-month").addEventListener("change", loadExpenses);
document.getElementById("filter-year").addEventListener("change", loadExpenses);
