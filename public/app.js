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
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

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
const FIGURE = /(S?\$[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%|\b\d+(?:\.\d+)?(?:x\b| times\b)|\b\d+ (?:days|weeks|months|years)\b)/;
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
    h("div", { class: "pop-head" },
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
    h("h2", { id: "must-h", class: "mt0", text: "Must know" }),
    h("ul", null, items.map(([label, f]) => h("li", null,
      h("span", { class: "tag" + (label === "Pitfall" ? " warn" : ""), text: label }), " ",
      rich(f.t), f.s ? [" ", srcLink(f.s)] : null))));
}

function rest(items) { return items.filter(f => !f.top); }

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
function viewTypes() {
  const out = [
    h("h1", { text: "Singapore personal insurance, sourced" }),
    h("p", { class: "lede", text: "Every type of protection insurance except travel, explained in plain words: what it does, what can go wrong, what the Government already gives you, and which insurers sell it. Every official figure links to its source." }),
    disclaimerNote(),
    h("section", { class: "must", "aria-labelledby": "top5-h" },
      h("h2", { id: "top5-h", class: "mt0", text: "Top 5 ways people get caught out" }),
      h("ol", { class: "top5" }, state.guide.pain_points.map(p =>
        h("li", null, h("a", { href: "#/top5#" + p.id, text: p.title }))))),
  ];
  for (const [title, ids] of GROUPS) {
    out.push(h("h2", { class: "group-title", text: title }));
    out.push(h("div", { class: "grid" }, ids.map(id => {
      const c = state.cats[id];
      const prods = state.products.filter(p => p.category === id);
      const sellers = new Set(prods.map(p => p.insurer)).size;
      return h("a", { class: "card", href: "#/type/" + id },
        h("h3", { text: c.name }),
        h("p", { text: c.short }),
        h("p", { class: "meta", text: prods.length ? `${prods.length} plans from ${sellers} insurer${sellers === 1 ? "" : "s"}` : "National schemes and guidance" }));
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
    h("h1", { text: c.name }),
    glance(c.key),
    mustKnow(c),
    h("h2", { text: "In simple terms" }),
    h("p", { class: "lede" }, rich(c.plain, false)),
    h("h2", { text: "Who it is for" }),
    h("p", null, rich(c.who, false)),
    h("h2", { text: "Key facts" }),
    h("p", null, rich(c.what, false)),
  ];
  // Must-know items already sit at the top; the sections below hold the rest.
  const sections = [
    ["facts", null, null, null],
    ["watch", "Pitfalls to avoid", "More pitfalls to avoid", "watch"],
    ["caveats", "Caveats and fine print", "More fine print", null],
  ];
  for (const [key, title, moreTitle, cls] of sections) {
    const items = rest(c[key]);
    if (!items.length) continue;
    if (title) out.push(h("h2", { text: items.length < c[key].length ? moreTitle : title }));
    out.push(factList(items, cls));
  }
  if (c.versus) out.push(versus(c.versus));
  if (c.schemes.length) {
    out.push(h("h2", { text: "What the Government already covers" }),
      h("div", { class: "grid" }, c.schemes.map(s => {
        const sc = state.schemes[s];
        return h("a", { class: "card", href: "#/schemes#" + s }, h("h3", { text: sc.name }), h("p", { class: "meta", text: sc.who }));
      })));
  }
  out.push(h("h2", { text: "Questions to compare plans on" }), h("ul", { class: "checklist" }, c.compare.map(q => h("li", { text: q }))));
  if (c.tools.length) out.push(h("p", { class: "links" }, c.tools.map(t => ext(state.guide.sources[t].url, state.guide.sources[t].title))));
  out.push(disclaimerNote());
  out.push(h("h2", { text: `Who sells it (${all.length})` }));
  if (!all.length) {
    out.push(h("p", { class: "meta", text: "None of the insurers covered here lists a standalone plan of this type on its website. See the national schemes above." }));
    return out;
  }
  const sel = h("select", { id: "f-ins", onchange: e => { location.hash = "#/type/" + id + (e.target.value ? "?insurer=" + e.target.value : ""); } },
    h("option", { value: "", text: `All insurers (${sellers.length})` }),
    sellers.map(s => h("option", { value: s, selected: s === pick, text: insName(s) })));
  out.push(h("div", { class: "filters" }, h("label", { for: "f-ins", text: "Insurer" }), sel,
    h("a", { href: "#/compare/" + id + (pick ? "?ins=" + pick : ""), text: (state.compare[id] || {}).kind === "moh" ? "Compare them side by side on MOH's figures" : "Compare them side by side" })));
  out.push(h("div", { class: "grid" }, list.map(p => productCard(p, true))));
  return out;
}

// Two covers side by side, row by row, then made-up situations. Every line carries its source;
// nothing here says which to buy.
function versus(vs) {
  const lines = items => items.map(f => h("p", null, rich(f.t), " ", srcLink(f.s)));
  return h("section", { id: "versus", class: "versus", "aria-labelledby": "versus-h" },
    h("h2", { id: "versus-h", text: vs.title }),
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
  let band = bands.includes(params.get("age")) ? params.get("age") : comp.default_band;
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
    if (!cols.length) { body.replaceChildren(h("p", { class: "notice", text: "Tick at least one plan above to compare." })); return; }
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
  const pick = picker(plans.map(p => ({ id: p.id, insurer: p.insurer, label: p.name })), picked, sel => {
    picked = ids.filter(id => sel.includes(id));
    setCompareUrl(cat, { p: picked.length === ids.length ? "" : picked.length ? picked.join(",") : NONE });
    draw();
  });
  function draw() {
    pick.update(picked);
    grid.replaceChildren(...(picked.length ? plans.filter(p => picked.includes(p.id)).map(p => productCard(p, true))
      : [h("p", { class: "notice", text: "Tick at least one plan above to compare." })]));
  }
  draw();
  return [
    ...head,
    h("p", { class: "lede", text: "There is no official like-for-like table for this type yet, so each plan shows the facts from its insurer's own page. Use the questions below to compare them." }),
    pick.el,
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
    state.guide.schemes.map(s => h("section", { class: "card scheme", id: s.id },
      h("h2", { class: "mt0", text: s.name }),
      h("p", { class: "meta", text: s.kind + ". " + s.who }),
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
function faqItem(q) {
  return h("details", { class: "faq" },
    h("summary", null, h("span", { class: "q", text: q.q }), h("span", { class: "short", text: q.short })),
    h("div", null, h("p", null, rich(q.a)), h("p", { class: "meta" }, "Source: ", srcLink(q.s))));
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
      g.glossary.filter(t => t.group === gr.id).map(t => h("section", { class: "card term-card", id: "term-" + t.id, "aria-labelledby": "th-" + t.id },
        h("h3", { id: "th-" + t.id, class: "mt0", text: t.term }),
        termBody(t))),
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
    state.guide.pain_points.map((p, i) => h("section", { class: "card pain", id: p.id },
      h("h2", { class: "mt0", text: `${i + 1}. ${p.title}` }),
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
  return [
    h("h1", { text: "Sources and method" }),
    h("p", { text: `${n} plans from ${state.insurers.length} insurers, with ${pdfs} official PDFs. Plan details come only from each insurer's own website and documents. Government and industry figures come from the official pages below.` }),
    h("p", { text: `Every link is re-checked by script: it must load, must not redirect to a home or error page, and a plan page must name the plan. ${unv ? unv + " plan link(s) sit on sites that block scripts and are marked \"Check link\"." : "All plan links passed the last check."}` }),
    h("p", { text: "Time-limited promotions are deliberately left out, and so are savings, endowment, investment-linked, annuity and wealth or legacy plans: this site covers protection only." }),
    h("h2", { id: "disclaimer", text: "Disclaimer" }),
    h("ul", { class: "facts" }, state.guide.disclaimer.map(t => h("li", { text: t }))),
    h("h2", { text: "Official sources" }),
    h("ul", { class: "facts" }, Object.values(state.guide.sources).map(s => h("li", null, ext(s.url, s.title), h("span", { class: "meta", text: " · " + s.publisher })))),
    h("h2", { text: "If something goes wrong" }),
    h("p", null, "Disputes with an insurer go first to the insurer, then to ", ext(state.guide.sources.fidrec.url, "FIDReC"), " within six months of the insurer's final reply."),
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
    out.push(h("p", { text: "Nothing matched. Try a plan name, an insurer, or a word like “cancer” or “hospital”." }));
  }
  if (gloss.length) out.push(h("h2", { text: "Key terms" }), h("div", { class: "grid" }, gloss.map(t => h("a", { class: "card", href: "#/glossary#term-" + t.id }, h("h3", { text: t.term }), h("p", { class: "meta", text: t.lines[0].t })))));
  if (ins.length) out.push(h("h2", { text: "Insurers" }), h("div", { class: "grid" }, ins.map(i => h("a", { class: "card", href: "#/insurer/" + i.id }, h("h3", { text: i.name })))));
  if (cats.length) out.push(h("h2", { text: "Insurance types" }), h("div", { class: "grid" }, cats.map(c => h("a", { class: "card", href: "#/type/" + c.id }, h("h3", { text: c.name }), h("p", { text: c.short })))));
  if (schemes.length) out.push(h("h2", { text: "National schemes" }), h("div", { class: "grid" }, schemes.map(s => h("a", { class: "card", href: "#/schemes#" + s.id }, h("h3", { text: s.name }), h("p", { class: "meta", text: s.kind })))));
  if (pains.length) out.push(h("h2", { text: "Top 5 ways people get caught out" }), h("div", { class: "grid" }, pains.map(p => h("a", { class: "card", href: "#/top5#" + p.id }, h("h3", { text: p.title })))));
  if (faq.length) out.push(h("h2", { text: "Questions" }), faq.map(faqItem));
  if (prods.length) out.push(h("h2", { text: `Plans (${prods.length})` }), h("div", { class: "grid" }, prods.slice(0, 60).map(p => productCard(p, true))),
    prods.length > 60 ? h("p", { class: "meta", text: "Showing the first 60. Add a word to narrow it down." }) : null);
  return out;
}

function viewMissing() {
  return [h("h1", { text: "Page not found" }), h("p", null, h("a", { href: "#/", text: "Back to all insurance types" }))];
}

// ---------- router ----------
const TAB_OF = { "": "types", type: "types", top5: "top5", insurers: "insurers", insurer: "insurers", compare: "compare", schemes: "schemes", check: "check", glossary: "glossary", faq: "faq", sources: "sources" };

function route() {
  if (POPOVER && pop.matches(":popover-open")) { popFrom = null; pop.hidePopover(); }
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
  const tab = TAB_OF[seg];
  document.querySelectorAll(".tabs a").forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const t = main.querySelector("h1");
  document.title = (seg === "" || !t ? "" : t.textContent + " · ") + "Ask Insurance";
  if (anchor) {
    const el = document.getElementById(anchor);
    if (el) { el.scrollIntoView(); return; }
  }
  window.scrollTo(0, 0);
  if (seg !== "") main.focus({ preventScroll: true });
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
    route();
  } catch (err) {
    main.replaceChildren(h("h1", { text: "Could not load the data" }), h("p", { text: "Check your connection and reload. (" + err.message + ")" }));
  }
}

load();
