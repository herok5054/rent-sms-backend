const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();


// Use this instead of Cloud Run-style container
exports.sendSmsReminders = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "Africa/Kampala",
  },
  async (context) => {
    console.log("⏰ Running daily SMS reminders...");

    const snapshot = await db.collection("tenants").get();
    snapshot.forEach(async (doc) => {
      const tenant = doc.data();
      const payments = tenant.payments || [];
      const monthlyRent = tenant.monthlyRent;
      const originalDueDate = tenant.nextDueDate;

      if (!monthlyRent || !originalDueDate || !tenant.phone) return;

      const { status, daysUntilDue, amountOwed } = getRentStatus(
        payments,
        monthlyRent,
        originalDueDate
      );

      if (amountOwed <= 0) return;

      let message = "";
      if (status === "Due Soon" && daysUntilDue === 7) {
        message = `Hello ${tenant.name}. This is a reminder that your rent of ${amountOwed} is due in 7 days.`;
      } else if (status === "Due Today") {
        message = `Hello ${tenant.name}. Your rent of ${amountOwed} is due today. Please pay accordingly.`;
      }

      if (message) {
        try {
          const response = await axios.post("http://localhost:5000/send-sms", {
            phoneNumber: tenant.phone,
            message,
          });
          console.log(`✅ Sent to ${tenant.name}:`, response.data);
        } catch (err) {
          console.error(`❌ Failed to send SMS to ${tenant.name}:`, err.message);
        }
      }
    });
  }
);


function addMonthsKeepDate(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function getRentStatus(payments = [], monthlyRent, originalDueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dueDate = new Date(originalDueDate);
  dueDate.setHours(0, 0, 0, 0);
  let balance = 0;
  let paymentIndex = 0;
  let daysUntilDue = 0;

  const sortedPayments = [...payments].sort((a, b) => new Date(a.date) - new Date(b.date));

  if (dueDate > today) {
    const totalPaid = sortedPayments.reduce((sum, p) => sum + p.amount, 0);
    daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const amountOwed = monthlyRent - totalPaid;

    let status = "On Time";
    if (daysUntilDue <= 7 && daysUntilDue > 0) status = "Due Soon";
    else if (daysUntilDue === 0) status = "Due Today";

    return {
      status,
      daysUntilDue,
      amountOwed,
      nextDueDate: dueDate.toISOString().split("T")[0],
    };
  }

  while (dueDate <= today) {
    let paidThisCycle = 0;
    while (
      paymentIndex < sortedPayments.length &&
      new Date(sortedPayments[paymentIndex].date) <= dueDate
    ) {
      paidThisCycle += sortedPayments[paymentIndex].amount;
      paymentIndex++;
    }
    balance += monthlyRent - paidThisCycle;
    dueDate = addMonthsKeepDate(dueDate, 1);
  }

  daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  let status = "On Time";
  if (daysUntilDue <= 7 && daysUntilDue > 0) status = "Due Soon";
  else if (daysUntilDue === 0) status = "Due Today";

  return {
    status,
    daysUntilDue,
    amountOwed: balance,
    nextDueDate: dueDate.toISOString().split("T")[0],
  };
}
