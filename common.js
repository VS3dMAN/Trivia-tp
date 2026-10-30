const { createClient } = supabase;
const db = createClient(TRIVIA_CONFIG.url, TRIVIA_CONFIG.key);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
