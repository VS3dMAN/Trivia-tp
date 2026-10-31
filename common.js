const { createClient } = supabase;
const db = createClient(TRIVIA_CONFIG.url, TRIVIA_CONFIG.key);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const TEAM_COLORS = ["#ff5a5f", "#3fa9f5", "#2ecc71", "#ffcc33", "#b46cff", "#ff8a3d", "#22d3c5", "#ff6fb5", "#9bd14b", "#7f8cff"];
const teamColor = (i) => TEAM_COLORS[i % TEAM_COLORS.length];
const members = (t) => t.members || [];

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function confettiBurst(opts = {}) {
  if (window.confetti) confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 }, ...opts });
}

async function fetchGame(id) {
  const { data, error } = await db.from("trivia_games").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Live updates via realtime, plus a slow poll as a safety net.
function watchGame(id, onChange) {
  db.channel("game-" + id)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trivia_games", filter: "id=eq." + id },
      (p) => onChange(p.new))
    .subscribe();
  setInterval(() => fetchGame(id).then(onChange).catch(() => {}), 5000);
}
