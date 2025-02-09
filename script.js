document.addEventListener("DOMContentLoaded", function () {
    setTimeout(setDefaultDate, 500);
    loadBudget();
    populateFilters(); // Populate month/year dropdowns first

    setTimeout(() => {
        loadExpenses(); // Ensure expenses load AFTER default values are set
    }, 100); // Delay slightly to allow dropdowns to populate
});

// Auto-populate today's date
function setDefaultDate() {
    let dateInput = document.getElementById("expense-date");
    if (!dateInput) {
        console.error("Date input field not found.");
        return;
    }
    let today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
}

// Format date from YYYY-MM-DD to DD/MM/YYYY
function formatDate(isoDate) {
    let [year, month, day] = isoDate.split("-");
    return `${month}/${day}/${year}`;  // Swap day and month
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
    totalRow.classList.add("total-row"); // Add a class for styling
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
let expensesLoaded = false; // Flag to track listener status

function loadExpenses() {
    let expensesTable = document.getElementById("expenses-table");
    let selectedMonth = document.getElementById("filter-month")?.value;
    let selectedYear = document.getElementById("filter-year")?.value;

    if (!expensesTable) {
        console.error("Expenses table not found");
        return;
    }

    // Clear the table before loading new data
    expensesTable.innerHTML = `<tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Action</th>
                             </tr>`;

    const expensesRef = ref(db, "expenses");

    // Prevent multiple listeners
    if (!expensesLoaded) {
        expensesLoaded = true; // Set flag to avoid multiple listeners

        onValue(expensesRef, (snapshot) => {
            let expenseData = [];

            snapshot.forEach((childSnapshot) => {
                let expense = childSnapshot.val();
                let expenseId = childSnapshot.key;

                let expenseDate = new Date(expense.date);
                let expenseMonth = (expenseDate.getMonth() + 1).toString(); // Convert to string
                let expenseYear = expenseDate.getFullYear().toString();

                // Filter only the selected month and year
                if (expenseMonth === selectedMonth && expenseYear === selectedYear) {
                    expenseData.push({ ...expense, id: expenseId });
                }
            });

            // Clear budget actuals before recalculating
            resetBudgetActuals();

            // Populate the table with filtered data
            expenseData.forEach(exp => {
                let formattedDate = formatDate(exp.date);
                let row = expensesTable.insertRow();
                row.innerHTML = `<td>${formattedDate}</td>
                                <td>${exp.category}</td>
                                <td>${exp.description || "—"}</td>
                                <td>$${exp.amount.toFixed(2)}</td>
                                <td><button onclick="deleteExpense('${exp.id}', '${exp.category}', ${exp.amount})">Delete</button></td>`;

                // Update budget totals
                updateBudgetTotals(exp.category, exp.amount);
            });
        });
    }
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
            loadExpenses(); // Reload expenses
        })
        .catch(error => console.error("Error deleting expense:", error));
}

// Reset all budget actuals to zero before recalculating
function resetBudgetActuals() {
    let budgetTable = document.getElementById("budget-table");
    let rows = budgetTable.getElementsByTagName("tr");

    for (let i = 1; i < rows.length; i++) {
        rows[i].cells[3].textContent = "$0.00"; // Reset actual (month)
        rows[i].cells[4].textContent = "$0.00"; // Reset actual (week)
    }
}

// Update budget totals when adding or deleting expenses
function updateBudgetTotals(category, amount) {
    let budgetTable = document.getElementById("budget-table");
    let rows = budgetTable.getElementsByTagName("tr");
    let totalMonthActual = 0;
    let totalWeekActual = 0;

    for (let i = 1; i < rows.length - 1; i++) { // Exclude the last row (Total row)
        let row = rows[i];
        let rowCategory = row.cells[0].textContent;

        if (rowCategory === category) {
            let actualMonthCell = row.cells[3];
            let actualWeekCell = row.cells[4];

            let currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
            let currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;

            actualMonthCell.textContent = `$${(currentMonthTotal + amount).toFixed(2)}`;
            actualWeekCell.textContent = `$${(currentWeekTotal + amount).toFixed(2)}`;

            applyBudgetColors(actualMonthCell, currentMonthTotal + amount, parseFloat(row.cells[1].textContent.replace("$", "")));
            applyBudgetColors(actualWeekCell, currentWeekTotal + amount, parseFloat(row.cells[2].textContent.replace("$", "")));
        }

        totalMonthActual += parseFloat(row.cells[3].textContent.replace("$", "")) || 0;
        totalWeekActual += parseFloat(row.cells[4].textContent.replace("$", "")) || 0;
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
    let currentMonth = today.getMonth() + 1; // JavaScript months are 0-based
    let currentYear = today.getFullYear();

    let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    monthSelect.innerHTML = months.map((month, index) =>
        `<option value="${index + 1}" ${index + 1 === currentMonth ? 'selected' : ''}>${month}</option>`
    ).join("");

    yearSelect.innerHTML = [...Array(11)].map((_, i) =>
        `<option value="${currentYear - i}" ${currentYear === (currentYear - i) ? 'selected' : ''}>${currentYear - i}</option>`
    ).join("");

    // Call loadExpenses after dropdowns are set
    loadExpenses();
}

document.getElementById("filter-month").addEventListener("change", loadExpenses);
document.getElementById("filter-year").addEventListener("change", loadExpenses);
