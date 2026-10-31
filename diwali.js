// Diwali decoration layer: purely decorative, never blocks clicks.
(function () {
  const defs = `<defs>
<radialGradient id="dwGlow"><stop offset="0" stop-color="#F7A81B" stop-opacity=".55"/><stop offset="1" stop-color="#F7A81B" stop-opacity="0"/></radialGradient>
<linearGradient id="dwFl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a00"/><stop offset=".55" stop-color="#ffc63a"/><stop offset="1" stop-color="#fff6d0"/></linearGradient>
<linearGradient id="dwClay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2731f"/><stop offset="1" stop-color="#8c2d0e"/></linearGradient>
<path id="dwPetal" d="M0 0C22-40 22-90 0-130C-22-90-22-40 0 0Z"/>
<g id="dwDiya"><ellipse cy="-6" rx="70" ry="70" fill="url(#dwGlow)"/>
<path d="M-38 0Q0 34 38 0Q46-6 30-6L-30-6Q-46-6-38 0Z" fill="url(#dwClay)"/>
<path d="M-30-6Q0 4 30-6" stroke="#F7A81B" stroke-width="2" fill="none"/>
<path class="dw-flame" d="M0-8C-10-18-6-34 0-44C6-34 10-18 0-8Z" fill="url(#dwFl)"/></g>
<g id="dwMari"><circle r="9" fill="#F7A81B"/><circle r="5.5" fill="#ff8a00"/></g>
<path id="dwStar" d="M0-6L1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" fill="#FFE7A3"/></defs>`;

  // Garland across the top (scales with width)
  let mari = "";
  for (let s = 0; s < 4; s++) for (let k = 1; k < 8; k++) {
    const t = k / 8, x = s * 360 + t * 360, y = 30 + 80 * 2 * t * (1 - t) * 1;
    mari += `<use href="#dwMari" x="${x}" y="${y + 10}"/>`;
  }
  const lantern = (x, c, d) => `<g class="dw-lantern" style="animation-delay:${d}s" transform="translate(${x} 30)">
<line y2="70" stroke="#F7A81B" stroke-width="2"/><ellipse cy="110" rx="60" ry="60" fill="url(#dwGlow)"/>
<path d="M-18 70L18 70 32 108 18 150-18 150-32 108Z" fill="${c}"/>
<path d="M-18 70L0 108 18 70M-18 150L0 108 18 150M-32 108H32" stroke="#F7A81B" stroke-width="2" fill="none"/>
<path d="M-5 150L-8 182M0 150V188M5 150L8 182" stroke="#F7A81B" stroke-width="2"/></g>`;
  const top = `<svg class="dw-top" viewBox="0 0 1440 240" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${defs}
<path d="M0 30Q180 110 360 30T720 30T1080 30T1440 30" stroke="#2e7d32" stroke-width="3" fill="none"/>${mari}
<g fill="#2e7d32"><path d="M180 72q-10 30 0 48q10-18 0-48z"/><path d="M540 72q-10 30 0 48q10-18 0-48z"/><path d="M900 72q-10 30 0 48q10-18 0-48z"/><path d="M1260 72q-10 30 0 48q10-18 0-48z"/></g>
${lantern(360, "#D41367", 0)}${lantern(1080, "#17458F", 1)}</svg>`;

  const corner = (side) => `<svg class="dw-corner dw-${side}" viewBox="0 0 260 120" aria-hidden="true"><use href="#dwDiya" transform="translate(70 100)"/><use href="#dwDiya" transform="translate(190 108) scale(.8)"/></svg>`;

  let stars = "";
  for (let i = 0; i < 26; i++) stars += `<use href="#dwStar" x="${(i * 397) % 1440}" y="${120 + ((i * 263) % 700)}" style="animation-delay:${(i % 7) * 0.4}s"/>`;
  const sky = `<svg class="dw-sky" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="dw-tw">${stars}</g></svg>`;

  let petals = (n, sc, fill, rot) => { let s = `<g fill="${fill}" transform="rotate(${rot}) scale(${sc})">`; for (let i = 0; i < n; i++) s += `<use href="#dwPetal" transform="rotate(${i * 360 / n})"/>`; return s + "</g>"; };
  const rangoli = `<svg class="dw-rangoli" viewBox="-260 -260 520 520" aria-hidden="true"><g class="dw-spin">
<circle r="250" fill="none" stroke="#F7A81B" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>
${petals(12, 1.75, "#17458F", 0)}${petals(12, 1.35, "#D41367", 15)}${petals(8, .9, "#F7A81B", 0)}</g></svg>`;

  const back = document.createElement("div"); back.className = "dw-back"; back.innerHTML = sky + rangoli;
  const front = document.createElement("div"); front.className = "dw-front"; front.innerHTML = top + corner("l") + corner("r");
  document.body.prepend(back); document.body.append(front);
})();
