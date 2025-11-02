// === dashboard.js ===
// Loads user session history and visualizes with Chart.js

document.addEventListener("DOMContentLoaded", () => {
  const totalSessionsEl = document.getElementById("totalSessions");
  const totalRepsEl = document.getElementById("totalReps");
  const bestAccuracyEl = document.getElementById("bestAccuracy");
  const avgDurationEl = document.getElementById("avgDuration");
  const sessionList = document.getElementById("sessionList");

  const sessions = JSON.parse(localStorage.getItem("fitai_sessions") || "[]");

  if (sessions.length === 0) {
    sessionList.innerHTML = `<div class="session-log">No previous sessions yet.</div>`;
    return;
  }

  // === Basic Stats ===
  const totalSessions = sessions.length;
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps || 0), 0);
  const bestAccuracy = Math.max(...sessions.map(s => s.accuracy || 0));
  const avgDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / totalSessions;

  totalSessionsEl.textContent = totalSessions;
  totalRepsEl.textContent = totalReps;
  bestAccuracyEl.textContent = `${bestAccuracy}%`;
  avgDurationEl.textContent = `${Math.round(avgDuration / 60)}:${String(Math.round(avgDuration % 60)).padStart(2, '0')}`;

  // === Chart Data ===
  const labels = sessions.map(s => new Date(s.date).toLocaleDateString());
  const repsData = sessions.map(s => s.reps);

  const ctx = document.getElementById("progressChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Reps per Session",
        data: repsData,
        borderColor: "#00f0a3",
        backgroundColor: "rgba(0, 240, 163, 0.2)",
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#fff" } }
      },
      scales: {
        x: { ticks: { color: "#9aa6b2" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#9aa6b2" }, grid: { color: "rgba(255,255,255,0.05)" } },
      }
    }
  });

  // === Session List ===
  sessionList.innerHTML = "";
  sessions.slice().reverse().forEach(session => {
    const div = document.createElement("div");
    div.className = "session-log";
    div.innerHTML = `
      <strong>${new Date(session.date).toLocaleDateString()}</strong><br/>
      Reps: ${session.reps}, Duration: ${Math.round(session.duration / 60)}m ${Math.round(session.duration % 60)}s<br/>
      Accuracy: ${session.accuracy}%
    `;
    sessionList.appendChild(div);
  });
});
