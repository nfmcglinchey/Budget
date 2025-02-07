document.addEventListener("DOMContentLoaded", function () {
    loadBudget();
    loadExpenses();
    populateFilters();
    setDefaultDate();
});

// Function to auto-populate today's date
function setDefaultDate() {
    let dateInput = document.getElementById("expense-date");
    if (dateInput) {
        let today = new Date();
        let formattedDate = today.toISOString().split('T')[0]; // Format YYYY-MM-DD for input field
        dateInput.value = formattedDate;
    }
}

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
        { name: "Miscellaneous", monthly: 0 },
        { name: "Total Discretionary", monthly: 3042 }
    ];

    budgetTable.innerHTML = `<tr>
                                <th>Category</th>
                                <th>Monthly Budget</th>
                                <th>Weekly Budget</th>
                                <th>Actual (Month)</th>
                                <th>Actual (Week)</th>
                             </tr>`;

    budget.forEach(category => {
        let weeklyBudget = (category.monthly * 12 / 52).toFixed(2);
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
}

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

    // Reset budget totals
    document.querySelectorAll("#budget-table tr").forEach((row, index) => {
        if (index > 0) { // Skip header row
            row.cells[3].textContent = "$0.00"; // Reset monthly total
            row.cells[4].textContent = "$0.00"; // Reset weekly total
        }
    });

    // Load data from Firebase
    onValue(ref(db, "expenses"), (snapshot) => {
        snapshot.forEach((childSnapshot) => {
            let expense = childSnapshot.val();
            let expenseId = childSnapshot.key;

            let row = expensesTable.insertRow();
            row.innerHTML = `<td>${expense.date}</td>
                             <td>${expense.category}</td>
                             <td>${expense.description || "—"}</td>
                             <td>$${expense.amount.toFixed(2)}</td>
                             <td><button onclick="deleteExpense('${expenseId}')">Delete</button></td>`;

            // Update the budget totals dynamically
            updateBudgetTotals(expense.category, expense.date, expense.amount);
        });
    });
}

function addExpense() {
    let date = document.getElementById("expense-date").value;
    let category = document.getElementById("expense-category").value;
    let description = document.getElementById("expense-description").value.trim();
    let amount = parseFloat(document.getElementById("expense-amount").value);

    if (!date || !category || isNaN(amount)) {
        alert("Please fill all fields correctly.");
        return;
    }

    let formattedDate = new Date(date).toISOString().split('T')[0];

    let expenseData = { date: formattedDate, category, description, amount };

    // Push to Firebase
    let expenseRef = push(ref(db, "expenses"), expenseData);

    // Update budget totals
    updateBudgetTotals(category, formattedDate, amount);
}

function deleteExpense(expenseId) {
    const expenseRef = ref(db, "expenses/" + expenseId);

    onValue(expenseRef, (snapshot) => {
        if (snapshot.exists()) {
            let expense = snapshot.val();
            let category = expense.category;
            let amount = parseFloat(expense.amount);

            // Remove the expense
            remove(expenseRef);

            // Update budget totals after delete
            updateBudgetTotalsAfterDelete(category, amount);
        }
    }, { onlyOnce: true });
}

function updateBudgetTotals(category, expenseDate, amount) {
    let budgetTable = document.getElementById("budget-table");
    let rows = budgetTable.getElementsByTagName("tr");

    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        let rowCategory = row.cells[0].textContent;

        if (rowCategory === category) {
            let actualMonthCell = row.cells[3];
            let actualWeekCell = row.cells[4];

            let currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
            let currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;

            actualMonthCell.textContent = `$${(currentMonthTotal + amount).toFixed(2)}`;
            actualWeekCell.textContent = `$${(currentWeekTotal + amount).toFixed(2)}`;
        }
    }
}

function updateBudgetTotalsAfterDelete(category, amount) {
    let budgetTable = document.getElementById("budget-table");
    let rows = budgetTable.getElementsByTagName("tr");

    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        let rowCategory = row.cells[0].textContent;

        if (rowCategory === category) {
            let actualMonthCell = row.cells[3];
            let actualWeekCell = row.cells[4];

            let currentMonthTotal = parseFloat(actualMonthCell.textContent.replace("$", "")) || 0;
            let currentWeekTotal = parseFloat(actualWeekCell.textContent.replace("$", "")) || 0;

            actualMonthCell.textContent = `$${(currentMonthTotal - amount).toFixed(2)}`;
            actualWeekCell.textContent = `$${(currentWeekTotal - amount).toFixed(2)}`;
        }
    }
}
