const TIER_COLORS = {
  cooked: "#d32f2f",
  gpt_wrapper: "#e67e22",
  moat_for_now: "#c49b1a",
  actually_hard: "#1a7a5a",
};
const TIER_LABELS = {
  cooked: "Cooked",
  gpt_wrapper: "GPT Wrapper",
  moat_for_now: "Moat (for now)",
  actually_hard: "Actually Hard",
};
const TIER_ORDER = ["cooked", "gpt_wrapper", "moat_for_now", "actually_hard"];

let DATA = null;
let currentTierFilter = "all";
let currentSearch = "";

fetch("data.json")
  .then((r) => r.json())
  .then((d) => {
    DATA = d;
    init();
  });

function init() {
  renderHero();
  renderDonut();
  renderFloorMap();
  renderMoneyChart();
  renderCategoryChart();
  renderGallery();
  setupListeners();
}

function renderHero() {
  const m = DATA.meta;
  document.getElementById("hero-sub").textContent =
    `${m.total} exhibitors. ${m.cooked_pct}% could be replaced by a weekend of vibe-coding in Cursor. Here's every booth, roasted.`;

  const statsEl = document.getElementById("hero-stats");
  const stats = [
    { n: m.tier_counts.cooked || 0, l: "Cooked", c: TIER_COLORS.cooked },
    { n: m.tier_counts.gpt_wrapper || 0, l: "GPT Wrappers", c: TIER_COLORS.gpt_wrapper },
    { n: m.tier_counts.moat_for_now || 0, l: "Moat (for now)", c: TIER_COLORS.moat_for_now },
    { n: m.tier_counts.actually_hard || 0, l: "Actually Hard", c: TIER_COLORS.actually_hard },
  ];
  statsEl.innerHTML = stats
    .map(
      (s) => `
    <div class="hero-stat">
      <div class="number" style="color:${s.c}">${s.n}</div>
      <div class="label">${s.l}</div>
    </div>`,
    )
    .join("");
}

function renderDonut() {
  const container = document.getElementById("donut-chart");
  const w = 300, h = 300, radius = Math.min(w, h) / 2 - 10;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", w)
    .attr("height", h)
    .append("g")
    .attr("transform", `translate(${w / 2},${h / 2})`);

  const pie = d3.pie().value((d) => d.count).sort(null);
  const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius);
  const arcHover = d3.arc().innerRadius(radius * 0.58).outerRadius(radius + 6);

  const tc = DATA.meta.tier_counts;
  const pieData = TIER_ORDER.map((t) => ({ tier: t, count: tc[t] || 0 }));

  svg
    .selectAll("path")
    .data(pie(pieData))
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => TIER_COLORS[d.data.tier])
    .attr("stroke", "#faf9f6")
    .attr("stroke-width", 2.5)
    .style("cursor", "pointer")
    .on("mouseenter", function () {
      d3.select(this).transition().duration(120).attr("d", arcHover);
    })
    .on("mouseleave", function () {
      d3.select(this).transition().duration(120).attr("d", arc);
    });

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#1a1a1a")
    .attr("font-family", "Libre Baskerville")
    .attr("font-weight", "700")
    .attr("font-size", "2rem")
    .attr("dy", "0.1em")
    .text(`${DATA.meta.cooked_pct}%`);

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#999")
    .attr("font-size", "0.75rem")
    .attr("font-family", "Source Sans 3")
    .attr("dy", "2.2em")
    .text("replaceable");

  const legend = document.getElementById("donut-legend");
  legend.innerHTML = pieData
    .map((d) => {
      const pct = ((d.count / DATA.meta.total) * 100).toFixed(1);
      return `
      <div class="legend-item">
        <div class="legend-swatch" style="background:${TIER_COLORS[d.tier]}"></div>
        <div>
          <div class="legend-label">${TIER_LABELS[d.tier]}</div>
          <div class="legend-count">${d.count} companies (${pct}%)</div>
        </div>
      </div>`;
    })
    .join("");
}

function renderFloorMap() {
  const container = document.getElementById("floor-svg");
  const exhibitors = DATA.exhibitors.filter((e) => e.booth);

  function parseBooths(boothStr) {
    if (!boothStr) return [];
    return boothStr
      .split(",")
      .map((b) => {
        b = b.trim();
        const m = b.match(/^([A-Z]+)-(\d+)/i);
        if (m) return { hall: m[1].toUpperCase(), num: parseInt(m[2]), raw: b };
        return null;
      })
      .filter(Boolean);
  }

  const allBooths = [];
  exhibitors.forEach((ex) => {
    parseBooths(ex.booth).forEach((b) => allBooths.push({ ...b, ex }));
  });

  function boothToGrid(booth) {
    const h = booth.hall, n = booth.num;
    if (h === "S" || h === "N" || h === "MRS" || h === "MRN") {
      return { col: Math.floor(n / 100), row: n % 100 };
    }
    return { col: 0, row: n };
  }

  const hallConfigs = {
    S: { label: "Moscone South Expo", bg: "#edecea" },
    N: { label: "Moscone North Expo", bg: "#eaedea" },
    MRS: { label: "South Meeting Rooms", bg: "#edeaed" },
    MRN: { label: "North Meeting Rooms", bg: "#edecdf" },
    ESE: { label: "Early Stage Expo", bg: "#e7eded" },
    NXT: { label: "Next Stage", bg: "#edebea" },
  };

  function renderHall(filter) {
    container.innerHTML = "";
    const halls = filter === "all" ? ["S", "N", "ESE", "NXT"] : [filter];
    const tooltip = document.getElementById("tooltip");
    const cellW = 18, cellH = 14, pad = 40;
    const hallSections = [];
    let totalWidth = 0;

    halls.forEach((hallKey) => {
      const booths = allBooths.filter((b) => b.hall === hallKey);
      if (booths.length === 0) return;
      const grids = booths.map((b) => ({ ...boothToGrid(b), booth: b }));
      const uniqueCols = [...new Set(grids.map((g) => g.col))].sort((a, b) => a - b);
      const uniqueRows = [...new Set(grids.map((g) => g.row))].sort((a, b) => a - b);
      const colIdx = {}, rowIdx = {};
      uniqueCols.forEach((c, i) => (colIdx[c] = i));
      uniqueRows.forEach((r, i) => (rowIdx[r] = i));
      const sectionW = uniqueCols.length * (cellW + 2) + pad * 2;
      const sectionH = uniqueRows.length * (cellH + 2) + pad * 2 + 30;
      hallSections.push({ key: hallKey, label: hallConfigs[hallKey]?.label || hallKey, bg: hallConfigs[hallKey]?.bg || "#eee", grids, colIdx, rowIdx, w: sectionW, h: sectionH });
      totalWidth += sectionW + 16;
    });

    if (hallSections.length === 0) return;
    const maxH = Math.max(...hallSections.map((s) => s.h));
    const svgW = totalWidth + 16;
    const svgH = maxH + 16;

    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${svgW} ${svgH}`)
      .attr("width", "100%")
      .attr("preserveAspectRatio", "xMidYMid meet");

    let xOff = 8;
    hallSections.forEach((section) => {
      const g = svg.append("g").attr("transform", `translate(${xOff}, 8)`);

      g.append("rect").attr("width", section.w).attr("height", section.h)
        .attr("fill", section.bg).attr("stroke", "#d0cfcb").attr("stroke-width", 0.5);

      g.append("text").attr("x", section.w / 2).attr("y", 18)
        .attr("text-anchor", "middle").attr("fill", "#888")
        .attr("font-size", "10px").attr("font-family", "Source Sans 3")
        .attr("font-weight", "600").attr("letter-spacing", "0.05em")
        .text(section.label.toUpperCase());

      section.grids.forEach((grid) => {
        const cx = section.colIdx[grid.col] * (cellW + 2) + pad;
        const cy = section.rowIdx[grid.row] * (cellH + 2) + pad + 20;
        const b = grid.booth;

        g.append("rect").attr("x", cx).attr("y", cy)
          .attr("width", cellW).attr("height", cellH).attr("rx", 1)
          .attr("fill", TIER_COLORS[b.ex.tier] || "#ccc")
          .attr("opacity", 0.9).style("cursor", "pointer")
          .on("mouseenter", function (event) {
            d3.select(this).attr("opacity", 1).attr("stroke", "#1a1a1a").attr("stroke-width", 1.5);
            tooltip.innerHTML = `
              <div class="tt-name">${b.ex.name}</div>
              <div style="font-size:0.72rem;color:#999;margin-bottom:4px">${b.raw} · ${TIER_LABELS[b.ex.tier]}</div>
              <div class="tt-roast">${b.ex.roast || ""}</div>`;
            tooltip.classList.add("visible");
          })
          .on("mousemove", function (event) {
            tooltip.style.left = Math.min(event.clientX + 12, window.innerWidth - 360) + "px";
            tooltip.style.top = Math.min(event.clientY + 12, window.innerHeight - 200) + "px";
          })
          .on("mouseleave", function () {
            d3.select(this).attr("opacity", 0.9).attr("stroke", "none");
            tooltip.classList.remove("visible");
          });
      });
      xOff += section.w + 16;
    });
  }

  renderHall("all");

  document.querySelectorAll(".floor-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".floor-btn").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      renderHall(this.dataset.hall);
    });
  });
}

function renderMoneyChart() {
  const container = document.getElementById("money-svg");
  const raw = DATA.sponsor_tiers;

  const consolidated = {};
  for (const [sponsor, tiers] of Object.entries(raw)) {
    const key = sponsor.startsWith("International Pavilion") ? "Int'l Pavilions"
      : sponsor === "Sponsored Experience" ? "Sponsored Exp." : sponsor;
    if (!consolidated[key]) consolidated[key] = {};
    for (const [t, n] of Object.entries(tiers))
      consolidated[key][t] = (consolidated[key][t] || 0) + n;
  }

  const sponsorOrder = ["Diamond Plus", "Diamond", "Platinum Plus", "Platinum", "Gold", "Silver", "Bronze", "Exhibitor", "Early Stage Expo", "Next Stage", "Int'l Pavilions", "Sponsored Exp."];
  const existing = Object.keys(consolidated);
  const orderedSponsors = sponsorOrder.filter((s) => existing.includes(s));
  orderedSponsors.push(...existing.filter((s) => !sponsorOrder.includes(s)).sort());

  const margin = { top: 24, right: 20, bottom: 90, left: 44 };
  const w = 960, h = 420;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`).attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const cw = w - margin.left - margin.right, ch = h - margin.top - margin.bottom;

  const stackData = orderedSponsors.map((sp) => {
    const t = consolidated[sp] || {};
    return { sponsor: sp, cooked: t.cooked || 0, gpt_wrapper: t.gpt_wrapper || 0, moat_for_now: t.moat_for_now || 0, actually_hard: t.actually_hard || 0 };
  });

  const series = d3.stack().keys(TIER_ORDER)(stackData);
  const x = d3.scaleBand().domain(orderedSponsors).range([0, cw]).padding(0.3);
  const maxY = d3.max(stackData, (d) => TIER_ORDER.reduce((s, t) => s + d[t], 0));
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([ch, 0]);

  chart.selectAll(".grid-line").data(y.ticks(5)).enter()
    .append("line").attr("x1", 0).attr("x2", cw)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
    .attr("stroke", "#e0dfdb").attr("stroke-dasharray", "2,3");

  chart.append("g").attr("transform", `translate(0,${ch})`).call(d3.axisBottom(x).tickSize(0))
    .selectAll("text").attr("transform", "rotate(-40)").attr("text-anchor", "end")
    .attr("fill", "#6b6b6b").attr("font-size", "0.72rem");

  chart.append("g").call(d3.axisLeft(y).ticks(5).tickSize(0))
    .selectAll("text").attr("fill", "#6b6b6b").attr("font-size", "0.72rem");

  chart.selectAll("path.domain").attr("stroke", "#ccc");

  const tooltip = document.getElementById("tooltip");
  series.forEach((s) => {
    chart.selectAll(`.bar-${s.key}`).data(s).enter().append("rect")
      .attr("x", (d) => x(d.data.sponsor)).attr("y", (d) => y(d[1]))
      .attr("height", (d) => y(d[0]) - y(d[1])).attr("width", x.bandwidth())
      .attr("fill", TIER_COLORS[s.key]).attr("opacity", 0.9)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 1);
        tooltip.innerHTML = `<div class="tt-name">${d.data.sponsor}</div><div class="tt-roast">${TIER_LABELS[s.key]}: ${d[1] - d[0]} companies</div>`;
        tooltip.classList.add("visible");
      })
      .on("mousemove", function (event) { tooltip.style.left = event.clientX + 12 + "px"; tooltip.style.top = event.clientY + 12 + "px"; })
      .on("mouseleave", function () { d3.select(this).attr("opacity", 0.9); tooltip.classList.remove("visible"); });
  });

  chart.selectAll(".bar-total").data(stackData).enter().append("text")
    .attr("x", (d) => x(d.sponsor) + x.bandwidth() / 2)
    .attr("y", (d) => y(TIER_ORDER.reduce((s, t) => s + d[t], 0)) - 5)
    .attr("text-anchor", "middle").attr("fill", "#999")
    .attr("font-size", "0.68rem").attr("font-family", "IBM Plex Mono")
    .text((d) => TIER_ORDER.reduce((s, t) => s + d[t], 0));
}

function renderCategoryChart() {
  const container = document.getElementById("category-svg");
  const catData = DATA.category_tiers;

  const categories = Object.keys(catData).sort((a, b) => {
    return Object.values(catData[b]).reduce((s, v) => s + v, 0) - Object.values(catData[a]).reduce((s, v) => s + v, 0);
  }).slice(0, 20);

  const margin = { top: 20, right: 56, bottom: 16, left: 270 };
  const barH = 24, gap = 5;
  const h = margin.top + margin.bottom + categories.length * (barH + gap);
  const w = 960;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`).attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const cw = w - margin.left - margin.right;

  const stackData = categories.map((cat) => {
    const t = catData[cat] || {};
    return { category: cat, cooked: t.cooked || 0, gpt_wrapper: t.gpt_wrapper || 0, moat_for_now: t.moat_for_now || 0, actually_hard: t.actually_hard || 0 };
  });

  const maxX = d3.max(stackData, (d) => TIER_ORDER.reduce((s, t) => s + d[t], 0));
  const x = d3.scaleLinear().domain([0, maxX]).nice().range([0, cw]);
  const y = d3.scaleBand().domain(categories).range([0, categories.length * (barH + gap)]).padding(0.15);

  const series = d3.stack().keys(TIER_ORDER)(stackData);

  chart.append("g").call(d3.axisLeft(y).tickSize(0))
    .selectAll("text").attr("fill", "#6b6b6b").attr("font-size", "0.72rem");
  chart.selectAll("path.domain").attr("stroke", "#ccc");

  const tooltip = document.getElementById("tooltip");
  series.forEach((s) => {
    chart.selectAll(`.cat-${s.key}`).data(s).enter().append("rect")
      .attr("y", (d) => y(d.data.category)).attr("x", (d) => x(d[0]))
      .attr("width", (d) => x(d[1]) - x(d[0])).attr("height", y.bandwidth())
      .attr("fill", TIER_COLORS[s.key]).attr("opacity", 0.9).attr("rx", 1)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 1);
        const total = TIER_ORDER.reduce((s, t) => s + d.data[t], 0);
        tooltip.innerHTML = `<div class="tt-name">${d.data.category}</div><div class="tt-roast">${TIER_LABELS[s.key]}: ${d[1] - d[0]} of ${total}</div>`;
        tooltip.classList.add("visible");
      })
      .on("mousemove", function (event) { tooltip.style.left = event.clientX + 12 + "px"; tooltip.style.top = event.clientY + 12 + "px"; })
      .on("mouseleave", function () { d3.select(this).attr("opacity", 0.9); tooltip.classList.remove("visible"); });
  });

  chart.selectAll(".cat-pct").data(stackData).enter().append("text")
    .attr("y", (d) => y(d.category) + y.bandwidth() / 2 + 4)
    .attr("x", (d) => x(TIER_ORDER.reduce((s, t) => s + d[t], 0)) + 6)
    .attr("fill", (d) => {
      const pct = ((d.cooked + d.gpt_wrapper) / TIER_ORDER.reduce((s, t) => s + d[t], 0)) * 100;
      return pct > 60 ? "#d32f2f" : "#999";
    })
    .attr("font-size", "0.68rem").attr("font-family", "IBM Plex Mono")
    .text((d) => {
      const total = TIER_ORDER.reduce((s, t) => s + d[t], 0);
      return `${(((d.cooked + d.gpt_wrapper) / total) * 100) | 0}%`;
    });
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  const countEl = document.getElementById("gallery-count");
  let exhibitors = DATA.exhibitors;

  if (currentTierFilter !== "all")
    exhibitors = exhibitors.filter((e) => e.tier === currentTierFilter);
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    exhibitors = exhibitors.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.roast || "").toLowerCase().includes(q) ||
      (e.categories || []).some((c) => c.toLowerCase().includes(q)),
    );
  }

  countEl.textContent = `${exhibitors.length} of ${DATA.meta.total}`;

  grid.innerHTML = exhibitors
    .map((ex) => {
      const badge = TIER_LABELS[ex.tier] || ex.tier;
      const cats = (ex.categories || []).slice(0, 3).join(" · ");
      const cursorBtn = ex.cursor_prompt
        ? `<button class="cursor-btn" data-name="${esc(ex.name)}" data-prompt="${encodeURIComponent(ex.cursor_prompt)}">Build in Cursor</button>`
        : "";
      return `
      <div class="card">
        <div class="card-header">
          <div class="card-name">${esc(ex.name)}</div>
          <span class="card-badge ${ex.tier}">${badge}</span>
        </div>
        <div class="card-booth">${esc(ex.booth || "—")} · ${esc(ex.type || "")}</div>
        <div class="card-roast">${esc(ex.roast || "No roast available.")}</div>
        ${cats ? `<div class="card-cats">${esc(cats)}</div>` : ""}
        <div class="card-actions">${cursorBtn}</div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll(".cursor-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const prompt = decodeURIComponent(this.dataset.prompt);
      const name = this.dataset.name;
      navigator.clipboard.writeText(prompt).then(() => showToast());
      openPromptModal(name, prompt);
    });
  });
}

function openPromptModal(name, prompt) {
  document.getElementById("modal-title").textContent = `Replace ${name}`;
  document.getElementById("modal-prompt").textContent = prompt;
  document.getElementById("prompt-modal").classList.add("open");
}

function closePromptModal() {
  document.getElementById("prompt-modal").classList.remove("open");
}

function esc(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2000);
}

function setupListeners() {
  document.getElementById("search-input").addEventListener("input", function () {
    currentSearch = this.value;
    renderGallery();
  });

  document.querySelectorAll(".tier-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tier-btn").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      currentTierFilter = this.dataset.tier;
      renderGallery();
    });
  });

  document.getElementById("modal-close").addEventListener("click", closePromptModal);
  document.getElementById("prompt-modal").addEventListener("click", function (e) {
    if (e.target === this) closePromptModal();
  });
  document.getElementById("modal-copy").addEventListener("click", function () {
    const prompt = document.getElementById("modal-prompt").textContent;
    navigator.clipboard.writeText(prompt).then(() => {
      this.textContent = "Copied!";
      setTimeout(() => (this.textContent = "Copy to clipboard"), 1500);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePromptModal();
  });
}
