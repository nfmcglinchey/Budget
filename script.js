/* Firebase Configuration */
const firebaseConfig = {
  apiKey: "AIzaSyA6ZFSK7jPIkiEv47yl8q-O1jh8DNvOsiI",
  authDomain: "budget-data-b9bcc.firebaseapp.com",
  databaseURL: "https://budget-data-b9bcc-default-rtdb.firebaseio.com",
  projectId: "budget-data-b9bcc",
  storageBucket: "budget-data-b9bcc.appspot.com",
  messagingSenderId: "798831217373",
  appId: "1:798831217373:web:0d011f497ad3b9ca85a934"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let expensesListener = null;
let spendingChart;
let pieChart;
let chartUpdateTimeout = null;
let showAllExpenses = false;
let editingExpenseId = null;

// Global variable for budget categories (loaded from Firebase)
let budgetCategories = [];

/*-------------------------------------------------------------
   Utility Functions
-------------------------------------------------------------*/
function isMobile() {
  return ('ontouchstart' in window) || (window.innerWidth <= 768);
}

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

/*-------------------------------------------------------------
   Category Management (stored in Firebase)
-------------------------------------------------------------*/
async function loadCategories() {
  try {
    db.ref("categories").on("value", snapshot => {
      if (snapshot.numChildren() === 0) {
        const defaults = [
          { name: "Groceries", monthly: 1200 },
          { name: "Dining Out", monthly: 400 },
          { name: "Entertainment", monthly: 200 },
          { name: "Haircuts", monthly: 52 },
          { name: "Alcohol", monthly: 150 },
          { name: "Weekly Allowance", monthly: 1040 },
          { name: "Miscellaneous", monthly: 0 }
        ];
        defaults.forEach(defaultCat => {
          db.ref("categories").push(defaultCat);
        });
        return;
      }
      budgetCategories = [];
      snapshot.forEach(childSnapshot => {
        let cat = childSnapshot.val();
        cat.id = childSnapshot.key;
        budgetCategories.push(cat);
      });
      renderCategoryList();
      populateExpenseCategoryDropdown();
      loadBudget(); // Refresh the budget table based on new categories
    });
  } catch (error) {
    console.error("Error loading categories:", error);
    showNotification("Error loading categories.");
  }
}

function renderCategoryList() {
  const categoryList = document.getElementById("category-list");
  categoryList.innerHTML = "";
  budgetCategories.forEach((cat) => {
    const li = document.createElement("li");
    li.textContent = `${cat.name} - $${parseFloat(cat.monthly).toFixed(2)}`;
    
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      const newName = prompt("Edit category name:", cat.name);
      const newMonthly = parseFloat(prompt("Edit monthly budget:", cat.monthly));
      if (newName && !isNaN(newMonthly)) {
        // Check for duplicates when name is changed
        if (
          newName.toLowerCase() !== cat.name.toLowerCase() &&
          budgetCategories.some(c => c.name.toLowerCase() === newName.toLowerCase())
        ) {
          showNotification("Duplicate category name. Please enter a unique category.");
          return;
        }
        db.ref("categories/" + cat.id).update({ name: newName, monthly: newMonthly })
          .catch(error => {
            console.error("Error updating category:", error);
            showNotification("Error updating category.");
          });
      } else {
        showNotification("Invalid input for editing category.");
      }
    });
    li.appendChild(editBtn);
    
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      customConfirm("Delete this category?").then(confirmed => {
        if (confirmed) {
          db.ref("categories/" + cat.id).remove()
            .catch(error => {
              console.error("Error deleting category:", error);
              showNotification("Error deleting category.");
            });
        }
      });
    });
    li.appendChild(deleteBtn);
    
    categoryList.appendChild(li);
  });
}

function populateExpenseCategoryDropdown() {
  const categoryDropdown = document.getElementById("expense-category");
  categoryDropdown.innerHTML = "";
  budgetCategories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat.name;
    option.textContent = cat.name;
    categoryDropdown.appendChild(option);
  });
}

/*-------------------------------------------------------------
   Budget and Expense Management
-------------------------------------------------------------*/
function loadBudget() {
  const budgetTable = document.getElementById("budget-table");
  if (!budgetTable) {
    console.error("Budget table not found");
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
  budgetCategories.forEach(category => {
    const monthlyVal = parseFloat(category.monthly);
    const weeklyBudget = (monthlyVal * 12 / 52).toFixed(2);
    totalMonthly += monthlyVal;
    totalWeekly += parseFloat(weeklyBudget);
    const row = budgetTable.insertRow();
    row.innerHTML = `
      <td>${category.name}</td>
      <td>$${monthlyVal.toFixed(2)}</td>
      <td>$${weeklyBudget}</td>
      <td class="actual-month" data-total="0">$0.00</td>
      <td class="actual-week" data-total="0">$0.00</td>
    `;
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

async function addExpense() {
  try {
    const date = document.getElementById("expense-date")?.value;
    const category = document.getElementById("expense-category")?.value;
    const description = document.getElementById("expense-description")?.value.trim();
    const amount = parseFloat(document.getElementById("expense-amount")?.value);
    
    if (!date || !category || !description || isNaN(amount) || amount <= 0) {
      showNotification("Please enter valid details.");
      return;
    }
    
    const expenseData = { date, category, description, amount };

    if (editingExpenseId) {
      await db.ref("expenses/" + editingExpenseId).update(expenseData);
      showNotification("Expense updated successfully");
    } else {
      await db.ref("expenses").push(expenseData);
      showNotification("Expense added successfully");
    }
    resetExpenseForm();
  } catch (error) {
    console.error("Error processing expense:", error);
    showNotification("Error processing expense. Please try again.");
  }
}

function resetExpenseForm() {
  document.getElementById("expense-date").value = new Date().toISOString().slice(0,10);
  document.getElementById("expense-category").selectedIndex = 0;
  document.getElementById("expense-description").value = "";
  document.getElementById("expense-amount").value = "";
  editingExpenseId = null;
  document.getElementById("add-expense-button").textContent = "Add Expense";
  document.getElementById("cancel-edit-button").style.display = "none";
  document.getElementById("add-expense-section").classList.remove("editing-mode");
}

function editExpense(expenseId, date, category, description, amount) {
  editingExpenseId = expenseId;
  document.getElementById("expense-date").value = date;
  document.getElementById("expense-category").value = category;
  document.getElementById("expense-description").value = description;
  document.getElementById("expense-amount").value = amount;
  document.getElementById("add-expense-button").textContent = "Update Expense";
  document.getElementById("cancel-edit-button").style.display = "inline-block";
  const addExpenseSection = document.getElementById("add-expense-section");
  const collapsibleContent = addExpenseSection.querySelector('.collapsible-content');
  if (collapsibleContent && (collapsibleContent.style.display === "none" || collapsibleContent.style.display === "")) {
    collapsibleContent.style.display = "block";
    const header = addExpenseSection.querySelector('.collapsible-header');
    if (header) header.classList.add("expanded");
  }
  addExpenseSection.classList.add("editing-mode");
  addExpenseSection.scrollIntoView({ behavior: "smooth" });
}

function cancelEdit() {
  resetExpenseForm();
}

function loadExpenses() {
  const expensesTable = document.getElementById("expenses-table");
  if (!expensesTable) {
    console.error("Expenses table not found");
    return;
  }
  const toggleButton = document.getElementById("toggle-expenses-button");
  if (toggleButton) {
    toggleButton.textContent = showAllExpenses ? "Show Newest 5" : "Show All";
  }
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
    const monthlyExpenses = [];
    snapshot.forEach(childSnapshot => {
      const expense = childSnapshot.val();
      const expenseDate = parseLocalDate(expense.date);
      const expenseMonth = (expenseDate.getMonth() + 1).toString();
      const expenseYear = expenseDate.getFullYear().toString();
      if (expenseMonth === selectedMonth && expenseYear === selectedYear) {
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "month");
        monthlyExpenses.push({
          key: childSnapshot.key,
          date: expense.date,
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          parsedDate: expenseDate
        });
      }
      if (expenseDate >= startOfWeek && expenseDate < endOfWeek) {
        updateBudgetTotals(expense.category, expense.amount, expenseDate, "week");
      }
    });
    monthlyExpenses.sort((a, b) => b.parsedDate - a.parsedDate);
    const finalExpenses = showAllExpenses ? monthlyExpenses : monthlyExpenses.slice(0, 5);

    finalExpenses.forEach(exp => {
      const formattedDate = formatDate(exp.date);

      if (isMobile()) {
        // Mobile version with swipe functionality
        const row = document.createElement("tr");
        row.classList.add("expense-swipe");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.style.position = "relative";

        // Create swipe actions container
        const swipeActions = document.createElement("div");
        swipeActions.classList.add("swipe-actions");

        const editBtn = document.createElement("button");
        editBtn.classList.add("swipe-edit");
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => {
          editExpense(exp.key, exp.date, exp.category, exp.description, exp.amount);
        });
        swipeActions.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("swipe-delete");
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          customConfirm("Swipe delete: Are you sure you want to delete this expense?")
            .then(confirmed => {
              if (confirmed) {
                deleteExpense(exp.key);
              }
            });
        });
        swipeActions.appendChild(deleteBtn);

        // Create swipe content container with expense details
        const swipeContent = document.createElement("div");
        swipeContent.classList.add("swipe-content");
        swipeContent.innerHTML = `
          <div class="expense-details">
            <span class="date">${formattedDate}</span>
            <span class="category">${exp.category}</span>
            <span class="description">${exp.description || "—"}</span>
            <span class="amount">$${exp.amount.toFixed(2)}</span>
          </div>
        `;

        // Append actions and content to cell
        cell.appendChild(swipeActions);
        cell.appendChild(swipeContent);
        row.appendChild(cell);

        // Add touch events for swipe
        let startX = 0, currentX = 0;
        const threshold = 80;
        swipeContent.addEventListener("touchstart", function(e) {
          startX = e.touches[0].clientX;
          swipeContent.style.transition = "";
        });
        swipeContent.addEventListener("touchmove", function(e) {
          currentX = e.touches[0].clientX;
          let deltaX = currentX - startX;
          if (deltaX < 0) { // swiping left
            swipeContent.style.transform = `translateX(${deltaX}px)`;
          }
        });
        swipeContent.addEventListener("touchend", function(e) {
          let deltaX = currentX - startX;
          if (deltaX < -threshold) {
            swipeContent.style.transition = "transform 0.3s ease";
            swipeContent.style.transform = "translateX(-160px)";
          } else {
            swipeContent.style.transition = "transform 0.3s ease";
            swipeContent.style.transform = "translateX(0)";
          }
        });

        expensesTable.appendChild(row);
      } else {
        // Desktop version: standard table row with inline buttons
        const row = document.createElement("tr");
        row.classList.add("expense-swipe");
        
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
        
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.style.marginRight = "8px";
        editBtn.addEventListener("click", () => {
          editExpense(exp.key, exp.date, exp.category, exp.description, exp.amount);
        });
        actionCell.appendChild(editBtn);
        
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          customConfirm("Are you sure you want to delete this expense?")
            .then(confirmed => {
              if (confirmed) {
                deleteExpense(exp.key);
              }
            });
        });
        actionCell.appendChild(deleteBtn);
        
        row.appendChild(actionCell);
        
        // Attach swipe-to-delete events to the delete button
        attachSwipeToDeleteOnButton(deleteBtn, row, exp.key);
        
        expensesTable.appendChild(row);
      }
    });
    updateTotalRow();
    updateChartDebounced();
    updatePieChart();
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
    if (rows[i].cells[3]) {
      rows[i].cells[3].setAttribute("data-total", "0");
      rows[i].cells[3].textContent = "$0.00";
    }
    if (rows[i].cells[4]) {
      rows[i].cells[4].setAttribute("data-total", "0");
      rows[i].cells[4].textContent = "$0.00";
    }
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
        let currentMonthTotal = parseFloat(actualMonthCell.getAttribute('data-total')) || 0;
        const newMonthTotal = currentMonthTotal + amount;
        actualMonthCell.setAttribute('data-total', newMonthTotal);
        const monthlyBudget = parseFloat(row.cells[1].textContent.replace("$", ""));
        applyBudgetColors(actualMonthCell, newMonthTotal, monthlyBudget);
        if (newMonthTotal > monthlyBudget) {
          actualMonthCell.innerHTML = `$${newMonthTotal.toFixed(2)} <span class="warning-icon" title="Over Budget!">⚠️</span>`;
        } else {
          actualMonthCell.textContent = `$${newMonthTotal.toFixed(2)}`;
        }
      } else if (type === "week") {
        const actualWeekCell = row.cells[4];
        let currentWeekTotal = parseFloat(actualWeekCell.getAttribute('data-total')) || 0;
        const newWeekTotal = currentWeekTotal + amount;
        actualWeekCell.setAttribute('data-total', newWeekTotal);
        const weeklyBudget = parseFloat(row.cells[2].textContent.replace("$", ""));
        applyBudgetColors(actualWeekCell, newWeekTotal, weeklyBudget);
        if (newWeekTotal > weeklyBudget) {
          actualWeekCell.innerHTML = `$${newWeekTotal.toFixed(2)} <span class="warning-icon" title="Over Budget!">⚠️</span>`;
        } else {
          actualWeekCell.textContent = `$${newWeekTotal.toFixed(2)}`;
        }
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
    totalMonthActual += parseFloat(rows[i].cells[3].getAttribute("data-total")) || 0;
    totalWeekActual += parseFloat(rows[i].cells[4].getAttribute("data-total")) || 0;
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
    cell.title = "Over budget: Spending exceeds the set budget.";
  } else if (actual > budget * 0.75) {
    cell.classList.add("near-budget");
    cell.title = "Near budget: Spending is close to the budget limit.";
  } else {
    cell.classList.add("under-budget");
    cell.title = "Under budget: Spending is within budget limits.";
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
          backgroundColor: "#1D72B8",
        },
        {
          label: "Actual Spending",
          data: [],
          backgroundColor: "#FF3B30",
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    }
  });
}

function initializePieChart() {
  const ctx = document.getElementById("pie-chart-canvas").getContext("2d");
  pieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          "#FF6384",
          "#36A2EB",
          "#FFCE56",
          "#4BC0C0",
          "#9966FF",
          "#FF9F40",
          "#34c759"
        ]
      }]
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
    const actualValue = parseFloat(cells[3].getAttribute("data-total")) || 0;
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

function updatePieChart() {
  const budgetTable = document.getElementById("budget-table");
  if (!budgetTable) return;
  const rows = budgetTable.getElementsByTagName("tr");
  const categorySpending = {};
  budgetCategories.forEach(cat => {
    categorySpending[cat.name] = 0;
  });
  for (let i = 1; i < rows.length - 1; i++) {
    const cells = rows[i].cells;
    const category = cells[0].textContent;
    const actualSpending = parseFloat(cells[3].getAttribute("data-total")) || 0;
    if (categorySpending.hasOwnProperty(category)) {
      categorySpending[category] += actualSpending;
    }
  }
  const labels = Object.keys(categorySpending);
  const data = Object.values(categorySpending);
  if (pieChart) {
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = data;
    pieChart.update();
  }
}

function customConfirm(message) {
  return new Promise(resolve => {
    const modal = document.getElementById("modal");
    const modalMessage = document.getElementById("modal-message");
    const confirmBtn = document.getElementById("modal-confirm");
    const cancelBtn = document.getElementById("modal-cancel");
    modalMessage.textContent = message;
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
    function cleanup() {
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    }
    function onConfirm() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// Existing swipe-to-delete for desktop (if needed)
function attachSwipeToDeleteOnButton(deleteBtn, row, expenseId) {
  let touchStartX = 0;
  let touchDeltaX = 0;
  let dragging = false;
  const threshold = 100; // pixels

  deleteBtn.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    dragging = false;
    row.style.transition = '';
  });

  deleteBtn.addEventListener('touchmove', function(e) {
    const currentX = e.changedTouches[0].screenX;
    touchDeltaX = currentX - touchStartX;
    if (Math.abs(touchDeltaX) > 10) {
      dragging = true;
    }
    if (touchDeltaX < 0) {
      row.style.transform = `translateX(${touchDeltaX}px)`;
      if (Math.abs(touchDeltaX) > threshold) {
        if (!row.classList.contains("swipe-delete-ready")) {
          row.classList.add("swipe-delete-ready");
          if (window.navigator.vibrate) {
            window.navigator.vibrate(50);
          }
        }
      } else {
        row.classList.remove("swipe-delete-ready");
      }
    }
  });

  deleteBtn.addEventListener('touchend', function(e) {
    if (dragging && Math.abs(touchDeltaX) > threshold) {
      row.style.transition = 'transform 0.2s ease-out';
      row.style.transform = 'translateX(-100%)';
      setTimeout(() => {
        customConfirm("Swipe delete: Are you sure you want to delete this expense?")
          .then(confirmed => {
            if (confirmed) {
              deleteExpense(expenseId);
            } else {
              row.style.transition = 'transform 0.2s ease-out';
              row.style.transform = 'translateX(0)';
              row.classList.remove("swipe-delete-ready");
            }
          });
      }, 200);
    } else {
      row.style.transition = 'transform 0.2s ease-out';
      row.style.transform = 'translateX(0)';
      row.classList.remove("swipe-delete-ready");
    }
    dragging = false;
    touchDeltaX = 0;
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(setDefaultDate, 500);
  loadCategories();
  populateFilters();
  initializeChart();
  initializePieChart();

  document.getElementById("add-expense-button").addEventListener("click", addExpense);

  const cancelEditButton = document.getElementById("cancel-edit-button");
  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", cancelEdit);
  }

  document.getElementById("filter-month").addEventListener("change", loadExpenses);
  document.getElementById("filter-year").addEventListener("change", loadExpenses);

  const toggleButton = document.getElementById("toggle-expenses-button");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      showAllExpenses = !showAllExpenses;
      loadExpenses();
    });
  }

  const toggleManageBtn = document.getElementById("toggle-manage-categories");
  const manageSection = document.getElementById("manage-categories");
  toggleManageBtn.addEventListener("click", () => {
    if (manageSection.style.display === "none" || manageSection.style.display === "") {
      manageSection.style.display = "block";
    } else {
      manageSection.style.display = "none";
    }
  });

  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      if (content.style.display === "none" || content.style.display === "") {
        content.style.display = "block";
        header.classList.add("expanded");
      } else {
        content.style.display = "none";
        header.classList.remove("expanded");
      }
    });
  });
});
