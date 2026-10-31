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

// ---------- v3: accounts + media ----------
const auth = {
  get token() { try { return localStorage.getItem("trivia_token"); } catch { return null; } },
  get user() { try { return localStorage.getItem("trivia_user"); } catch { return null; } },
  set(t, u) { try { localStorage.setItem("trivia_token", t); localStorage.setItem("trivia_user", u); } catch {} },
  clear() { try { localStorage.removeItem("trivia_token"); localStorage.removeItem("trivia_user"); } catch {} },
};
async function checkSession() {
  if (!auth.token) return false;
  const { data, error } = await db.rpc("trivia_me", { p_token: auth.token });
  if (error || !data) { auth.clear(); return false; }
  return true;
}
async function doAuth(mode, username, password) {
  const { data, error } = await db.rpc(mode === "signup" ? "trivia_signup" : "trivia_login", { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  auth.set(data.token, data.username);
}
async function logout() { if (auth.token) await db.rpc("trivia_logout", { p_token: auth.token }); auth.clear(); location.reload(); }

// Renders a login/signup form into `el`; calls onDone() once logged in.
function authForm(el, onDone) {
  let mode = "login";
  const draw = () => {
    el.innerHTML = `<form class="card authbox" style="width:min(380px,92vw)">
      <h2 style="margin:0">${mode === "login" ? "Log in" : "Create account"}</h2>
      <label>Username</label><input name="u" autocomplete="username" required minlength="3" maxlength="30">
      <label>Password</label><input name="p" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="4">
      <button class="btn" style="width:100%;margin-top:16px">${mode === "login" ? "Log in" : "Sign up"}</button>
      <p class="muted" style="text-align:center;margin:14px 0 0">${mode === "login" ? "New here?" : "Have an account?"}
        <a href="#" class="swap" style="color:var(--accent)">${mode === "login" ? "Create account" : "Log in"}</a></p>
      <div class="err"></div></form>`;
    el.querySelector(".swap").onclick = (e) => { e.preventDefault(); mode = mode === "login" ? "signup" : "login"; draw(); };
    el.querySelector("form").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; f.querySelector("button").disabled = true;
      try { await doAuth(mode, f.u.value.trim(), f.p.value); onDone(); }
      catch (err) { f.querySelector(".err").textContent = err.message.includes("username_check") ? "Username: 3–30 letters, numbers, _ . -" : err.message; }
      f.querySelector("button").disabled = false;
    };
  };
  draw();
}

const MAX_MEDIA = 5 * 1024 * 1024;
function mediaKind(type) { return type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : null; }
async function uploadMedia(file) {
  if (file.size > MAX_MEDIA) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — max is 5 MB`);
  const kind = mediaKind(file.type);
  if (!kind || (kind === "video" && file.type !== "video/mp4")) throw new Error("Use a photo, an MP3 or an MP4");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${uid()}${uid()}.${ext}`;
  const { error } = await db.storage.from("trivia-media").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return { url: db.storage.from("trivia-media").getPublicUrl(path).data.publicUrl, kind };
}
function mediaHTML(m, cls = "") {
  if (!m || !m.url) return "";
  const u = esc(m.url);
  if (m.kind === "image") return `<img class="media ${cls}" src="${u}" alt="">`;
  if (m.kind === "audio") return `<audio class="media ${cls}" src="${u}" controls></audio>`;
  if (m.kind === "video") return `<video class="media ${cls}" src="${u}" controls playsinline></video>`;
  return "";
}
