import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getDatabase, ref, push, onValue, off, remove } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let expensesListener = null; // To manage the Firebase listener

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(setDefaultDate, 500);
  loadBudget();
  populateFilters(); // Populate month/year dropdowns first

  // Attach event listener for the Add Expense button
  document.getElementById("add-expense-button").addEventListener("click", addExpense);

  // Attach event listeners for filter changes
  document.getElementById("filter-month").addEventListener("change", loadExpenses);
  document.getElementById("filter-year").addEventListener("change", loadExpenses);
});

// Auto-populate today's date using ISO format (yyyy-mm-dd)
function setDefaultDate() {
  const dateInput = document.getElementById("expense-date");
  if (!dateInput) {
    console.error("Date input field not found.");
    return;
  }
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);
}

// Format date from "YYYY-MM-DD" to "MM/DD/YYYY"
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

// Parse "YYYY-MM-DD" as a local date
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function loadBudget() {
  const budgetTable = document.getElementById("budget-table");
  const categoryDropdown = document.getElementById("expense-category");

  if (!budgetTable || !categoryDropdown) {
    console.error("Budget table or category dropdown not found");
    return;
  }

  const budget = [
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

  // Clear category dropdown before populating
  categoryDropdown.innerHTML = "";

  budget.forEach(category => {
    const weeklyBudget = (category.monthly * 12 / 52).toFixed(2);
    totalMonthly += category.monthly;
    totalWeekly += parseFloat(weeklyBudget);

    const row = budgetTable.insertRow();
    row.innerHTML = `<td>${category.name}</td>
                     <td>$${category.monthly.toFixed(2)}</td>
                     <td>$${weeklyBudget}</td>
                     <td class="actual-month">$0.00</td>
                     <td class="actual-week">$0.00</td>`;

    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    categoryDropdown.appendChild(option);
  });

  // Insert Total Row at the Bottom
  const totalRow = budgetTable.insertRow();
  totalRow.innerHTML = `<td><strong>Total</strong></td>
                        <td><strong>$${totalMonthly.toFixed(2)}</strong></td>
                        <td><strong>$${totalWeekly.toFixed(2)}</strong></td>
                        <td class="actual-month"><strong>$0.00</strong></td>
                        <td class="actual-week"><strong>$0.00</strong></td>`;
  totalRow.classList.add("total-row");
}

// Add a new expense
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

  push(ref(db, "expenses"), newExpense)
    .then(() => {
      console.log("Expense added successfully");
      // The live listener updates the UI.
    })
    .catch(error => console.error("Error adding expense:", error));
}

// Load expenses and update the budget
function loadExpenses() {
  const expensesTable = document.getElementById("expenses-table");
  if (!expensesTable) {
    console.error("Expenses table not found");
    return;
  }

  // Clear the table header
  expensesTable.innerHTML = `<tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Action</th>
                              </tr>`;

  const expensesRef = ref(db, "expenses");

  // Calculate current week boundaries (Friday as first day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getDay() - 5 + 7) % 7;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - diff);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  // Detach previous listener if it exists
  if (expensesListener) {
    off(expensesRef, "value", expensesListener);
  }

  // Define and attach the new listener
  expensesListener = function(snapshot) {
    // Reset totals at the start of each snapshot update
    resetBudgetActuals();

    // Re-read filter values for updated filtering
    const selectedMonth = document.getElementById("filter-month")?.value;
    const selectedYear = document.getElementById("filter-year")?.value;

    // Clear table except header row
    expensesTable.innerHTML = `<tr>
                                  <th>Date</th>
                                  <th>Category</th>
                                  <th>Description</th>
                                  <th>Amount</th>
                                  <th>Action</th>
                                </tr>`;

    snapshot.forEach(childSnapshot => {
      const expense = childSnapshot.val();
      const expenseDate = parseLocalDate(expense.date);
      const expenseMonth = (expenseDate.getMonth() + 1).toString();
      const expenseYear = expenseDate.getFullYear().toString();

      // If expense matches the selected month/year, add to table and update monthly totals
      if (expenseMonth === selectedMonth && expenseYear === selectedYear) {
        const formattedDate = formatDate(expense.date);
        const row = document.createElement("tr");

        const dateCell = document.createElement("td");
        dateCell.textContent = formattedDate;
        row.appendChild(dateCell);

        const categoryCell = document.createElement("td");
        categoryCell.textContent = expense.category;
        row.appendChild(categoryCell);

        const descCell = document.createElement("td");
        descCell.textContent = expense.description || "—";
        row.appendChild(descCell);

        const amountCell = document.createElement("td");
        amountCell.textContent = `$${expense.amount.toFixed(2)}`;
        row.appendChild(amountCell);

        const actionCell = document.createElement("td");
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", function () {
          deleteExpense(childSnapshot.key, expense.category, expense.amount);
        });
        actionCell.appendChild(deleteBtn);
        row.appendChild(actionCell);

        expensesTable.appendChild(row);

        // Update monthly totals for this category
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "month");
      }

      // Independently update weekly totals if within the current week
      if (expenseDate >= startOfWeek && expenseDate < endOfWeek) {
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "week");
      }
    });
    // Update the final total row after processing all expenses
    updateTotalRow();
  };

  onValue(expensesRef, expensesListener);
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
      // The live listener updates the UI.
    })
    .catch(error => console.error("Error deleting expense:", error));
}

// Reset all budget actuals to zero before recalculating
function resetBudgetActuals() {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");

  for (let i = 1; i < rows.length; i++) {
    rows[i].cells[3].textContent = "$0.00"; // Reset Actual (Month)
    rows[i].cells[4].textContent = "$0.00"; // Reset Actual (Week)
  }
}

// Update budget totals for either month or week
function updateBudgetTotals(category, amount, expenseDate, type) {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");

  // Loop through budget rows (excluding header and Total row)
  for (let i = 1; i < rows.length - 1; i++) {
    const row = rows[i];
    const rowCategory = row.cells[0].textContent;

    if (rowCategory === category) {
      if (type === "month") {
        const actualMonthCell = row.cells[3];
        const currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
        const newMonthTotal = currentMonthTotal + amount;
        actualMonthCell.textContent = `$${newMonthTotal.toFixed(2)}`;
        applyBudgetColors(
          actualMonthCell,
          newMonthTotal,
          parseFloat(row.cells[1].textContent.replace("$", ""))
        );
      } else if (type === "week") {
        const actualWeekCell = row.cells[4];
        const currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;
        const newWeekTotal = currentWeekTotal + amount;
        actualWeekCell.textContent = `$${newWeekTotal.toFixed(2)}`;
        applyBudgetColors(
          actualWeekCell,
          newWeekTotal,
          parseFloat(row.cells[2].textContent.replace("$", ""))
        );
      }
    }
  }
}

// Recalculate and update the total row for monthly and weekly actuals
function updateTotalRow() {
  const budgetTable = document.getElementById("budget-table");
  const rows = budgetTable.getElementsByTagName("tr");
  let totalMonthActual = 0;
  let totalWeekActual = 0;

  // Loop through budget rows (excluding header and Total row)
  for (let i = 1; i < rows.length - 1; i++) {
    totalMonthActual += parseFloat(rows[i].cells[3].textContent.replace("$", "")) || 0;
    totalWeekActual += parseFloat(rows[i].cells[4].textContent.replace("$", "")) || 0;
  }

  // Update Total Row
  const totalRow = rows[rows.length - 1];
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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Populate month dropdown
  monthSelect.innerHTML = months
    .map((month, index) => {
      const isSelected = (index + 1 === currentMonth) ? 'selected' : '';
      return `<option value="${index + 1}" ${isSelected}>${month}</option>`;
    })
    .join("");

  // Populate year dropdown (past 10 years + current year)
  yearSelect.innerHTML = [...Array(11)]
    .map((_, i) => {
      const year = currentYear - i;
      const isSelected = (year === currentYear) ? 'selected' : '';
      return `<option value="${year}" ${isSelected}>${year}</option>`;
    })
    .join("");

  // Load expenses after setting filters
  loadExpenses();
}
