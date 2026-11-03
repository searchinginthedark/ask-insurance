"use strict";

// All content comes from data/*.json, built by tools/build_data.py. Everything is rendered
// with textContent, never innerHTML, so scraped text can never become markup.

const GROUPS = [
  ["Hospital and medical bills", ["hospitalisation", "ip_rider", "hospital_cash", "outpatient"]],
  ["Death and long-term income", ["term_life", "whole_life", "disability_income"]],
  ["Serious illness and care", ["critical_illness", "cancer", "long_term_care"]],
  ["Accidents", ["personal_accident"]],
  ["Life stages and add-ons", ["maternity_child", "rider"]],
];
const UNVERIFIED = new Set(["blocked", null, undefined]);

const state = { guide: null, insurers: [], products: [], cats: {}, schemes: {}, compare: {}, gloss: {} };
const main = document.getElementById("main");

// ---------- tiny DOM helper ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  // Infinity: a kid built with .map() returning [sep, el] pairs nests two deep, and a
  // one-level flat stringified the inner pair into ",https://..." (Compare intro).
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------- mascot and category icons: decorative only, hidden from screen readers ----------
// Colours come from CSS custom properties so both themes restyle them without new markup.
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  el.append(...kids.flat(3).filter(Boolean));
  return el;
}

// The shield from the app icon, with a face. Poses change only the eyes, mouth and arms.
// ---------- looks and mascots ----------
// Two looks: "pandan" (default) with Kopi the otter, and "berry" with Pip the hedgehog. Colours
// come from the --m-* tokens in app.css, so each mascot follows light and dark. Every pose keeps
// the face's ink on the pale muzzle (--m-belly), checked at 3:1 by tools/contrast.py.
const LOOKS = { pandan: { name: "Pandan Sunrise", mascot: "Kopi", animal: "otter", theme: "#1f6b4a" },
                berry: { name: "Berry Pop", mascot: "Pip", animal: "hedgehog", theme: "#b0175a" } };
function look() { return document.documentElement.getAttribute("data-look") === "berry" ? "berry" : "pandan"; }
function mascotName() { return LOOKS[look()].mascot; }

const MV = { body: "var(--m-body)", dk: "var(--m-body-dk)", belly: "var(--m-belly)", ink: "var(--m-ink)", cheek: "var(--m-cheek)", acc: "var(--m-acc)" };
// Six poses the site uses: happy, wave, think, alert (careful), oops (something failed), read.
const POSES = { happy: ["", "smile"], wave: ["", "smile"], think: ["up", "o"], alert: ["wide", "wobble"], oops: ["wide", "wobble"], read: ["down", "smile"] };
function mEyes(x1, x2, y, mode) {
  if (mode === "shut") return [x1, x2].map(x => `<path d="M${x - 3.5} ${y} h7" fill="none" stroke="${MV.ink}" stroke-width="2.4" stroke-linecap="round"/>`).join("");
  const dy = mode === "up" ? -1.6 : mode === "down" ? 1.4 : 0, ry = mode === "wide" ? 4.4 : 3.7;
  return [x1, x2].map(x => `<g class="eye"><ellipse cx="${x}" cy="${y + dy}" rx="3" ry="${ry}" fill="${MV.ink}"/><circle cx="${x + 1.1}" cy="${y + dy - 1.4}" r="1.1" fill="#fff"/></g>`).join("");
}
function mMouth(kind, x, y) {
  if (kind === "o") return `<ellipse cx="${x}" cy="${y + 1}" rx="2.1" ry="2.6" fill="${MV.ink}"/>`;
  if (kind === "wobble") return `<path d="M${x - 5} ${y + 1} q2.5 -3 5 0 q2.5 3 5 0" fill="none" stroke="${MV.ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  return `<path d="M${x - 4.5} ${y - 1} q4.5 5 9 0" fill="none" stroke="${MV.ink}" stroke-width="2.4" stroke-linecap="round"/>`;
}
const mCheeks = (x1, x2, y) => `<ellipse cx="${x1}" cy="${y}" rx="4" ry="2.4" fill="${MV.cheek}" opacity=".85"/><ellipse cx="${x2}" cy="${y}" rx="4" ry="2.4" fill="${MV.cheek}" opacity=".85"/>`;
const mBook = `<rect x="34" y="70" width="32" height="18" rx="3" fill="var(--brand)"/><path d="M50 72 V86" stroke="var(--on-brand)" stroke-width="1.8" stroke-linecap="round"/>`;

function drawOtter(pose) {
  const [em, mk] = POSES[pose];
  const up = pose === "wave" ? "M70 62 Q82 50 78 38" : pose === "think" ? "M70 64 Q66 60 58 60" : pose === "oops" ? "M70 60 Q80 46 68 34" : pose === "read" ? "M70 66 Q66 74 60 76" : "M70 64 Q78 70 74 78";
  const left = pose === "read" ? "M30 66 Q34 74 40 76" : "M30 64 Q22 70 26 78";
  // Careful: Kopi opens the umbrella over whatever can hurt you.
  const brolly = pose === "alert" ? `<path d="M20 24 Q50 -4 80 24 Z" fill="${MV.acc}"/><path d="M20 24 q7.5 -5 15 0 q7.5 -5 15 0 q7.5 -5 15 0 q7.5 -5 15 0" fill="none" stroke="#fff" stroke-width="1.6" opacity=".75"/><path d="M50 24 V36" stroke="${MV.ink}" stroke-width="2"/>` : "";
  return `${brolly}<ellipse cx="50" cy="70" rx="25" ry="25" fill="${MV.body}"/>
    <ellipse cx="50" cy="74" rx="15" ry="16" fill="${MV.belly}"/>
    <path d="${left}" fill="none" stroke="${MV.dk}" stroke-width="6.5" stroke-linecap="round"/>
    <circle cx="28.5" cy="38" r="4.6" fill="${MV.dk}"/><circle cx="71.5" cy="38" r="4.6" fill="${MV.dk}"/>
    <ellipse cx="50" cy="46" rx="24" ry="20" fill="${MV.body}"/>
    <ellipse cx="50" cy="49" rx="18" ry="13" fill="${MV.belly}"/>
    ${mEyes(42, 58, 43.5, em)}${mCheeks(34.5, 65.5, 52)}
    <circle cx="45.6" cy="53.2" r="4.4" fill="${MV.belly}" stroke="${MV.dk}" stroke-width=".8" stroke-opacity=".35"/>
    <circle cx="54.4" cy="53.2" r="4.4" fill="${MV.belly}" stroke="${MV.dk}" stroke-width=".8" stroke-opacity=".35"/>
    <ellipse cx="50" cy="49.4" rx="3.6" ry="2.6" fill="${MV.ink}"/>${mMouth(mk, 50, 59)}
    <path d="M42 52 l-12 -2.5 M42 54.5 l-12 1 M58 52 l12 -2.5 M58 54.5 l12 1" stroke="${MV.ink}" stroke-width="1.1" opacity=".6" stroke-linecap="round"/>
    ${pose === "read" ? mBook : ""}<path d="${up}" fill="none" stroke="${MV.dk}" stroke-width="6.5" stroke-linecap="round"/>`;
}
function drawHedgehog(pose) {
  const [em, mk] = POSES[pose];
  const curl = pose === "alert"; // Careful: Pip curls into a spiky ball.
  const cx = 50, cy = curl ? 58 : 56, r = curl ? 27 : 30, n = curl ? 18 : 13, a0 = curl ? 0 : Math.PI * .95, a1 = curl ? Math.PI * 2 : Math.PI * 2.05;
  let sp = "";
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, b = a + (a1 - a0) / n / 2;
    sp += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} L${(cx + Math.cos(b) * (r + 11)).toFixed(1)} ${(cy + Math.sin(b) * (r + 11)).toFixed(1)} `;
  }
  if (curl) return `<path d="${sp}Z" fill="${MV.dk}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${MV.body}"/>
    <circle cx="50" cy="62" r="13" fill="${MV.belly}"/>${mEyes(45, 55, 60, "shut")}<circle cx="50" cy="67" r="2.2" fill="${MV.ink}"/>`;
  const armR = pose === "wave" ? "M70 66 Q80 56 77 46" : pose === "think" ? "M68 70 Q64 66 58 66" : pose === "oops" ? "M70 64 Q78 52 66 42" : pose === "read" ? "M70 72 Q66 78 60 78" : "M70 70 Q76 76 72 82";
  const armL = pose === "read" ? "M30 72 Q34 78 40 78" : "M30 70 Q24 76 28 82";
  return `<path d="${sp}" fill="${MV.dk}"/><circle cx="50" cy="56" r="30" fill="${MV.body}"/>
    <ellipse cx="50" cy="62" rx="22" ry="21" fill="${MV.belly}"/>
    <circle cx="33" cy="38" r="5" fill="${MV.belly}"/><circle cx="67" cy="38" r="5" fill="${MV.belly}"/>
    ${mEyes(42, 58, 57, em)}${mCheeks(35, 65, 66)}<circle cx="50" cy="64" r="2.6" fill="${MV.ink}"/>${mMouth(mk, 50, 70)}
    ${pose === "read" ? mBook : ""}
    <path d="${armL}" fill="none" stroke="${MV.belly}" stroke-width="6" stroke-linecap="round"/><path d="${armR}" fill="none" stroke="${MV.belly}" stroke-width="6" stroke-linecap="round"/>`;
}
function mascot(pose = "happy", size = 44) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ class: "mascot m-" + pose, viewBox: "0 0 100 100", width: size, height: size, "aria-hidden": "true", focusable: "false" })) el.setAttribute(k, v);
  el.innerHTML = (look() === "berry" ? drawHedgehog : drawOtter)(POSES[pose] ? pose : "happy");
  return el;
}

// The look switch: in the footer of every page and in the phone's More sheet. The choice is
// kept in this browser; look.js applies it before the next page paints.
function setLook(v) {
  if (v === "berry") document.documentElement.setAttribute("data-look", "berry"); else document.documentElement.removeAttribute("data-look");
  try { if (v === "berry") localStorage.setItem("ai-look", "berry"); else localStorage.removeItem("ai-look"); } catch { /* not saved */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", LOOKS[look()].theme);
  renderLookSwitches();
  if (typeof helperRedraw === "function") helperRedraw();
  rerender();
}
function lookSwitch(id) {
  const cur = look();
  return h("div", { class: "look", role: "group", "aria-labelledby": id + "-l" },
    h("span", { id: id + "-l", class: "look-l", text: "Look" }),
    h("div", { class: "look-seg" }, Object.entries(LOOKS).map(([k, L]) =>
      h("button", { type: "button", class: "look-b", "aria-pressed": String(k === cur), onclick: () => { if (k !== look()) setLook(k); } },
        h("span", { class: "look-dot look-dot-" + k, "aria-hidden": "true" }), `${L.name} · ${L.mascot}`))));
}
function renderLookSwitches() {
  for (const id of ["look-foot", "look-more"]) { const slot = document.getElementById(id); if (slot) slot.replaceChildren(lookSwitch(id)); }
}

// The mascot "says" a page's intro: a speech bubble beside it, the text itself unchanged.
function say(pose, bubble) { return h("div", { class: "say" }, mascot(pose, 48), bubble); }
function empty(pose, ...kids) { return h("div", { class: "empty" }, mascot(pose, 64), h("div", null, ...kids)); }

// One line-drawn icon per insurance type, 24x24, stroked in the chip's ink colour.
const ICONS = {
  hospitalisation: ["M5 21V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v13", "M3 21h18", "M12 8.5v6M9 11.5h6"],
  ip_rider: ["M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z", "M12 9v6M9 12h6"],
  hospital_cash: ["C12 12 8.5", "M14.5 9.6c-.6-.8-1.5-1.1-2.5-1.1-1.4 0-2.4.7-2.4 1.7 0 2.5 5 1.3 5 3.9 0 1-1.1 1.8-2.6 1.8-1 0-2-.4-2.6-1.1", "M12 7v1.5M12 15.9v1.4"],
  outpatient: ["M6 3v5a4 4 0 0 0 8 0V3", "M10 12v3a5 5 0 0 0 10 0v-2", "C20 11 2"],
  term_life: ["M6.5 3h11M6.5 21h11", "M8 3c0 5 8 6 8 9s-8 4-8 9", "M16 3c0 5-8 6-8 9s8 4 8 9"],
  whole_life: ["M12 21v-9", "M12 12c0-4.4 3-7 7.5-7 0 4.4-3 7-7.5 7z", "M12 15c0-3.3-2.3-5.5-6.5-5.5 0 3.3 2.3 5.5 6.5 5.5z"],
  disability_income: ["M4 8h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M4 8l11-4 1.5 4", "M16 14h2"],
  critical_illness: ["M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z", "M7.5 12h2.5l1.5-2.5 2 4 1.3-1.5h1.7"],
  cancer: ["M9.2 9.8C8 8 8.3 4 12 4s4 4 2.8 5.8L8 20", "M10.5 13.4L16 20"],
  long_term_care: ["M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z", "M12 17.5s-3.2-1.9-3.2-4a1.6 1.6 0 0 1 3.2-.6 1.6 1.6 0 0 1 3.2.6c0 2.1-3.2 4-3.2 4z"],
  personal_accident: ["M4.2 14.6l10.4-10.4a3.5 3.5 0 0 1 5 5L9.2 19.6a3.5 3.5 0 0 1-5-5z", "M9.5 9.5l5 5", "M11 13h.01M13 11h.01"],
  maternity_child: ["C12 13 7.5", "M9.6 12h.01M14.4 12h.01", "M10 15.2q2 1.6 4 0", "M12 5.5c0-1.6 1.2-2.5 2.6-2"],
  rider: ["M8.5 13l6.4-6.4a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l7.4-7.4"],
};
function catIcon(id) {
  const ds = ICONS[id];
  if (!ds) return null;
  return h("span", { class: "chip", "aria-hidden": "true" },
    svg("svg", { viewBox: "0 0 24 24", width: "26", height: "26", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", focusable: "false" },
      ds.map(d => {
        if (!d.startsWith("C")) return svg("path", { d });
        const [cx, cy, r] = d.slice(1).trim().split(/\s+/);
        return svg("circle", { cx, cy, r });
      })));
}
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([, ids], g) => ids.map(id => [id, g])));

function safeUrl(u) {
  return typeof u === "string" && /^https:\/\//.test(u) ? u : null;
}

function ext(href, label, cls) {
  const u = safeUrl(href);
  if (!u) return null;
  return h("a", { href: u, target: "_blank", rel: "noopener noreferrer", class: cls }, label, h("span", { class: "sr", text: " (opens in a new tab)" }), " ↗");
}

function srcLink(id) {
  const s = id && state.guide.sources[id];
  if (!s) return null;
  return ext(s.url, s.publisher, "src");
}

// Amounts, percentages, multiples and durations in bold so a skimming eye lands on them.
const FIGURE = /(S?\$[\d,]+(?:\.\d+)?(?:K\b)?|\b\d[\d,]*(?:\.\d+)?%|\b\d+(?:\.\d+)?(?:x\b| times\b)|\b\d+ (?:days|weeks|months|years)\b)/;
// Glossary marks in guide text: {{id}} or {{id|words shown}}. Marked by hand on the first use per
// page (the build enforces it), never matched automatically: "payer" is not "payor".
const TERM = /\{\{([a-z-]+)(?:\|([^}]+))?\}\}/;
function figures(text) {
  return text.split(FIGURE).map((part, i) => i % 2 ? h("strong", { class: "num", text: part }) : part);
}
function rich(text, bold = true) {
  const out = [], p = text.split(TERM);
  for (let i = 0; i < p.length; i += 3) {
    out.push(...(bold ? figures(p[i]) : [p[i]]));
    if (i + 1 < p.length) out.push(termButton(p[i + 1], p[i + 2] || p[i + 1]));
  }
  return out;
}
function plainText(text) { return text.replace(new RegExp(TERM.source, "g"), (m, id, label) => label || id); }

function factList(items, cls) {
  // Must-know items first, marked; the rest keep their order.
  const sorted = [...items.filter(f => f.top), ...items.filter(f => !f.top)];
  return h("ul", { class: "facts" + (cls ? " " + cls : "") },
    sorted.map(f => h("li", { class: f.top ? "top" : null },
      f.top ? h("span", { class: "flag", text: "Must know" }) : null,
      rich(f.t), f.s ? [" ", srcLink(f.s)] : null,
      f.link ? [" ", h("a", { href: f.link, text: f.label })] : null)));
}

// The one to three figures that matter most on a page, each with its own source. A rule-of-thumb
// target and an average people actually hold are tagged in words, not only by colour, so 9x and
// 3.6x side by side cannot read as two targets.
const KIND = { target: "Rule of thumb", actual: "Actual average, not a target" };
function glance(keys) {
  if (!keys || !keys.length) return null;
  return h("div", { class: "glance", role: "list", "aria-label": "At a glance" },
    keys.map(k => h("div", { class: "fig" + (k.kind ? " " + k.kind : ""), role: "listitem" },
      k.kind ? h("p", { class: "kind", text: KIND[k.kind] }) : null,
      h("p", { class: "v", text: k.v }),
      h("p", { class: "l" }, k.l, " ", srcLink(k.s)))));
}

// ---------- glossary: one shared popover, filled on demand ----------
const POPOVER = typeof HTMLElement.prototype.showPopover === "function";
const pop = h("div", { id: "term-pop", class: "term-pop", popover: "auto", role: "dialog", "aria-labelledby": "term-pop-h" });
let popFrom = null;
document.body.append(pop);
pop.addEventListener("toggle", e => {
  // Hand focus back to the word that opened it, unless the reader has already moved on (tapped
  // another term, or a link inside the popover).
  if (e.newState !== "closed" || pop.matches(":popover-open")) return;
  const a = document.activeElement;
  if (popFrom && document.contains(popFrom) && (a === document.body || pop.contains(a))) popFrom.focus();
});

function termButton(id, label) {
  if (!state.gloss[id]) return label;
  return h("button", { type: "button", class: "term", "aria-haspopup": "dialog", onclick: e => openTerm(id, e.currentTarget) }, label);
}

function openTerm(id, from) {
  // Without the Popover API (older browsers), the glossary page shows the same entry.
  if (!POPOVER) { location.hash = "#/glossary#term-" + id; return; }
  const g = state.gloss[id];
  popFrom = from;
  pop.replaceChildren(
    h("div", { class: "pop-head" }, mascot("read", 40),
      h("h2", { id: "term-pop-h", class: "mt0", tabindex: "-1", text: g.term }),
      h("button", { type: "button", class: "btn pop-x", "aria-label": "Close", onclick: () => pop.hidePopover() }, "✕")),
    ...termBody(g),
    h("p", { class: "mt8" }, h("a", { href: "#/glossary#term-" + g.id, text: "All key terms" })));
  if (pop.matches(":popover-open")) pop.hidePopover();
  // source: Tab from the popover's last link continues after the word that opened it, not at the
  // end of the page. Browsers without the option ignore it.
  pop.showPopover({ source: from });
  pop.scrollTop = 0;
  pop.querySelector("h2").focus();
}

function termBody(g) {
  const ex = g.example;
  return [
    ...g.lines.map(f => h("p", null, rich(f.t), f.s ? [" ", srcLink(f.s)] : null)),
    ex ? h("div", { class: "example" },
      h("p", { class: "ex-label", text: ex.s ? "Example from " + state.guide.sources[ex.s].publisher : "Made-up example, not from a source" }),
      h("p", null, rich(ex.t), ex.s ? [" ", srcLink(ex.s)] : null)) : null,
    g.link ? h("p", null, h("a", { href: g.link, text: g.label })) : null,
  ].filter(Boolean);
}

// Must-know items from all three lists, pulled to the top of a type page with what kind each is.
function mustKnow(c) {
  const kinds = [["watch", "Pitfall"], ["caveats", "Fine print"], ["facts", "Fact"]];
  const items = kinds.flatMap(([key, label]) => c[key].filter(f => f.top).map(f => [label, f]));
  if (!items.length) return null;
  return h("section", { class: "must", "aria-labelledby": "must-h" },
    h("div", { class: "must-head" }, mascot("alert", 36), h("h2", { id: "must-h", class: "mt0", text: "Must know" })),
    h("ul", null, items.map(([label, f]) => h("li", null,
      h("span", { class: "tag" + (label === "Pitfall" ? " warn" : ""), text: label }), " ",
      rich(f.t), f.s ? [" ", srcLink(f.s)] : null))));
}

function rest(items) { return items.filter(f => !f.top); }

// A key figure that steps with age, redrawn as one bar per age band. The build checks that every
// amount and label is already in the figure, so this adds no claim of its own. Bars are decoration;
// each row also says its amount in words.
function bandsChart(keys) {
  const k = (keys || []).find(x => x.bands);
  if (!k) return null;
  const max = Math.max(...k.bands.map(([, n]) => n));
  return h("section", { class: "bands", "aria-labelledby": "bands-h" },
    h("h2", { id: "bands-h", class: "mt0", text: "MediSave vs cash, by age" }),
    h("p", { class: "meta" }, "Only for the private part of a Shield plan, by your age next birthday. The MediShield Life part is paid from MediSave in full. Source: ", srcLink(k.s)),
    h("ul", null, k.bands.map(([label, n]) => {
      const mine = inBand(label, getAge());
      // CSP is style-src 'self', so a style attribute is refused; setting it through the DOM is not.
      const bar = h("span", { class: "band-bar", "aria-hidden": "true" });
      bar.style.width = Math.round(n / max * 100) + "%";
      return h("li", { class: mine ? "is-you" : null },
        h("span", { class: "band-age" }, "Age " + label, mine ? youTag() : null),
        h("span", { class: "band-track", "aria-hidden": "true" }, bar),
        h("span", { class: "band-v" }, h("strong", { text: "MediSave: up to $" + n.toLocaleString("en-SG") + " a year" }), ", then ",
          h("span", { class: "tag warn", text: "cash" }), " for the rest"));
    })));
}

// Shield premiums from 61 to 85, per ward class, read from MOH's own comparison tables (the same
// data as the Compare tab, re-checked against MOH by tools/moh_ip.py). Only the private part
// ("IP Premium (excl. MSHL)") is shown, because that is the part the MediSave limit caps; the limit
// itself comes from the verified by-age key figure, so no amount here is typed by hand. Cash is
// the one sum this page works out: the private part minus that limit, never below zero.
const LATE_BANDS = ["61 to 65", "66 to 70", "71 to 73", "74 to 75", "76 to 78", "79 to 80", "81 to 83", "84 to 85"];

function bandStart(label) { const m = /^(\d+)/.exec(label); return m ? +m[1] : null; }

// Does an age next birthday fall in a band label? Covers CPF's "40 and below" / "41 to 70" /
// "71 and above" and MOH's "1 to 20" ... "86 to 90" / "Premiums above age 90".
function inBand(label, age) {
  const n = (label.match(/\d+/g) || []).map(Number);
  if (!n.length || age == null) return false;
  if (/below/.test(label)) return age <= n[0];
  if (/above age/.test(label)) return age > n[0];
  if (/above/.test(label)) return age >= n[0];
  return age >= n[0] && age <= n[1];
}

// "40 and below" / "41 to 70" / "71 and above" -> the limit for one age next birthday.
function medisaveLimit(bands, age) {
  const hit = bands.find(([label]) => inBand(label, age));
  return hit ? hit[1] : null;
}

const num = s => (String(s).match(/[\d,]+(?:\.\d+)?/g) || []).map(x => +x.replace(/,/g, ""));
const dollars = n => "$" + Math.round(n).toLocaleString("en-SG");
const span = (lo, hi) => lo === hi ? dollars(lo) : dollars(lo) + " to " + dollars(hi);

// The private part of the premium ("IP Premium (excl. MSHL)") across a set of plans for one MOH
// age band, and the cash left after the MediSave limit. The one sum the site works out itself.
function shieldCash(units, b, limit) {
  const xs = units.flatMap(u => num(((u.premium || {})[b] || {}).excl || ""));
  if (!xs.length || limit == null) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return { b, lo, hi, limit, clo: Math.max(0, lo - limit), chi: Math.max(0, hi - limit) };
}

// ---------- your age (kept in this browser only, never sent anywhere) ----------
// Storage can throw (private mode, blocked site data); the site then just works without it.
const AGE_KEY = "ai-age-next-birthday";
function getAge() {
  try { const n = parseInt(localStorage.getItem(AGE_KEY), 10); return n >= 1 && n <= 120 ? n : null; } catch { return null; }
}
function setAge(n) {
  try { if (n) localStorage.setItem(AGE_KEY, String(n)); else localStorage.removeItem(AGE_KEY); } catch { /* not saved */ }
  document.dispatchEvent(new CustomEvent("ai:age", { detail: n || null }));
}
function youTag() { return h("span", { class: "tag you", text: "You" }); }

// Re-draw the page in place after a setting changes, keeping the reader where they were.
function rerender(focusId) {
  const y = window.scrollY;
  helper.redraw = true;
  try { route(); } finally { helper.redraw = false; }
  window.scrollTo(0, y);
  const el = focusId && document.getElementById(focusId);
  if (el) el.focus({ preventScroll: true });
}

function ageForm() {
  const age = getAge();
  const input = h("input", { id: "my-age", type: "number", min: "1", max: "120", inputmode: "numeric", value: age || "", "aria-describedby": "my-age-note" });
  return h("form", { class: "age-form", onsubmit: e => {
      e.preventDefault();
      const n = parseInt(input.value, 10);
      if (n >= 1 && n <= 120) { setAge(n); rerender("my-age"); } else input.focus();
    } },
    h("label", { for: "my-age", text: "My age next birthday" }),
    h("div", { class: "age-row" }, input,
      h("button", { type: "submit", class: "btn", text: age ? "Update" : "Show my numbers" }),
      age ? h("button", { type: "button", class: "btn ghost", text: "Clear", onclick: () => { setAge(null); rerender("my-age"); } }) : null),
    h("p", { id: "my-age-note", class: "meta", text: "Saved in this browser only. It is never sent anywhere." }));
}

// "At 35: what a Shield plan costs you": every ward class, from MOH's own tables, for one age.
function yourShieldCost(c) {
  const comp = state.compare[c.id];
  const k = (c.key || []).find(x => x.bands);
  if (!comp || comp.kind !== "moh" || !k || !comp.units) return null;
  const age = getAge();
  const head = h("h2", { id: "you-h", class: "mt0", text: age ? `At ${age}: what a Shield plan costs you` : "What would a Shield plan cost you?" });
  if (!age) return h("section", { class: "bands you-box", "aria-labelledby": "you-h" }, head,
    h("p", { class: "meta", text: "Enter your age next birthday to see, for each ward class, the yearly premium for the private part and how much of it would be cash, on MOH's own figures." }),
    ageForm());
  const band = (comp.bands || []).find(b => inBand(b, age));
  const limit = medisaveLimit(k.bands, age);
  const rows = band ? comp.groups.map(g => ({ g, x: shieldCash(comp.units.filter(u => u.group === g.id), band, limit) })).filter(r => r.x) : [];
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.x.chi), 1);
  const asAt = [...new Set(comp.groups.map(g => g.as_at))].join(", ");
  return h("section", { class: "bands you-box", "aria-labelledby": "you-h" }, head,
    h("p", { class: "meta" },
      `Private part of the yearly premium, including GST, for age ${band} from MOH's comparison tables (as at ${asAt}). At ${age}, MediSave pays up to ${dollars(limit)} of it a year; cash is the rest, if you have the MediSave to use. Ranges run from the cheapest to the dearest plan. Source: `,
      srcLink("moh_ip_compare")),
    h("ul", null, rows.map(({ g, x }) => {
      const bar = h("span", { class: "band-bar", "aria-hidden": "true" });
      bar.style.width = Math.round(x.chi / max * 100) + "%";
      return h("li", null,
        h("span", { class: "band-age", text: g.name }),
        h("span", { class: "band-track", "aria-hidden": "true" }, bar),
        h("span", { class: "band-v" }, h("strong", { text: "Cash: " + span(x.clo, x.chi) + " a year" }), ` (private part ${span(x.lo, x.hi)})`));
    })),
    ageForm());
}

function premiumsChart(c, bare) {
  const comp = state.compare[c.id];
  const k = (c.key || []).find(x => x.bands);
  if (!comp || comp.kind !== "moh" || !k || !comp.units) return null;
  const age = getAge();
  const rows = comp.groups.map(g => {
    const units = comp.units.filter(u => u.group === g.id);
    const bands = LATE_BANDS.map(b => shieldCash(units, b, medisaveLimit(k.bands, bandStart(b))));
    return bands.includes(null) ? null : { g, n: units.length, bands };
  });
  if (!rows.length || rows.includes(null)) return null;
  const max = Math.max(...rows.flatMap(r => r.bands.map(x => x.chi)));
  const asAt = [...new Set(comp.groups.map(g => g.as_at))].join(", ");
  return h("section", { class: "bands late" + (bare ? " bare" : ""), "aria-labelledby": bare ? null : "late-h" },
    bare ? null : h("h2", { id: "late-h", class: "mt0", text: "Cash for a Shield plan from 61, by ward class" }),
    h("p", { class: "meta" },
      `Yearly premium for the private part of the plan, including GST, by age next birthday, from MOH's comparison tables (as at ${asAt}). `,
      "Cash is that premium minus the most MediSave can pay for it, if you have the MediSave to use. ",
      "Each range runs from the cheapest to the dearest plan sold by the insurers on this site. ",
      "Left out: the MediShield Life part, which MediSave pays in full, and riders, which are cash only. Source: ",
      srcLink("moh_ip_compare")),
    rows.map(({ g, n, bands }) => {
      const first = bands[0], last = bands[bands.length - 1];
      return h("details", { class: "late-group" },
        h("summary", null,
          h("span", { class: "q", text: `${g.name} (${n} plans)` }),
          h("span", { class: "short", text: `Cash ${span(first.clo, first.chi)} a year at ${first.b}, ${span(last.clo, last.chi)} at ${last.b}` })),
        h("ul", null, bands.map(x => {
          const bar = h("span", { class: "band-bar", "aria-hidden": "true" });
          bar.style.width = (max ? Math.round(x.chi / max * 100) : 0) + "%";
          return h("li", { class: inBand(x.b, age) ? "is-you" : null },
            h("span", { class: "band-age" }, "Age " + x.b, inBand(x.b, age) ? youTag() : null),
            h("span", { class: "band-track", "aria-hidden": "true" }, bar),
            h("span", { class: "band-v" },
              h("strong", { text: "Cash: " + span(x.clo, x.chi) + " a year" }),
              ` (private part ${span(x.lo, x.hi)}, less up to ${dollars(x.limit)} from MediSave)`));
        })));
    }));
}

// "What pays when": pick an event, see which kinds of cover respond and how. Every line is a
// sourced item in guide.events; the page adds no claim. It shows examples, never a shopping list.
const EVENT_ICON = { hospital: "hospitalisation", cancer: "cancer", work: "disability_income", care: "long_term_care", death: "term_life" };
function viewWhen(params) {
  const evs = state.guide.events || [];
  const pick = evs.find(e => e.id === params.get("e")) || evs[0];
  if (!pick) return viewMissing();
  return [
    h("h1", { text: "If this happens, what pays?" }),
    h("p", { class: "lede", text: "Pick an event to see which kinds of cover can respond, and how each one pays. These are examples of what can pay, not a list of what you need." }),
    h("div", { class: "ev-grid", role: "group", "aria-label": "Events" }, evs.map(e =>
      h("a", { class: "ev-tile", href: "#/when?e=" + e.id, "aria-current": e === pick ? "true" : null },
        catIcon(EVENT_ICON[e.id]), h("span", { text: e.label })))),
    h("h2", { id: "ev-h", text: pick.label }),
    h("ul", { class: "ev-pay", "aria-labelledby": "ev-h" }, pick.lines.map(f => h("li", null,
      h("a", { class: "ev-k", href: "#/type/" + f.cat }, catIcon(f.cat), h("span", { text: f.k })),
      h("p", null, rich(f.t), " ", srcLink(f.s))))),
    h("p", { class: "meta", text: "Each kind of cover has its own conditions, waiting periods and exclusions. Open its page for the details." }),
    disclaimerNote(),
  ];
}


// One official worked example told as a short story, every step with its own source.
function storyCard(c, bare) {
  const st = c.story;
  if (!st) return null;
  const pubs = [...new Set(st.steps.map(f => state.guide.sources[f.s].publisher))].join(", ");
  return h("section", { class: "story", "aria-labelledby": bare ? null : "story-h" },
    bare ? null : h("div", { class: "must-head" }, mascot("read", 36), h("h2", { id: "story-h", class: "mt0", text: "A worked example" })),
    h("p", { class: "ex-label", text: "Example from " + pubs }),
    h("p", { class: "story-who" }, rich(st.who, false)),
    h("ol", null, st.steps.map(f => h("li", null, rich(f.t), " ", srcLink(f.s)))));
}

// Short form of the disclaimer, shown where people decide; the full list is on the Sources page.
function disclaimerNote() {
  return h("p", { class: "notice mt16" },
    h("strong", { text: "General information, not advice." }),
    " Simplified for clarity: the policy wording decides every claim. Check the insurer's documents and speak to a licensed adviser before you buy, switch or cancel. ",
    h("a", { href: "#/sources#disclaimer", text: "Full disclaimer" }));
}

function catName(id) { return state.cats[id] ? state.cats[id].name : id; }
function insName(id) { const i = state.insurers.find(x => x.id === id); return i ? i.name : id; }

// ---------- views ----------
// ---------- tap-to-open sections (iOS inset rows) ----------
// Long pages show a title and a one-line summary per section; the body opens on tap. Nothing is
// removed, and a link to anything inside opens its section (see route()).
function summaryOf(text, max = 110) {
  const t = plainText(String(text || "")).trim();
  const first = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0].trim();
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
function fold(id, title, short, ...kids) {
  return h("details", { class: "fold", id },
    h("summary", null, h("h2", { class: "fold-h", id: id ? id + "-h" : null, text: title }), short ? h("span", { class: "short", text: short }) : null),
    h("div", { class: "fold-body" }, ...kids));
}
// The same, one heading level down, for sections grouped under an h2.
function subFold(id, title, short, ...kids) {
  const d = fold(id, title, short, ...kids);
  const h2 = d.querySelector(".fold-h"), h3 = h("h3", { class: "fold-h", id: h2.id || null, text: title });
  h2.replaceWith(h3);
  return d;
}
function count(n, one, many) { return n + " " + (n === 1 ? one : many); }

function viewTypes() {
  const out = [
    h("div", { class: "hero" }, mascot("wave", 72),
      h("h1", { text: "Singapore personal insurance, sourced" }),
      h("p", { class: "lede", text: "Every type of protection insurance except travel, explained in plain words: what it does, what can go wrong, what the Government already gives you, and which insurers sell it. Every official figure links to its source." })),
    disclaimerNote(),
    h("section", { class: "must", "aria-labelledby": "top5-h" },
      h("div", { class: "must-head" }, mascot("alert", 36), h("h2", { id: "top5-h", class: "mt0", text: "Top 5 ways people get caught out" })),
      h("ol", { class: "rows top5-rows" }, state.guide.pain_points.map((p, i) =>
        h("li", null, h("a", { class: "row", href: "#/top5#" + p.id },
          h("span", { class: "row-n", "aria-hidden": "true", text: String(i + 1) }),
          h("span", { class: "row-main" }, h("span", { class: "row-t", text: p.title })),
          h("span", { class: "row-go", "aria-hidden": "true", text: "›" })))))),
  ];
  // One slim row per type, like an iOS Settings list: icon, name, one line, chevron.
  for (const [title, ids] of GROUPS) {
    out.push(h("h2", { class: "group-title", text: title }));
    out.push(h("ul", { class: "rows" }, ids.map(id => {
      const c = state.cats[id];
      return h("li", null, h("a", { class: "row g" + GROUP_OF[id], href: "#/type/" + id },
        catIcon(id),
        h("span", { class: "row-main" },
          h("span", { class: "row-t", text: c.name }),
          h("span", { class: "row-s", text: c.short })),
        h("span", { class: "row-go", "aria-hidden": "true", text: "›" })));
    })));
  }
  return out;
}

function productCard(p, showInsurer) {
  const unverified = UNVERIFIED.has(p.status);
  return h("article", { class: "card prod" },
    showInsurer ? h("span", { class: "ins", text: insName(p.insurer) }) : h("span", { class: "ins", text: catName(p.category) }),
    h("h3", { text: p.name }),
    (p.flags || []).length ? h("p", { class: "tags" },
      p.flags.includes("not_ip") ? h("span", { class: "tag", text: "Not a Shield plan" }) : null,
      p.flags.includes("limited") ? h("span", { class: "tag warn", text: "Limited eligibility" }) : null) : null,
    p.subtype ? h("p", { class: "meta", text: p.subtype }) : null,
    p.summary ? h("p", { text: p.summary }) : null,
    p.facts.length ? h("ul", null, p.facts.map(f => h("li", null, rich(f)))) : null,
    h("div", { class: "links" },
      ext(p.url, "Official page"),
      p.pdfs.map(d => ext(d.url, d.title + " (PDF)"))),
    unverified ? h("p", { class: "meta" }, h("span", { class: "tag warn", text: "Check link" }), " The insurer's site blocks automated checks, so this link was not re-verified today.") : null);
}

function viewType(id, params) {
  const c = state.cats[id];
  if (!c) return viewMissing();
  const all = state.products.filter(p => p.category === id);
  const sellers = [...new Set(all.map(p => p.insurer))];
  const pick = params.get("insurer");
  const list = pick ? all.filter(p => p.insurer === pick) : all;
  const out = [
    h("p", { class: "crumb" }, h("a", { href: "#/", text: "All types" })),
    h("h1", { class: "with-chip g" + GROUP_OF[id] }, catIcon(id), h("span", { text: c.name })),
    glance(c.key),
    mustKnow(c),
    bandsChart(c.key),
    yourShieldCost(c),
    h("h2", { text: "In simple terms" }),
    h("p", { class: "lede" }, rich(c.plain, false)),
  ];
  // Everything below the essentials opens on tap; Must-know items already sit at the top.
  const folds = [];
  const late = premiumsChart(c, true);
  if (late) folds.push(fold("late", "Cash for a Shield plan from 61, by ward class", "MOH's premiums for each ward class, less what MediSave can pay", late));
  folds.push(fold("who", "Who it is for", summaryOf(c.who), h("p", null, rich(c.who, false))));
  const factsRest = rest(c.facts);
  folds.push(fold("facts", "Key facts", summaryOf(c.what), h("p", null, rich(c.what, false)), factsRest.length ? factList(factsRest) : null));
  const watch = rest(c.watch), cav = rest(c.caveats);
  if (watch.length) folds.push(fold("watch", watch.length < c.watch.length ? "More pitfalls to avoid" : "Pitfalls to avoid", count(watch.length, "pitfall", "pitfalls"), factList(watch, "watch")));
  if (cav.length) folds.push(fold("fine", cav.length < c.caveats.length ? "More fine print" : "Caveats and fine print", count(cav.length, "point", "points"), factList(cav)));
  if (c.versus) folds.push(fold("versus", c.versus.title || "Compared side by side", summaryOf(c.versus.intro), versus(c.versus, true)));
  if (c.story) folds.push(fold("story", "A worked example", summaryOf(c.story.who), storyCard(c, true)));
  if (c.qa && c.qa.length) folds.push(fold("qa", "Common questions", count(c.qa.length, "question", "questions"), c.qa.map(faqItem)));
  if (c.schemes.length) folds.push(fold("gov", "What the Government already covers", c.schemes.map(s => state.schemes[s].name).join(", "),
    h("div", { class: "grid" }, c.schemes.map(s => {
      const sc = state.schemes[s];
      return h("a", { class: "card", href: "#/schemes#" + s }, h("h3", { text: sc.name }), h("p", { class: "meta", text: sc.who }));
    }))));
  folds.push(fold("ask", "Questions to compare plans on", count(c.compare.length, "question", "questions"),
    h("ul", { class: "checklist" }, c.compare.map(q => h("li", { text: q }))),
    c.tools.length ? h("p", { class: "links" }, c.tools.map(t => ext(state.guide.sources[t].url, state.guide.sources[t].title))) : null));
  let sells;
  if (!all.length) {
    sells = empty("think", h("p", { class: "meta", text: "None of the insurers covered here lists a standalone plan of this type on its website. See the national schemes above." }));
  } else {
    const sel = h("select", { id: "f-ins", onchange: e => { location.hash = "#/type/" + id + (e.target.value ? "?insurer=" + e.target.value : "") + "#sells"; } },
      h("option", { value: "", text: `All insurers (${sellers.length})` }),
      sellers.map(s => h("option", { value: s, selected: s === pick, text: insName(s) })));
    sells = [h("div", { class: "filters" }, h("label", { for: "f-ins", text: "Insurer" }), sel,
      h("a", { href: "#/compare/" + id + (pick ? "?ins=" + pick : ""), text: (state.compare[id] || {}).kind === "moh" ? "Compare them side by side on MOH's figures" : "Compare them side by side" })),
      h("div", { class: "grid" }, list.map(p => productCard(p, true)))];
  }
  folds.push(fold("sells", `Who sells it (${all.length})`, all.length ? count(sellers.length, "insurer", "insurers") + ", " + count(all.length, "plan", "plans") : "No standalone plans listed", sells));
  out.push(h("div", { class: "fold-list" }, folds), disclaimerNote());
  return out;
}

// Two covers side by side, row by row, then made-up situations. Every line carries its source;
// nothing here says which to buy.
function versus(vs, bare) {
  const lines = items => items.map(f => h("p", null, rich(f.t), " ", srcLink(f.s)));
  return h("section", { id: bare ? null : "versus", class: "versus", "aria-labelledby": bare ? null : "versus-h" },
    bare ? null : h("h2", { id: "versus-h", text: vs.title }),
    h("p", { class: "lede", text: vs.intro }),
    vs.rows.map(r => h("div", { class: "vs-row" },
      h("h3", { text: r.k }),
      h("div", { class: "vs-cols" },
        h("div", { class: "vs-cell" }, h("p", { class: "vs-col", text: vs.cols[0] }), lines(r.a)),
        h("div", { class: "vs-cell" }, h("p", { class: "vs-col", text: vs.cols[1] }), lines(r.b))))),
    h("h3", { class: "mt16", text: "How they play out" }),
    h("p", { class: "meta", text: vs.scenarios_note }),
    h("div", { class: "grid" }, vs.scenarios.map(sc => h("div", { class: "card scenario" },
      h("p", { class: "ex-label", text: "Made-up situation" }),
      h("h4", { text: sc.title }),
      sc.items.map(f => h("p", null, h("strong", { text: f.k + ": " }), rich(f.t), " ", srcLink(f.s)))))));
}

function viewInsurers() {
  return [
    h("h1", { text: "Insurers" }),
    h("p", { class: "lede", text: "The major life insurers selling personal plans in Singapore. Product lists come from each insurer's own website. Smaller insurers are left out on purpose, including Raffles Health Insurance, the seventh Shield plan insurer." }),
    h("div", { class: "grid" }, state.insurers.map(i => {
      const cats = new Set(i.products.map(p => p.category)).size;
      return h("a", { class: "card", href: "#/insurer/" + i.id },
        h("h3", { text: i.name }),
        i.formerly ? h("p", { class: "meta", text: "Formerly " + i.formerly }) : null,
        h("p", { class: "meta", text: i.products.length ? `${i.products.length} plans across ${cats} types` : "No personal plans in scope" }));
    })),
  ];
}

function viewInsurer(id) {
  const i = state.insurers.find(x => x.id === id);
  if (!i) return viewMissing();
  const out = [
    h("p", { class: "crumb" }, h("a", { href: "#/insurers", text: "All insurers" })),
    h("h1", { text: i.name }),
    i.formerly ? h("p", { class: "meta", text: "Formerly " + i.formerly }) : null,
    h("p", { class: "links" }, ext(i.website, "Website"), ext(i.products_index_url, "All products"), ext(i.claims_url, "Make a claim"), ext(i.contact_url, "Contact")),
    h("p", { class: "meta", text: "Product list checked " + (i.verified_on || "–") + "." }),
  ];
  if (!i.products.length) out.push(h("p", { text: "This insurer sells no personal plans in this app's scope (travel, motor and home are excluded)." }));
  for (const cid of Object.keys(state.cats)) {
    const ps = i.products.filter(p => p.category === cid);
    if (!ps.length) continue;
    out.push(h("h2", null, h("a", { href: "#/type/" + cid, text: state.cats[cid].name })));
    out.push(h("div", { class: "grid" }, ps.map(p => productCard(p, false))));
  }
  return out;
}

function shortIns(name) { return name.replace(/ (Singapore|Insurance|Life Insurance)$/, ""); }

function viewCompare() {
  const ins = state.insurers.filter(i => i.products.length);
  const cats = Object.values(state.cats).filter(c => state.products.some(p => p.category === c.id));
  const table = h("table", { class: "matrix" },
    h("caption", { class: "sr", text: "Number of plans per insurance type and insurer" }),
    h("thead", null, h("tr", null, h("th", { scope: "col", text: "Type" }), ins.map(i => h("th", { scope: "col", text: shortIns(i.name) })))),
    h("tbody", null, cats.map(c => h("tr", null,
      h("th", { scope: "row" }, h("a", { href: "#/compare/" + c.id, text: c.name })),
      ins.map(i => {
        const n = i.products.filter(p => p.category === c.id).length;
        return n ? h("td", null, h("a", { href: `#/compare/${c.id}?ins=${i.id}`, "aria-label": `Compare ${n} ${c.name} plans from ${i.name}`, text: String(n) }))
                 : h("td", { class: "none", "aria-label": "none", text: "–" });
      })))));
  return [
    h("h1", { text: "Compare plans" }),
    h("p", { class: "lede", text: "Tap a type to put its plans side by side, or a number to start with one insurer's plans. You can then tick exactly the plans you want." }),
    Object.keys(state.compare).length ? h("p", null, "Side-by-side tables of the key terms: ",
      Object.keys(state.compare).map((id, i) => [i ? ", " : "", h("a", { href: "#/compare/" + id, text: state.cats[id].name })]),
      state.compare.hospitalisation ? ". Shield plans use MOH's own figures." : ".") : null,
    h("div", { class: "matrix-wrap" }, table),
    h("p", { class: "meta mt8", text: "A dash means none was found on that insurer's website, not that it can never be arranged through an adviser." }),
  ];
}

// Picked plans live in the URL (?p=a,b), so a comparison can be shared and survives a reload.
// replaceState keeps ticking boxes from re-rendering the page or jumping the scroll position.
// "?p=-" means "none ticked": no ?p means the view's default, so an empty list needs its own value.
const NONE = "-";
function pickedFromUrl(params, valid) {
  const raw = params.get("p");
  return { none: raw === NONE, ids: raw && raw !== NONE ? raw.split(",").filter(valid) : [] };
}
function setCompareUrl(cat, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  history.replaceState(null, "", "#/compare/" + cat + (qs.toString() ? "?" + qs : ""));
}

// Checkboxes grouped by insurer. items: [{id, insurer, label, sub}]
function picker(items, picked, onChange) {
  const boxes = {};
  const count = h("span");
  // Outside the collapsed list, so "clear, then tick a few" works without opening it first.
  const all = h("button", { type: "button", class: "btn", onclick: () => onChange(items.map(x => x.id)) }, "Select all");
  const none = h("button", { type: "button", class: "btn", onclick: () => onChange([]) }, "Clear all");
  const el = h("div", { class: "picker-wrap" },
    h("div", { class: "quick", role: "group", "aria-label": "Select plans" }, all, none),
    h("details", { class: "picker" },
      h("summary", null, "Choose plans ", count),
      h("div", { class: "picker-grid" }, state.insurers.filter(i => items.some(x => x.insurer === i.id)).map(i =>
        h("fieldset", null, h("legend", { text: shortIns(i.name) }),
          items.filter(x => x.insurer === i.id).map(x => {
            boxes[x.id] = h("input", { type: "checkbox", value: x.id, onchange: () => onChange(Object.keys(boxes).filter(id => boxes[id].checked)) });
            return h("label", { class: "check" }, boxes[x.id], h("span", null, x.label, x.sub ? h("span", { class: "sub", text: x.sub }) : null));
          }))))));
  function update(ids) {
    for (const [id, b] of Object.entries(boxes)) b.checked = ids.includes(id);
    count.textContent = `(${ids.length} of ${items.length} chosen)`;
  }
  update(picked);
  return { el, update };
}

function viewCompareType(cat, params) {
  const c = state.cats[cat];
  if (!c) return viewMissing();
  const head = [h("p", { class: "crumb" }, h("a", { href: "#/compare", text: "Compare" })), h("h1", { text: "Compare: " + c.name })];
  const plans = state.products.filter(p => p.category === cat);
  if (!plans.length) return [...head, h("p", { text: "None of the insurers covered here lists a plan of this type." }), h("p", null, h("a", { href: "#/type/" + cat, text: "Read the guide to " + c.name }))];
  return state.compare[cat] ? compareTable(cat, state.compare[cat], params, head) : comparePlans(cat, plans, params, head);
}

function compareTable(cat, comp, params, head) {
  const c = state.cats[cat];
  const byId = Object.fromEntries(comp.units.map(u => [u.id, u]));
  // Two kinds of table: "moh" (MOH's Shield plan tiers, with ward classes and age bands) and
  // "insurer" (one column per plan, each cell quoted from the insurer's own material).
  const moh = comp.kind === "moh";
  const groups = comp.groups || [], bands = comp.bands || [];
  const ofGroup = g => comp.units.filter(u => u.group === g).map(u => u.id);
  const ins = params.get("ins");
  const fromUrl = pickedFromUrl(params, id => byId[id]);
  let picked = fromUrl.ids;
  if (!picked.length && !fromUrl.none) picked = ins ? comp.units.filter(u => u.insurer === ins).map(u => u.id)
    : groups.length ? ofGroup(groups[0].id) : comp.units.map(u => u.id);
  let band = bands.includes(params.get("age")) ? params.get("age") : bands.find(b => inBand(b, getAge())) || comp.default_band;
  const groupName = Object.fromEntries(groups.map(g => [g.id, g.name]));
  const prod = Object.fromEntries(state.products.map(p => [p.id, p]));

  const quick = groups.map(g => h("button", { type: "button", class: "btn", "data-g": g.id, title: g.name,
    onclick: () => { picked = ofGroup(g.id); changed(); } }, g.short, h("span", { class: "n", text: ` (${ofGroup(g.id).length})` })));
  const pick = picker(comp.units.map(u => ({ id: u.id, insurer: u.insurer, label: u.name, sub: groupName[u.group] })), picked,
    ids => { picked = comp.units.map(u => u.id).filter(id => ids.includes(id)); changed(); });
  const age = bands.length ? h("select", { id: "c-age", onchange: e => { band = e.target.value; changed(); } },
    bands.map(b => h("option", { value: b, selected: b === band, text: b === "Premiums above age 90" ? "Above 90" : b }))) : null;
  const body = h("div");
  const status = h("p", { class: "sr", role: "status" });

  function value(m, u) {
    if (m.per === "band") {
      const row = u.premium[band];
      return row ? (m.id === "premium" ? row.incl : row.change) : null;
    }
    if (m.per === "insurer") {
      const x = (comp.insurer_values[u.insurer] || {})[m.id];
      return x ? x.v : null;
    }
    return u.values[m.id] ?? null;
  }
  function why(m) {
    const when = m.id === "claims" && Object.values(comp.insurer_values || {}).map(x => x.claims && x.claims.when).find(Boolean);
    return m.why + (when ? " " + when + "." : "");
  }
  function cell(m, u, v) {
    // A gap, not a "No": a neutral tag, so it never reads as the plan lacking the benefit.
    if (v == null) return h("td", null, h("span", { class: "tag na", text: comp.na }));
    const src = u.src && u.src[m.id];
    return h("td", null, v, src ? [" ", ext(src, "Source", "src")] : null);
  }
  function draw() {
    pick.update(picked);
    for (const b of quick) {
      const ids = ofGroup(b.dataset.g);
      b.setAttribute("aria-pressed", String(ids.length === picked.length && ids.every(id => picked.includes(id))));
    }
    const cols = picked.map(id => byId[id]);
    status.textContent = `Comparing ${cols.length} plan${cols.length === 1 ? "" : "s"}${cols.length && age ? ", premiums at age " + band : ""}.`;
    if (!cols.length) { body.replaceChildren(empty("think", h("p", { text: "Tick at least one plan above to compare." }))); return; }
    const sameGroups = [...new Set(cols.map(u => u.group))].filter(g => (comp.same_benefits || {})[g]);
    const table = h("table", { class: "cmp" },
      h("caption", { class: "sr", text: `${c.name}: ${cols.length} plans compared` }),
      h("thead", null, h("tr", null, h("th", { scope: "col", class: "corner", text: "Plan" }), cols.map(u => {
        const p = prod[u.pid];
        return h("th", { scope: "col" }, h("span", { class: "ins", text: insName(u.insurer) }), h("span", { class: "tier", text: u.name }),
          p ? ext(p.url, "Plan page", "pl") : null);
      }))),
      h("tbody", null, comp.metrics.map(m => {
        const vals = cols.map(u => value(m, u));
        const same = cols.length > 1 && vals[0] != null && vals.every(v => v === vals[0]);
        const label = m.id === "premium" ? `${m.label}, age ${band === "Premiums above age 90" ? "above 90" : band}` : m.label;
        return h("tr", { class: same ? "same" : null },
          h("th", { scope: "row" }, h("span", { class: "lab", text: label }), h("span", { class: "why", text: why(m) }),
            same ? h("span", { class: "tag", text: "Same for all" }) : null),
          vals.map((v, i) => cell(m, cols[i], v)));
      })));
    // replaceChildren does not flatten arrays or drop nulls: it would print them as text.
    body.replaceChildren(...[
      sameGroups.map(g => h("p", { class: "notice" }, comp.same_benefits[g].t, " ", ext(comp.source.url, "MOH", "src"))),
      cols.length > 2 ? h("p", { class: "meta narrow-only", text: `Swipe the table sideways to see all ${cols.length} plans.` }) : null,
      // Focusable so keyboard users can scroll the box itself, not only reach links inside it.
      h("div", { class: "matrix-wrap cmp-wrap", role: "region", tabindex: "0", "aria-label": "Comparison table, scrolls both ways" }, table),
    ].flat().filter(Boolean));
  }
  function changed() {
    setCompareUrl(cat, { p: picked.length ? picked.join(",") : NONE, age: band === comp.default_band ? "" : band });
    draw();
  }
  // Plans of this type that MOH's table does not cover, named so none silently disappears.
  function notInTable() {
    const covered = new Set(comp.units.map(u => u.pid));
    const rest = state.products.filter(p => p.category === cat && !covered.has(p.id));
    if (!rest.length) return null;
    const closed = new Set((comp.closed || []).map(t => t.insurer + "|" + t.name));
    return [
      h("h2", { text: "Also sold under this type, not in MOH's table" }),
      h("p", { class: "meta", text: "MOH compares Shield plans still open to new members. These are other plans, or plans MOH lists as closed." }),
      h("ul", { class: "facts" }, rest.map(p => h("li", null,
        h("a", { href: `#/type/${cat}?insurer=${p.insurer}`, text: p.name }), " · " + insName(p.insurer),
        closed.has(p.insurer + "|" + p.name) ? [" ", h("span", { class: "tag warn", text: "MOH: no longer offered to new members" })]
          : p.flags.includes("not_ip") ? [" ", h("span", { class: "tag", text: "Not a Shield plan" })] : null))),
    ];
  }
  draw();
  return [
    ...head,
    moh ? h("p", { class: "lede", text: `MOH's own figures for every Shield plan tier, as at ${comp.source.as_at.join(", ")}, copied word for word. Amounts in S$.` })
        : h("p", { class: "lede", text: `All ${comp.units.length} plans of this type from the insurers here. Each cell is quoted from the insurer's own page or product summary, with a link to check it.` }),
    groups.length ? [h("p", { class: "meta mt8", id: "quick-h", text: "Compare all plans for one ward class:" }),
      h("div", { class: "quick", role: "group", "aria-labelledby": "quick-h" }, quick)] : null,
    pick.el,
    age ? h("div", { class: "filters" }, h("label", { for: "c-age", text: "Age next birthday" }), age) : null,
    status,
    body,
    notInTable(),
    h("h2", { text: "How to read this" }),
    h("ul", { class: "checklist" }, comp.notes.map(t => h("li", { text: t }))),
    moh ? h("p", { class: "links mt8" }, ext(comp.source.url, "MOH: " + comp.source.title),
      groups.map(g => ext(g.pdf, "MOH table: " + g.name + " (PDF)"))) : null,
    h("p", null, h("a", { href: "#/type/" + cat, text: "Guide to " + c.name + ": pitfalls and what to check" })),
    disclaimerNote(),
  ];
}

// Types with no standard comparison table yet: the picked plans' own facts, side by side.
function comparePlans(cat, plans, params, head) {
  const ins = params.get("ins");
  const ids = plans.map(p => p.id);
  const fromUrl = pickedFromUrl(params, id => ids.includes(id));
  let picked = fromUrl.ids;
  if (!picked.length && !fromUrl.none) picked = ins ? plans.filter(p => p.insurer === ins).map(p => p.id) : ids;
  const grid = h("div", { class: "grid" });
  // The plan cards sit below the questions, out of view, so a screen reader hears what changed.
  const status = h("p", { class: "sr", role: "status" });
  const pick = picker(plans.map(p => ({ id: p.id, insurer: p.insurer, label: p.name })), picked, sel => {
    picked = ids.filter(id => sel.includes(id));
    setCompareUrl(cat, { p: picked.length === ids.length ? "" : picked.length ? picked.join(",") : NONE });
    draw();
  });
  function draw() {
    pick.update(picked);
    status.textContent = `Comparing ${picked.length} of ${ids.length} plan${ids.length === 1 ? "" : "s"}.`;
    grid.replaceChildren(...(picked.length ? plans.filter(p => picked.includes(p.id)).map(p => productCard(p, true))
      : [empty("think", h("p", { text: "Tick at least one plan above to compare." }))]));
  }
  draw();
  return [
    ...head,
    h("p", { class: "lede", text: "There is no official like-for-like table for this type yet, so each plan shows the facts from its insurer's own page. Use the questions below to compare them." }),
    pick.el,
    status,
    h("h2", { text: "Questions to compare plans on" }),
    h("ul", { class: "checklist" }, state.cats[cat].compare.map(q => h("li", { text: q }))),
    h("h2", { text: "The plans" }),
    grid,
    disclaimerNote(),
  ];
}

function viewSchemes() {
  return [
    h("h1", { text: "National schemes" }),
    h("p", { class: "lede", text: "Cover most Singapore Citizens and PRs already have through CPF. Check yours on the CPF Healthcare dashboard with Singpass before buying more." }),
    state.guide.schemes.map(s => fold(s.id, s.name, s.kind + ". " + s.who,
      glance(s.key),
      factList(s.facts),
      h("p", { class: "links mt8" }, ext(state.guide.sources[s.link].url, "Official page")))),
  ];
}

function money(n) { return "S$" + Math.round(n).toLocaleString("en-SG"); }

// Home-loan choices. HPS covers an HDB or bank loan on an HDB flat (required when paid with CPF,
// encouraged when paid in cash) and never private property or ECs: CPF's own HPS page.
const HOMES = [
  ["none", "No home loan"],
  ["hdb_cpf", "HDB flat, instalments paid with CPF"],
  ["hdb_cash", "HDB flat, instalments paid in cash"],
  ["private", "Private property or EC"],
];

function viewCheck() {
  const r = state.guide.rules_of_thumb, sp = state.guide.starting_pay;
  const f = {
    age: h("input", { id: "c-age", type: "number", inputmode: "numeric", min: 0, max: 100, value: "35" }),
    income: h("input", { id: "c-inc", type: "number", inputmode: "numeric", min: 0, step: 1000, value: "60000" }),
    prem: h("input", { id: "c-prem", type: "number", inputmode: "numeric", min: 0, step: 100, value: "" , placeholder: "optional" }),
    work: h("input", { id: "c-work", type: "checkbox", checked: true }),
    home: h("select", { id: "c-home" }, HOMES.map(([v, t]) => h("option", { value: v, text: t }))),
    loan: h("input", { id: "c-loan", type: "number", inputmode: "numeric", min: 0, step: 1000, value: "", placeholder: "optional" }),
    share: h("input", { id: "c-share", type: "number", inputmode: "numeric", min: 0, max: 100, step: 10, value: "100" }),
  };
  // Fresh graduates: MOE's median starting pay by course area, copied into the income box only
  // when the reader asks, with the sum shown, so the figure in use is always visible.
  const grad = h("select", { id: "c-grad" }, h("option", { value: "", text: "Choose your course area" }),
    sp.items.map((it, i) => h("option", { value: String(i), text: it.k })));
  const gradOut = h("div", { "aria-live": "polite" });
  grad.addEventListener("change", () => {
    const it = sp.items[grad.value];
    if (!it) { gradOut.replaceChildren(); return; }
    gradOut.replaceChildren(
      h("p", null, h("strong", { text: `${money(it.v)} a month × 12 = ${money(it.v * 12)} a year` }), ` (${it.k}).`),
      h("button", { type: "button", class: "btn", onclick: () => { f.income.value = String(it.v * 12); calc(); f.income.focus(); } }, "Use this as my income"));
  });
  const loanField = h("label", { class: "field" }, h("span", { text: "Home loan still owed (S$)" }), f.loan);
  const shareField = h("label", { class: "field" }, h("span", { text: "Your share of HPS cover (%)" }), f.share);
  const res = h("div", { "aria-live": "polite" });
  function calc() {
    // min/max on the inputs do not stop typed values, so clamp here.
    const age = Math.min(120, Math.max(0, Math.floor(Number(f.age.value) || 0)));
    const inc = Math.max(0, Number(f.income.value) || 0), prem = Math.max(0, Number(f.prem.value) || 0);
    const home = f.home.value, hdb = home.startsWith("hdb");
    const loan = Math.max(0, Number(f.loan.value) || 0), share = Math.min(100, Math.max(0, Number(f.share.value) || 0));
    loanField.hidden = home === "none";
    shareField.hidden = !hdb;
    const year = new Date().getFullYear(), born = year - age;
    const tiles = [
      h("div", { class: "card" }, h("p", { class: "meta", text: "Death and TPD cover (9x)" }), h("p", { class: "big", text: money(inc * 9) }),
        home !== "none" && loan ? h("p", { class: "meta mt8" }, "Beside it, not added: your home loan of ", h("strong", { text: money(loan) }), ". ",
          !hdb ? "HPS does not cover it."
            : age >= 65 ? "HPS cover ends at 65."
            : [home === "hdb_cash" ? "If you have HPS, it pays" : "HPS pays", " up to your ", h("strong", { text: share + "%" }),
              " share of what is owed: about ", h("strong", { text: money(loan * share / 100) }), " today."]) : null),
      h("div", { class: "card" }, h("p", { class: "meta", text: "Critical illness cover (4x)" }), h("p", { class: "big", text: money(inc * 4) })),
      h("div", { class: "card" }, h("p", { class: "meta", text: "Protection budget (15% max)" }), h("p", { class: "big", text: money(inc * .15) + "/yr" }),
        f.prem.value !== "" ? h("p", { class: "meta" }, prem <= inc * .15 ? h("span", { class: "tag ok", text: "Within" }) : h("span", { class: "tag warn", text: "Above" }), ` You entered ${money(prem)}/yr.`) : null),
    ];
    const have = [];
    have.push(["medishield_life", "MediShield Life covers you for life (Citizens and PRs)."]);
    if (born >= 1980 && age >= 30) have.push(["careshield_life", "CareShield Life: automatic from age 30 for those born 1980 or later."]);
    else if (born >= 1980) have.push(["careshield_life", `CareShield Life starts automatically at 30 (in about ${30 - age} year${30 - age === 1 ? "" : "s"}).`]);
    else have.push(["careshield_life", "CareShield Life is optional for those born 1979 or earlier. You may have ElderShield instead."]);
    if (f.work.checked && age >= 21 && age < 65) have.push(["dps", "DPS: S$70,000 term cover up to 59, S$55,000 to 64, unless you opted out."]);
    if (home === "hdb_cpf" && age < 65) have.push(["hps", "HPS: required when you pay HDB flat instalments with CPF. It pays off the housing loan, up to your share of cover, until 65 or the loan ends."]);
    if (home === "hdb_cash" && age < 65) have.push(["hps", "HPS only if you applied: it is not required when you pay in cash, though CPF strongly encourages it."]);
    res.replaceChildren(...[
      h("div", { class: "result" }, tiles),
      h("p", { class: "meta mt8" }, "Rule of thumb from the ", ext(state.guide.sources[r.source].url, "MoneySense Basic Financial Planning Guide"), ". Count what you already hold, including the schemes below, before buying more."),
      h("h2", { text: "What you likely already have" }),
      h("ul", { class: "facts" }, have.map(([id, t]) => h("li", null, t, " ", h("a", { href: "#/schemes#" + id, text: "Details" })))),
      home !== "none" ? homeNote(home, age) : null,
    ].filter(Boolean));
  }
  for (const el of [...Object.values(f)]) el.addEventListener("input", calc);
  calc();
  return [
    h("h1", { text: "Cover check" }),
    h("p", { class: "lede", text: "A quick benchmark against the official rule of thumb. Nothing you type leaves this page." }),
    h("div", { class: "form" },
      h("label", { class: "field" }, h("span", { text: "Your age" }), f.age),
      h("label", { class: "field" }, h("span", { text: "Annual income (S$)" }), f.income),
      h("label", { class: "field" }, h("span", { text: "Yearly protection premiums (S$)" }), f.prem),
      h("label", { class: "check" }, f.work, "Working, with CPF contributions")),
    h("details", { class: "faq grad" },
      h("summary", null, h("span", { class: "q", text: "Just started work? Use a typical starting pay" }),
        h("span", { class: "short", text: "Your offer letter is better if you have one. This is MOE's median for university graduates." })),
      h("div", null,
        h("label", { class: "field" }, h("span", { text: "Course area" }), grad),
        gradOut,
        h("p", { class: "meta mt8" }, sp.who, " ", srcLink(sp.s)))),
    h("div", { class: "form mt16" },
      h("label", { class: "field" }, h("span", { text: "Home loan" }), f.home),
      loanField,
      shareField),
    res,
    h("p", { class: "notice mt16", text: "These multiples are general guidance, not a recommendation for you. Dependants, debts, savings and existing policies change the right amount." }),
  ];
}

// What the official sources say about the home loan the reader chose. No source used here adds a
// home loan to the 9x rule, so the loan is shown beside it and this note says so.
function homeNote(home, age) {
  const t = (id, label) => termButton(id, label);
  const items = home === "private" ? [
    [t("hps", "HPS"), " does not cover private property or ECs. For a private property loan, CPF suggests private insurance. ", srcLink("cpf_hps")],
    ["MoneySense lists ", t("decreasing-term", "mortgage reducing term assurance"), " as cover that pays off the home loan if the main borrower dies. It names the kind of cover, not an amount or a plan. ", srcLink("ms_needs")],
  ] : [
    [t("hps", "HPS"), " covers an HDB loan or a bank loan on an HDB flat. It does not cover private property or ECs. ", srcLink("cpf_hps")],
    age >= 65 ? ["HPS cover ends at 65. CPF suggests private insurance for a loan running past it. ", srcLink("cpf_hps")]
      : ["If your loan runs past 65, CPF suggests private insurance for after HPS ends. ", srcLink("cpf_hps")],
  ];
  return h("section", { "aria-labelledby": "home-h" },
    h("h2", { id: "home-h", text: "Your home loan" }),
    h("ul", { class: "facts" }, items.map(x => h("li", null, x))),
    h("p", { class: "meta mt8", text: "None of the official sources used here gives a rule for adding a home loan to the 9x figure, or recommends a particular mortgage plan, so the loan is shown beside the figure rather than added to it." }));
}

// The short answer sits in the summary, so the page answers every question without a tap.
// A "Questions to ask yourself" list helps the reader decide without the site deciding for them.
// Each question carries its own source: one from the answer's source is covered by the
// source line, and any other gets its own link, so every question stays traceable.
function faqItem(q) {
  const ask = q.ask || [];
  return h("details", { class: "faq" },
    h("summary", null, h("span", { class: "q", text: q.q }), h("span", { class: "short", text: q.short })),
    h("div", null, h("p", null, rich(q.a)),
      ask.length ? [
        h("h3", { class: "ask-h", text: "Questions to ask yourself" }),
        h("ul", { class: "ask" }, ask.map(a => h("li", null, a.t, a.s !== q.s ? [" ", srcLink(a.s)] : null))),
      ] : null,
      h("p", { class: "meta" }, "Source: ", srcLink(q.s))));
}

function viewFaq() {
  return [
    h("h1", { text: "Common questions" }),
    state.guide.faq.map(faqItem),
  ];
}

function viewGlossary() {
  const g = state.guide;
  return [
    h("h1", { text: "Key terms" }),
    h("p", { class: "lede", text: "The insurance words this site uses, in plain English, each linked to the official page it comes from. Tap an underlined word anywhere on the site to see its entry without leaving the page." }),
    // flatMap: route() flattens only three levels, and this nests one deeper than other views.
    g.glossary_groups.flatMap(gr => [
      h("h2", { text: gr.name }),
      h("div", { class: "fold-list" }, g.glossary.filter(t => t.group === gr.id).map(t =>
        fold("term-" + t.id, t.term, summaryOf(t.lines[0] && t.lines[0].t, 90), termBody(t)))),
    ]),
    disclaimerNote(),
  ];
}

function viewTop5() {
  const bullets = items => h("ul", { class: "facts" }, items.map(f => h("li", null,
    rich(f.t), f.s ? [" ", srcLink(f.s)] : null,
    f.link ? [" ", h("a", { href: f.link, text: f.label })] : null)));
  return [
    h("h1", { text: "Top 5 ways people get caught out" }),
    h("p", { class: "lede", text: "The problems that cost people most when they buy medical, life and critical illness cover in Singapore, and what to do about each. Every figure links to its source." }),
    state.guide.pain_points.map((p, i) => fold(p.id, `${i + 1}. ${p.title}`, summaryOf(p.why[0] && p.why[0].t),
      glance(p.key),
      h("h3", { text: "Why it bites" }),
      bullets(p.why),
      h("h3", { text: "What to do" }),
      bullets(p.fix))),
    disclaimerNote(),
  ];
}

function viewSources() {
  const n = state.products.length, pdfs = state.products.reduce((a, p) => a + p.pdfs.length, 0);
  const unv = state.products.filter(p => UNVERIFIED.has(p.status)).length;
  const check = `Every link is re-checked by script: it must load, must not redirect to a home or error page, and a plan page must name the plan. ${unv ? unv + " plan link(s) sit on sites that block scripts and are marked \"Check link\"." : "All plan links passed the last check."}`;
  // Official sources grouped by publisher, the biggest first.
  const byPub = new Map();
  for (const s of Object.values(state.guide.sources)) byPub.set(s.publisher, [...(byPub.get(s.publisher) || []), s]);
  const pubs = [...byPub].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return [
    h("h1", { text: "Sources and method" }),
    h("p", { text: `${n} plans from ${state.insurers.length} insurers, with ${pdfs} official PDFs. Plan details come only from each insurer's own website and documents. Government and industry figures come from the official pages below.` }),
    h("div", { class: "fold-list" },
      fold("method", "How facts and links are checked", summaryOf(check),
        h("p", { text: check }),
        h("p", { text: "Time-limited promotions are deliberately left out, and so are savings, endowment, investment-linked, annuity and wealth or legacy plans: this site covers protection only." })),
      fold("disclaimer", "Disclaimer", summaryOf(state.guide.disclaimer[0]),
        h("ul", { class: "facts" }, state.guide.disclaimer.map(t => h("li", { text: t }))))),
    h("h2", { text: "Official sources" }),
    h("div", { class: "fold-list" }, pubs.map(([pub, list]) =>
      subFold(null, pub, count(list.length, "official page", "official pages"),
        h("ul", { class: "facts" }, list.map(s => h("li", null, ext(s.url, s.title))))))),
    h("div", { class: "fold-list" },
      fold("disputes", "If something goes wrong", "Disputes go to the insurer first, then to FIDReC.",
        h("p", null, "Disputes with an insurer go first to the insurer, then to ", ext(state.guide.sources.fidrec.url, "FIDReC"), " within six months of the insurer's final reply."))),
  ];
}

function viewSearch(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = s => terms.every(t => s.toLowerCase().includes(t));
  const cats = Object.values(state.cats).filter(c => hit(plainText([c.name, c.short, c.plain, c.who, c.what].join(" "))));
  const gloss = state.guide.glossary.filter(t => hit([t.term, ...(t.aliases || []), ...t.lines.map(l => l.t)].join(" ")));
  const prods = state.products.filter(p => hit([p.name, insName(p.insurer), catName(p.category), p.subtype || "", p.summary, p.facts.join(" ")].join(" ")));
  const ins = state.insurers.filter(i => hit(i.name + " " + (i.formerly || "")));
  const faq = state.guide.faq.filter(f => hit(plainText(f.q + " " + f.a)));
  const pains = state.guide.pain_points.filter(p => hit(plainText([p.title, ...p.why.map(f => f.t), ...p.fix.map(f => f.t)].join(" "))));
  const schemes = state.guide.schemes.filter(s => hit([s.name, s.kind, s.who, s.facts.map(f => f.t).join(" ")].join(" ")));
  const out = [h("h1", { text: `Results for “${q}”` })];
  if (!cats.length && !prods.length && !ins.length && !faq.length && !schemes.length && !pains.length && !gloss.length) {
    out.push(empty("think", h("p", { text: "Nothing matched. Try a plan name, an insurer, or a word like “cancer” or “hospital”." })));
  }
  if (gloss.length) out.push(h("h2", { text: "Key terms" }), h("div", { class: "grid" }, gloss.map(t => h("a", { class: "card", href: "#/glossary#term-" + t.id }, h("h3", { text: t.term }), h("p", { class: "meta", text: t.lines[0].t })))));
  if (ins.length) out.push(h("h2", { text: "Insurers" }), h("div", { class: "grid" }, ins.map(i => h("a", { class: "card", href: "#/insurer/" + i.id }, h("h3", { text: i.name })))));
  if (cats.length) out.push(h("h2", { text: "Insurance types" }), h("div", { class: "grid" }, cats.map(c => h("a", { class: "card type g" + GROUP_OF[c.id], href: "#/type/" + c.id }, h("div", { class: "card-head" }, catIcon(c.id), h("h3", { text: c.name })), h("p", { text: c.short })))));
  if (schemes.length) out.push(h("h2", { text: "National schemes" }), h("div", { class: "grid" }, schemes.map(s => h("a", { class: "card", href: "#/schemes#" + s.id }, h("h3", { text: s.name }), h("p", { class: "meta", text: s.kind })))));
  if (pains.length) out.push(h("h2", { text: "Top 5 ways people get caught out" }), h("div", { class: "grid" }, pains.map(p => h("a", { class: "card", href: "#/top5#" + p.id }, h("h3", { text: p.title })))));
  if (faq.length) out.push(h("h2", { text: "Questions" }), faq.map(faqItem));
  if (prods.length) out.push(h("h2", { text: `Plans (${prods.length})` }), h("div", { class: "grid" }, prods.slice(0, 60).map(p => productCard(p, true))),
    prods.length > 60 ? h("p", { class: "meta", text: "Showing the first 60. Add a word to narrow it down." }) : null);
  return out;
}

function viewMissing() {
  return [h("h1", { text: "Page not found" }), empty("oops", h("p", null, "This page has wandered off. ", h("a", { href: "#/", text: "Back to all insurance types" })))];
}

// ---------- router ----------
const LEDE_POSE = { when: "think", top5: "alert", insurers: "wave", glossary: "read", sources: "read", faq: "think" };
const TAB_OF = { "": "types", type: "types", when: "when", top5: "top5", insurers: "insurers", insurer: "insurers", compare: "compare", schemes: "schemes", check: "check", glossary: "glossary", faq: "faq", sources: "sources" };

// ---------- the helper (Kopi or Pip, by look) ----------
// A small mascot in the corner that now and then offers a navigation hint. Rules that keep it
// from being a nuisance: at most one tip per page view, each tip shown once ever, never in the
// first moments of a page or while you type, gone by itself after 8 seconds, hidden while you
// scroll down, and one tap turns it off for good. It only points at parts of this site: it never
// states an insurance fact, so it cannot say anything unsourced.
const HELPER_OFF = "ai-helper-off", TIPS_SEEN = "ai-tips-seen";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not saved */ } },
};
const helper = { el: null, bubble: null, timer: 0, shownThisPage: false, lastKey: 0 };

function seenTips() { try { return new Set(JSON.parse(store.get(TIPS_SEEN) || "[]")); } catch { return new Set(); } }
function markSeen(id) { const s = seenTips(); s.add(id); store.set(TIPS_SEEN, JSON.stringify([...s])); }

function helperSay(text, action, opts = {}) {
  if (!helper.el || helper.el.hidden) return;
  clearTimeout(helper.timer);
  const close = () => { helper.bubble.hidden = true; helper.el.classList.remove("talking"); };
  helper.bubble.replaceChildren(
    h("p", { text }),
    h("div", { class: "hb-row" },
      action ? h("a", { class: "btn", href: action.href || "#", onclick: e => { if (action.run) { e.preventDefault(); action.run(); } close(); } }, action.label) : null,
      h("button", { type: "button", class: "btn ghost", text: "OK", onclick: close }),
      opts.offer ? h("button", { type: "button", class: "hb-off", text: "Turn helper off", onclick: () => { store.set(HELPER_OFF, "1"); helper.el.hidden = true; } }) : null));
  helper.bubble.hidden = false;
  helper.el.classList.add("talking");
  hop();
  helper.timer = setTimeout(close, 8000);
}

function hop() {
  const m = helper.el && helper.el.querySelector(".mascot");
  if (!m) return;
  m.classList.remove("hop"); void m.getBoundingClientRect(); m.classList.add("hop");
}

// One contextual tip for the page just shown, if it has not been seen before.
function helperTip(seg, arg) {
  if (!helper.el || helper.el.hidden || helper.shownThisPage) return;
  const seen = seenTips();
  const tips = [
    { id: "welcome", when: seg === "", text: `Hi, I'm ${mascotName()}! New here? "What pays when" shows how the different covers fit together.`, action: { label: "Show me", href: "#/when" } },
    { id: "age", when: seg === "type" && arg === "hospitalisation" && !getAge(), text: "Tell me your age next birthday and I'll show what a Shield plan would cost you.", action: { label: "Enter my age", run: () => { const i = document.getElementById("my-age"); if (i) { i.scrollIntoView({ block: "center" }); i.focus({ preventScroll: true }); } } } },
    { id: "qa", when: seg === "type" && !!document.getElementById("qa-h"), text: "There are common questions about this type further down the page.", action: { label: "Take me there", run: () => { const d = document.getElementById("qa"); d.open = true; d.scrollIntoView({ block: "start" }); } } },
    { id: "sources", when: seg === "type", text: "Every official figure links to its source. Tap the little arrow to check it yourself." },
  ];
  const tip = tips.find(t => t.when && !seen.has(t.id));
  if (!tip) return;
  helper.shownThisPage = true;
  const tipHash = location.hash;
  setTimeout(() => {
    // Typing means a key pressed in the last 4 seconds, not just a focused search box.
    if (Date.now() - helper.lastKey < 4000 || location.hash !== tipHash) return;
    markSeen(tip.id);
    helperSay(tip.text, tip.action, { offer: seen.size >= 1 });
  }, 2500);
}

function helperOnRoute(seg, arg) {
  if (!helper.el || helper.redraw) return;
  helper.shownThisPage = false;
  clearTimeout(helper.timer);
  helper.bubble.hidden = true;
  helper.el.classList.remove("talking");
  helperTip(seg, arg);
}

function helperRedraw() {
  const btn = helper.el && helper.el.querySelector(".hbtn");
  if (!btn) return;
  btn.replaceChildren(mascot("wave", 52));
  btn.setAttribute("aria-label", `${mascotName()}, the helper. Tap for a hint.`);
}
function mountHelper() {
  if (store.get(HELPER_OFF)) return;
  helper.bubble = h("div", { class: "hb", role: "status", "aria-live": "polite", hidden: true });
  const btn = h("button", { type: "button", class: "hbtn", "aria-label": `${mascotName()}, the helper. Tap for a hint.`, onclick: () => {
      if (!helper.bubble.hidden) { helper.bubble.hidden = true; helper.el.classList.remove("talking"); return; }
      const lines = [`Hi, I'm ${mascotName()}! I point you to the right part of this site. I don't give advice.`,
        "Your age, if you enter it, stays in this browser only.",
        "Lost? \"What pays when\" is a good place to start."];
      helperSay(lines[Math.floor(Math.random() * lines.length)], null, { offer: true });
    } }, mascot("wave", 52));
  helper.el = h("div", { class: "helper" }, helper.bubble, btn);
  document.body.append(helper.el);
  document.body.classList.add("has-helper");
  document.addEventListener("keydown", () => { helper.lastKey = Date.now(); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !helper.bubble.hidden) { helper.bubble.hidden = true; helper.el.classList.remove("talking"); } });
  document.addEventListener("ai:age", e => { if (e.detail && !seenTips().has("age-set")) { markSeen("age-set"); setTimeout(() => helperSay(`Got it! I've marked age ${e.detail} in every by-age chart. Change or clear it any time.`), 400); } });
  // Like an iOS toolbar: out of the way while you read down the page, back when you scroll up.
  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 8) return;
    helper.el.classList.toggle("tucked", y > lastY && y > 120 && helper.bubble.hidden);
    lastY = y;
  }, { passive: true });
}

// ---------- phone chrome: iOS-style tab bar, "More" sheet and a title bar that appears on scroll ----------
// All of it is hidden from 720px up, where the top tabs show instead (see app.css).
const MORE_TABS = new Set(["top5", "insurers", "schemes", "glossary", "faq", "sources"]);
const moreSheet = document.getElementById("more-sheet");
const moreBtn = document.getElementById("more-btn");
function closeMore() {
  if (!moreSheet) return;
  if (POPOVER) { if (moreSheet.matches(":popover-open")) moreSheet.hidePopover(); } else moreSheet.classList.remove("open");
  if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
}
if (moreBtn && moreSheet) {
  moreBtn.addEventListener("click", () => {
    if (POPOVER) moreSheet.togglePopover(); else moreSheet.classList.toggle("open");
    moreBtn.setAttribute("aria-expanded", String(POPOVER ? moreSheet.matches(":popover-open") : moreSheet.classList.contains("open")));
  });
  if (POPOVER) moreSheet.addEventListener("toggle", e => moreBtn.setAttribute("aria-expanded", String(e.newState === "open")));
}
// The page's large title scrolls away like an iOS large title; the slim bar then shows it.
let titleWatch = null;
function phoneChrome(tab) {
  if (moreBtn) moreBtn.classList.toggle("is-current", MORE_TABS.has(tab));
  const t = main.querySelector("h1"), bar = document.getElementById("navtitle");
  if (bar) bar.textContent = t ? t.textContent : "";
  document.body.classList.remove("scrolled");
  if (titleWatch) titleWatch.disconnect();
  if (t && "IntersectionObserver" in window) {
    titleWatch = new IntersectionObserver(([e]) => document.body.classList.toggle("scrolled", !e.isIntersecting && e.boundingClientRect.top < 0));
    titleWatch.observe(t);
  }
}

function route() {
  if (POPOVER && pop.matches(":popover-open")) { popFrom = null; pop.hidePopover(); }
  closeMore();
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, anchor] = raw.split("#");
  const [path, qs] = pathPart.split("?");
  const params = new URLSearchParams(qs || "");
  const [seg, arg] = path.split("/");
  let view;
  switch (seg) {
    case "": view = viewTypes(); break;
    case "type": view = viewType(decodeURIComponent(arg || ""), params); break;
    case "top5": view = viewTop5(); break;
    case "when": view = viewWhen(params); break;
    case "insurers": view = viewInsurers(); break;
    case "insurer": view = viewInsurer(decodeURIComponent(arg || "")); break;
    case "compare": view = arg ? viewCompareType(decodeURIComponent(arg), params) : viewCompare(); break;
    case "schemes": view = viewSchemes(); break;
    case "check": view = viewCheck(); break;
    case "glossary": view = viewGlossary(); break;
    case "faq": view = viewFaq(); break;
    case "sources": view = viewSources(); break;
    case "search": view = viewSearch(params.get("q") || ""); break;
    default: view = viewMissing();
  }
  main.replaceChildren(...[view].flat(3).filter(Boolean));
  // On every page but home (which has its own hero), the mascot "says" the intro paragraph.
  const lede = seg !== "" && main.querySelector(":scope > .lede");
  if (lede) { const at = h("span"); lede.replaceWith(at); at.replaceWith(say(LEDE_POSE[seg] || "happy", lede)); }
  const tab = TAB_OF[seg];
  document.querySelectorAll(".tabs a, .tabbar a, .sheet-list a").forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  phoneChrome(tab);
  const t = main.querySelector("h1");
  document.title = (seg === "" || !t ? "" : t.textContent + " · ") + "Ask Insurance";
  if (anchor) {
    const el = document.getElementById(anchor);
    if (el) {
      for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
      el.scrollIntoView(); helperOnRoute(seg, arg); return;
    }
  }
  window.scrollTo(0, 0);
  if (seg !== "") main.focus({ preventScroll: true });
  helperOnRoute(seg, arg);
}

document.getElementById("search-form").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value.trim();
  if (q) location.hash = "#/search?q=" + encodeURIComponent(q);
});

async function load() {
  try {
    const get = f => fetch("data/" + f, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const [g, i, cmp] = await Promise.all([get("guide.json"), get("insurers.json"), get("compare.json")]);
    state.guide = g;
    state.compare = cmp;
    state.insurers = i.insurers;
    state.products = i.insurers.flatMap(ins => ins.products.map(p => Object.assign({ insurer: ins.id }, p)));
    for (const c of g.categories) state.cats[c.id] = c;
    for (const s of g.schemes) state.schemes[s.id] = s;
    for (const t of g.glossary) state.gloss[t.id] = t;
    document.getElementById("foot-meta").textContent =
      `Government facts checked ${g.updated}. ${state.products.length} plans from ${state.insurers.length} insurers.`;
    window.addEventListener("hashchange", route);
    renderLookSwitches();
    mountHelper();
    route();
  } catch (err) {
    main.replaceChildren(h("h1", { text: "Could not load the data" }), empty("oops", h("p", { text: "Check your connection and reload. (" + err.message + ")" })));
  }
}

load();
