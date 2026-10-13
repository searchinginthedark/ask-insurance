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

const state = { guide: null, insurers: [], products: [], cats: {}, schemes: {} };
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
function rich(text) {
  return text.split(FIGURE).map((part, i) => i % 2 ? h("strong", { class: "num", text: part }) : part);
}

function factList(items, cls) {
  // Must-know items first, marked; the rest keep their order.
  const sorted = [...items.filter(f => f.top), ...items.filter(f => !f.top)];
  return h("ul", { class: "facts" + (cls ? " " + cls : "") },
    sorted.map(f => h("li", { class: f.top ? "top" : null },
      f.top ? h("span", { class: "flag", text: "Must know" }) : null,
      rich(f.t), f.s ? [" ", srcLink(f.s)] : null)));
}

// The one to three figures that matter most on a page, each with its own source.
function glance(keys) {
  if (!keys || !keys.length) return null;
  return h("div", { class: "glance", role: "list", "aria-label": "At a glance" },
    keys.map(k => h("div", { class: "fig", role: "listitem" },
      h("p", { class: "v", text: k.v }),
      h("p", { class: "l" }, k.l, " ", srcLink(k.s)))));
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
    h("p", { class: "lede", text: c.plain }),
    h("h2", { text: "Who it is for" }),
    h("p", { text: c.who }),
    h("h2", { text: "Key facts" }),
    h("p", { text: c.what }),
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
  out.push(h("div", { class: "filters" }, h("label", { for: "f-ins", text: "Insurer" }), sel));
  out.push(h("div", { class: "grid" }, list.map(p => productCard(p, true))));
  return out;
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

function viewCompare() {
  const ins = state.insurers.filter(i => i.products.length);
  const table = h("table", { class: "matrix" },
    h("caption", { class: "sr", text: "Number of plans per insurance type and insurer" }),
    h("thead", null, h("tr", null, h("th", { scope: "col", text: "Type" }), ins.map(i => h("th", { scope: "col", text: i.name.replace(/ (Singapore|Insurance|Life Insurance)$/,"") })))),
    h("tbody", null, Object.values(state.cats).map(c => h("tr", null,
      h("th", { scope: "row" }, h("a", { href: "#/type/" + c.id, text: c.name })),
      ins.map(i => {
        const n = i.products.filter(p => p.category === c.id).length;
        return n ? h("td", null, h("a", { href: `#/type/${c.id}?insurer=${i.id}`, "aria-label": `${n} ${c.name} plans from ${i.name}`, text: String(n) }))
                 : h("td", { class: "none", "aria-label": "none", text: "–" });
      })))));
  return [
    h("h1", { text: "Compare: who sells what" }),
    h("p", { class: "lede", text: "Number of plans each insurer lists for each type. Tap a number to see those plans." }),
    h("div", { class: "matrix-wrap" }, table),
    h("p", { class: "meta", text: "A dash means none was found on that insurer's website, not that it can never be arranged through an adviser." }),
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

function viewCheck() {
  const r = state.guide.rules_of_thumb;
  const f = {
    age: h("input", { id: "c-age", type: "number", inputmode: "numeric", min: 0, max: 100, value: "35" }),
    income: h("input", { id: "c-inc", type: "number", inputmode: "numeric", min: 0, step: 1000, value: "60000" }),
    prem: h("input", { id: "c-prem", type: "number", inputmode: "numeric", min: 0, step: 100, value: "" , placeholder: "optional" }),
    work: h("input", { id: "c-work", type: "checkbox", checked: true }),
    hdb: h("input", { id: "c-hdb", type: "checkbox" }),
  };
  const res = h("div", { "aria-live": "polite" });
  function calc() {
    // min/max on the inputs do not stop typed values, so clamp here.
    const age = Math.min(120, Math.max(0, Math.floor(Number(f.age.value) || 0)));
    const inc = Math.max(0, Number(f.income.value) || 0), prem = Math.max(0, Number(f.prem.value) || 0);
    const year = new Date().getFullYear(), born = year - age;
    const tiles = [
      h("div", { class: "card" }, h("p", { class: "meta", text: "Death and TPD cover (9x)" }), h("p", { class: "big", text: money(inc * 9) })),
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
    if (f.hdb.checked && age < 65) have.push(["hps", "HPS pays off your HDB loan (up to the insured sum) until 65 or the loan ends."]);
    res.replaceChildren(
      h("div", { class: "result" }, tiles),
      h("p", { class: "meta mt8" }, "Rule of thumb from the ", ext(state.guide.sources[r.source].url, "MoneySense Basic Financial Planning Guide"), ". Count what you already hold, including the schemes below, before buying more."),
      h("h2", { text: "What you likely already have" }),
      h("ul", { class: "facts" }, have.map(([id, t]) => h("li", null, t, " ", h("a", { href: "#/schemes#" + id, text: "Details" })))));
  }
  for (const el of Object.values(f)) el.addEventListener("input", calc);
  calc();
  return [
    h("h1", { text: "Cover check" }),
    h("p", { class: "lede", text: "A quick benchmark against the official rule of thumb. Nothing you type leaves this page." }),
    h("div", { class: "form" },
      h("label", { class: "field" }, h("span", { text: "Your age" }), f.age),
      h("label", { class: "field" }, h("span", { text: "Annual income (S$)" }), f.income),
      h("label", { class: "field" }, h("span", { text: "Yearly protection premiums (S$)" }), f.prem),
      h("label", { class: "check" }, f.work, "Working, with CPF contributions"),
      h("label", { class: "check" }, f.hdb, "Paying an HDB loan with CPF")),
    res,
    h("p", { class: "notice mt16", text: "These multiples are general guidance, not a recommendation for you. Dependants, debts, savings and existing policies change the right amount." }),
  ];
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
  const cats = Object.values(state.cats).filter(c => hit([c.name, c.short, c.plain, c.who, c.what].join(" ")));
  const prods = state.products.filter(p => hit([p.name, insName(p.insurer), catName(p.category), p.subtype || "", p.summary, p.facts.join(" ")].join(" ")));
  const ins = state.insurers.filter(i => hit(i.name + " " + (i.formerly || "")));
  const faq = state.guide.faq.filter(f => hit(f.q + " " + f.a));
  const pains = state.guide.pain_points.filter(p => hit([p.title, ...p.why.map(f => f.t), ...p.fix.map(f => f.t)].join(" ")));
  const schemes = state.guide.schemes.filter(s => hit([s.name, s.kind, s.who, s.facts.map(f => f.t).join(" ")].join(" ")));
  const out = [h("h1", { text: `Results for “${q}”` })];
  if (!cats.length && !prods.length && !ins.length && !faq.length && !schemes.length && !pains.length) {
    out.push(h("p", { text: "Nothing matched. Try a plan name, an insurer, or a word like “cancer” or “hospital”." }));
  }
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
const TAB_OF = { "": "types", type: "types", top5: "top5", insurers: "insurers", insurer: "insurers", compare: "compare", schemes: "schemes", check: "check", faq: "faq", sources: "sources" };

function route() {
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
    case "compare": view = viewCompare(); break;
    case "schemes": view = viewSchemes(); break;
    case "check": view = viewCheck(); break;
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
    const [g, i] = await Promise.all([
      fetch("data/guide.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/insurers.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
    state.guide = g;
    state.insurers = i.insurers;
    state.products = i.insurers.flatMap(ins => ins.products.map(p => Object.assign({ insurer: ins.id }, p)));
    for (const c of g.categories) state.cats[c.id] = c;
    for (const s of g.schemes) state.schemes[s.id] = s;
    document.getElementById("foot-meta").textContent =
      `Government facts checked ${g.updated}. ${state.products.length} plans from ${state.insurers.length} insurers.`;
    window.addEventListener("hashchange", route);
    route();
  } catch (err) {
    main.replaceChildren(h("h1", { text: "Could not load the data" }), h("p", { text: "Check your connection and reload. (" + err.message + ")" }));
  }
}

load();
