document.addEventListener("DOMContentLoaded", function () {
    loadBudget();
    loadExpenses();
    populateFilters();
    setDefaultDate();
});

// Function to auto-populate today's date based on the user's local timezone
function setDefaultDate() {
    let dateInput = document.getElementById("expense-date");
    if (dateInput) {
        let today = new Date();
        let timezoneOffset = today.getTimezoneOffset() * 60000;
        let localDate = new Date(today.getTime() - timezoneOffset);
        let formattedDate = localDate.toISOString().split('T')[0];
        dateInput.value = formattedDate;
    }
}

// Function to format date from YYYY-MM-DD to DD/MM/YYYY
function formatDate(isoDate) {
    let dateParts = isoDate.split("-");
    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
}

// Function to load budget table
function loadBudget() {
    let budgetTable = document.getElementById("budget-table");
    let categoryDropdown = document.getElementById("expense-category");

    if (!budgetTable || !categoryDropdown) {
        console.error("Elements not found");
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

    let totalMonthlyBudget = 0;
    let totalWeeklyBudget = 0;

    budget.forEach(category => {
        let weeklyBudget = (category.monthly * 12 / 52).toFixed(2);
        totalMonthlyBudget += category.monthly;
        totalWeeklyBudget += parseFloat(weeklyBudget);

        let row = budgetTable.insertRow();
        row.innerHTML = `<td>${category.name}</td>
                         <td>$${category.monthly.toFixed(2)}</td>
                         <td>$${weeklyBudget}</td>
                         <td>$0.00</td>
                         <td>$0.00</td>`;

        let option = document.createElement("option");
        option.value = category.name;
        option.textContent = category.name;
        categoryDropdown.appendChild(option);
    });

    // Append the total discretionary row
    let totalRow = budgetTable.insertRow();
    totalRow.id = "total-discretionary-row";
    totalRow.innerHTML = `<td><strong>Total Discretionary</strong></td>
                          <td><strong>$${totalMonthlyBudget.toFixed(2)}</strong></td>
                          <td><strong>$${totalWeeklyBudget.toFixed(2)}</strong></td>
                          <td><strong>$0.00</strong></td>
                          <td><strong>$0.00</strong></td>`;
}

// Function to populate filter options
function populateFilters() {
    let monthSelect = document.getElementById("filter-month");
    let yearSelect = document.getElementById("filter-year");

    if (!monthSelect || !yearSelect) {
        console.error("Filter elements not found");
        return;
    }

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth() + 1;
    let currentYear = currentDate.getFullYear();

    monthSelect.innerHTML = "";
    yearSelect.innerHTML = "";

    for (let i = 1; i <= 12; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = new Date(2023, i - 1).toLocaleString('default', { month: 'long' });
        if (i === currentMonth) option.selected = true;
        monthSelect.appendChild(option);
    }

    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        if (i === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

// Function to load expenses from Firebase
function loadExpenses() {
    let expensesTable = document.getElementById("expenses-table");

    if (!expensesTable) {
        console.error("Expenses table not found");
        return;
    }

    expensesTable.innerHTML = `<tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Action</th>
                             </tr>`;

    onValue(ref(db, "expenses"), (snapshot) => {
        let expenseData = [];

        snapshot.forEach((childSnapshot) => {
            let expense = childSnapshot.val();
            let expenseId = childSnapshot.key;
            expenseData.push({ ...expense, id: expenseId });
        });

        expenseData.forEach(exp => {
            let formattedDate = formatDate(exp.date);
            let row = expensesTable.insertRow();
            row.innerHTML = `<td>${formattedDate}</td>
                             <td>${exp.category}</td>
                             <td>${exp.description ? exp.description : "—"}</td>
                             <td>$${exp.amount.toFixed(2)}</td>
                             <td><button onclick="deleteExpense('${exp.id}')">Delete</button></td>`;
        });

        expenseData.forEach(exp => updateBudgetTotals(exp.category, exp.date, exp.amount));
    });
}

// Function to update budget totals and apply color coding
function updateBudgetTotals(category, expenseDate, amount) {
    let budgetTable = document.getElementById("budget-table");
    let rows = budgetTable.getElementsByTagName("tr");

    let totalMonth = 0;
    let totalWeek = 0;

    for (let i = 1; i < rows.length - 1; i++) { 
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

        totalMonth += parseFloat(row.cells[3].textContent.replace("$", "")) || 0;
        totalWeek += parseFloat(row.cells[4].textContent.replace("$", "")) || 0;
    }

    let totalRow = document.getElementById("total-discretionary-row");
    if (totalRow) {
        totalRow.cells[3].innerHTML = `<strong>$${totalMonth.toFixed(2)}</strong>`;
        totalRow.cells[4].innerHTML = `<strong>$${totalWeek.toFixed(2)}</strong>`;
    }
}

// Function to apply color-coding based on budget status
function applyBudgetColors(cell, actual, budget) {
    if (actual > budget) {
        cell.style.backgroundColor = "red";
        cell.style.color = "white";
    } else if (actual > budget * 0.75) {
        cell.style.backgroundColor = "yellow";
        cell.style.color = "black";
    } else {
        cell.style.backgroundColor = "green";
        cell.style.color = "white";
    }
}
