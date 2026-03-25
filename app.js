const TIER_COLORS = {
  cooked: "#ff4444",
  gpt_wrapper: "#ff8c00",
  moat_for_now: "#ffd700",
  actually_hard: "#00cc88",
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
    {
      n: m.tier_counts.gpt_wrapper || 0,
      l: "GPT Wrappers",
      c: TIER_COLORS.gpt_wrapper,
    },
    {
      n: m.tier_counts.moat_for_now || 0,
      l: "Moat (for now)",
      c: TIER_COLORS.moat_for_now,
    },
    {
      n: m.tier_counts.actually_hard || 0,
      l: "Actually Hard",
      c: TIER_COLORS.actually_hard,
    },
  ];
  statsEl.innerHTML = stats
    .map(
      (s) => `
    <div class="hero-stat">
      <div class="number" style="color:${s.c}">${s.n}</div>
      <div class="label">${s.l}</div>
    </div>
  `,
    )
    .join("");
}

function renderDonut() {
  const container = document.getElementById("donut-chart");
  const w = 320,
    h = 320,
    radius = Math.min(w, h) / 2 - 10;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", w)
    .attr("height", h)
    .append("g")
    .attr("transform", `translate(${w / 2},${h / 2})`);

  const pie = d3
    .pie()
    .value((d) => d.count)
    .sort(null);
  const arc = d3
    .arc()
    .innerRadius(radius * 0.55)
    .outerRadius(radius);
  const arcHover = d3
    .arc()
    .innerRadius(radius * 0.55)
    .outerRadius(radius + 8);

  const tc = DATA.meta.tier_counts;
  const pieData = TIER_ORDER.map((t) => ({ tier: t, count: tc[t] || 0 }));

  const arcs = svg
    .selectAll("path")
    .data(pie(pieData))
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => TIER_COLORS[d.data.tier])
    .attr("stroke", "#0a0a0a")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseenter", function (e, d) {
      d3.select(this).transition().duration(150).attr("d", arcHover);
    })
    .on("mouseleave", function (e, d) {
      d3.select(this).transition().duration(150).attr("d", arc);
    });

  const centerText = svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#e8e8e8")
    .attr("font-family", "IBM Plex Mono")
    .attr("font-weight", "700")
    .attr("font-size", "2.2rem")
    .attr("dy", "0.1em")
    .text(`${DATA.meta.cooked_pct}%`);

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#888")
    .attr("font-size", "0.8rem")
    .attr("dy", "2em")
    .text("replaceable");

  const legend = document.getElementById("donut-legend");
  legend.innerHTML = pieData
    .map((d) => {
      const pct = ((d.count / DATA.meta.total) * 100).toFixed(1);
      return `
      <div class="legend-item" data-tier="${d.tier}">
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
    return boothStr.split(",").map((b) => {
      b = b.trim();
      const m = b.match(/^([A-Z]+)-(\d+)/i);
      if (m) return { hall: m[1].toUpperCase(), num: parseInt(m[2]), raw: b };
      return null;
    }).filter(Boolean);
  }

  const allBooths = [];
  exhibitors.forEach((ex) => {
    const booths = parseBooths(ex.booth);
    booths.forEach((b) => {
      allBooths.push({ ...b, ex });
    });
  });

  const hallOrder = { S: 0, N: 1, MRS: 2, MRN: 3, MRE: 4, ESE: 5, NXT: 6 };
  const mainHalls = ["S", "N", "ESE", "NXT"];

  function renderHall(filter) {
    container.innerHTML = "";
    let filtered =
      filter === "all"
        ? allBooths.filter((b) => mainHalls.includes(b.hall))
        : allBooths.filter((b) => b.hall === filter);

    if (filtered.length === 0) return;

    filtered.sort(
      (a, b) => hallOrder[a.hall] - hallOrder[b.hall] || a.num - b.num,
    );

    const cols = Math.ceil(Math.sqrt(filtered.length * 1.5));
    const cellW = 22,
      cellH = 22,
      gap = 3;
    const rows = Math.ceil(filtered.length / cols);
    const svgW = cols * (cellW + gap) + 40;
    const svgH = rows * (cellH + gap) + 40;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${svgW} ${svgH}`)
      .attr("width", "100%")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("max-height", "500px");

    const tooltip = document.getElementById("tooltip");

    svg
      .selectAll("rect")
      .data(filtered)
      .enter()
      .append("rect")
      .attr("x", (d, i) => (i % cols) * (cellW + gap) + 20)
      .attr("y", (d, i) => Math.floor(i / cols) * (cellH + gap) + 20)
      .attr("width", cellW)
      .attr("height", cellH)
      .attr("rx", 3)
      .attr("fill", (d) => TIER_COLORS[d.ex.tier] || "#333")
      .attr("opacity", 0.85)
      .style("cursor", "pointer")
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1.5);
        tooltip.innerHTML = `
          <div class="tt-name" style="color:${TIER_COLORS[d.ex.tier]}">${d.ex.name}</div>
          <div style="font-size:0.75rem;color:#666;margin-bottom:6px">${d.raw} · ${TIER_LABELS[d.ex.tier]}</div>
          <div class="tt-roast">${d.ex.roast || ""}</div>`;
        tooltip.classList.add("visible");
      })
      .on("mousemove", function (event) {
        const tt = document.getElementById("tooltip");
        const x = Math.min(event.clientX + 12, window.innerWidth - 370);
        const y = Math.min(event.clientY + 12, window.innerHeight - 200);
        tt.style.left = x + "px";
        tt.style.top = y + "px";
      })
      .on("mouseleave", function () {
        d3.select(this).attr("opacity", 0.85).attr("stroke", "none");
        tooltip.classList.remove("visible");
      });
  }

  renderHall("all");

  document.querySelectorAll(".floor-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".floor-btn")
        .forEach((b) => b.classList.remove("active"));
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
    const key = sponsor.startsWith("International Pavilion")
      ? "Int'l Pavilions"
      : sponsor === "Sponsored Experience"
        ? "Sponsored Exp."
        : sponsor;
    if (!consolidated[key]) consolidated[key] = {};
    for (const [t, n] of Object.entries(tiers)) {
      consolidated[key][t] = (consolidated[key][t] || 0) + n;
    }
  }
  const sponsorData = consolidated;

  const sponsorOrder = [
    "Diamond Plus",
    "Diamond",
    "Platinum Plus",
    "Platinum",
    "Gold",
    "Silver",
    "Bronze",
    "Exhibitor",
    "Early Stage Expo",
    "Next Stage",
    "Int'l Pavilions",
    "Sponsored Exp.",
  ];

  const existing = Object.keys(sponsorData);
  const orderedSponsors = sponsorOrder.filter((s) => existing.includes(s));
  orderedSponsors.push(
    ...existing.filter((s) => !sponsorOrder.includes(s)).sort(),
  );

  const margin = { top: 30, right: 30, bottom: 100, left: 50 };
  const w = 1000;
  const h = 450;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const cw = w - margin.left - margin.right;
  const ch = h - margin.top - margin.bottom;

  const stackData = orderedSponsors.map((sp) => {
    const tiers = sponsorData[sp] || {};
    return {
      sponsor: sp,
      cooked: tiers.cooked || 0,
      gpt_wrapper: tiers.gpt_wrapper || 0,
      moat_for_now: tiers.moat_for_now || 0,
      actually_hard: tiers.actually_hard || 0,
    };
  });

  const stack = d3.stack().keys(TIER_ORDER);
  const series = stack(stackData);

  const x = d3
    .scaleBand()
    .domain(orderedSponsors)
    .range([0, cw])
    .padding(0.25);

  const maxY = d3.max(stackData, (d) =>
    TIER_ORDER.reduce((s, t) => s + d[t], 0),
  );
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([ch, 0]);

  chart
    .append("g")
    .attr("transform", `translate(0,${ch})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .attr("text-anchor", "end")
    .attr("fill", "#888")
    .attr("font-size", "0.75rem");

  chart
    .append("g")
    .call(d3.axisLeft(y).ticks(6))
    .selectAll("text")
    .attr("fill", "#888");

  chart.selectAll("line").attr("stroke", "#333");
  chart.selectAll("path.domain").attr("stroke", "#333");

  const tooltip = document.getElementById("tooltip");

  series.forEach((s) => {
    chart
      .selectAll(`.bar-${s.key}`)
      .data(s)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.data.sponsor))
      .attr("y", (d) => y(d[1]))
      .attr("height", (d) => y(d[0]) - y(d[1]))
      .attr("width", x.bandwidth())
      .attr("fill", TIER_COLORS[s.key])
      .attr("opacity", 0.85)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 1);
        const count = d[1] - d[0];
        tooltip.innerHTML = `
          <div class="tt-name">${d.data.sponsor}</div>
          <div class="tt-roast">${TIER_LABELS[s.key]}: ${count} companies</div>`;
        tooltip.classList.add("visible");
      })
      .on("mousemove", function (event) {
        tooltip.style.left = event.clientX + 12 + "px";
        tooltip.style.top = event.clientY + 12 + "px";
      })
      .on("mouseleave", function () {
        d3.select(this).attr("opacity", 0.85);
        tooltip.classList.remove("visible");
      });
  });

  chart
    .selectAll(".bar-total")
    .data(stackData)
    .enter()
    .append("text")
    .attr("x", (d) => x(d.sponsor) + x.bandwidth() / 2)
    .attr("y", (d) => y(TIER_ORDER.reduce((s, t) => s + d[t], 0)) - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#888")
    .attr("font-size", "0.7rem")
    .attr("font-family", "IBM Plex Mono")
    .text((d) => TIER_ORDER.reduce((s, t) => s + d[t], 0));
}

function renderCategoryChart() {
  const container = document.getElementById("category-svg");
  const catData = DATA.category_tiers;

  const categories = Object.keys(catData).sort((a, b) => {
    const totalA = Object.values(catData[a]).reduce((s, v) => s + v, 0);
    const totalB = Object.values(catData[b]).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  }).slice(0, 20);

  const margin = { top: 30, right: 60, bottom: 20, left: 280 };
  const barH = 26;
  const gap = 4;
  const h = margin.top + margin.bottom + categories.length * (barH + gap);
  const w = 1000;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const cw = w - margin.left - margin.right;

  const stackData = categories.map((cat) => {
    const tiers = catData[cat] || {};
    return {
      category: cat,
      cooked: tiers.cooked || 0,
      gpt_wrapper: tiers.gpt_wrapper || 0,
      moat_for_now: tiers.moat_for_now || 0,
      actually_hard: tiers.actually_hard || 0,
    };
  });

  const maxX = d3.max(stackData, (d) =>
    TIER_ORDER.reduce((s, t) => s + d[t], 0),
  );
  const x = d3.scaleLinear().domain([0, maxX]).nice().range([0, cw]);
  const y = d3
    .scaleBand()
    .domain(categories)
    .range([0, categories.length * (barH + gap)])
    .padding(0.12);

  const stack = d3.stack().keys(TIER_ORDER);
  const series = stack(stackData);

  chart
    .append("g")
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#aaa")
    .attr("font-size", "0.75rem");

  chart.selectAll("line").attr("stroke", "#333");
  chart.selectAll("path.domain").attr("stroke", "#333");

  const tooltip = document.getElementById("tooltip");

  series.forEach((s) => {
    chart
      .selectAll(`.cat-${s.key}`)
      .data(s)
      .enter()
      .append("rect")
      .attr("y", (d) => y(d.data.category))
      .attr("x", (d) => x(d[0]))
      .attr("width", (d) => x(d[1]) - x(d[0]))
      .attr("height", y.bandwidth())
      .attr("fill", TIER_COLORS[s.key])
      .attr("opacity", 0.85)
      .attr("rx", 2)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 1);
        const count = d[1] - d[0];
        const total = TIER_ORDER.reduce((s, t) => s + d.data[t], 0);
        tooltip.innerHTML = `
          <div class="tt-name">${d.data.category}</div>
          <div class="tt-roast">${TIER_LABELS[s.key]}: ${count} of ${total}</div>`;
        tooltip.classList.add("visible");
      })
      .on("mousemove", function (event) {
        tooltip.style.left = event.clientX + 12 + "px";
        tooltip.style.top = event.clientY + 12 + "px";
      })
      .on("mouseleave", function () {
        d3.select(this).attr("opacity", 0.85);
        tooltip.classList.remove("visible");
      });
  });

  chart
    .selectAll(".cat-pct")
    .data(stackData)
    .enter()
    .append("text")
    .attr("y", (d) => y(d.category) + y.bandwidth() / 2 + 4)
    .attr("x", (d) => {
      const total = TIER_ORDER.reduce((s, t) => s + d[t], 0);
      return x(total) + 8;
    })
    .attr("fill", (d) => {
      const cookedPct =
        (((d.cooked + d.gpt_wrapper) /
          TIER_ORDER.reduce((s, t) => s + d[t], 0)) *
          100) |
        0;
      return cookedPct > 60 ? "#ff4444" : "#888";
    })
    .attr("font-size", "0.7rem")
    .attr("font-family", "IBM Plex Mono")
    .text((d) => {
      const total = TIER_ORDER.reduce((s, t) => s + d[t], 0);
      const cookedPct = (((d.cooked + d.gpt_wrapper) / total) * 100) | 0;
      return `${cookedPct}%`;
    });
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  const countEl = document.getElementById("gallery-count");

  let exhibitors = DATA.exhibitors;

  if (currentTierFilter !== "all") {
    exhibitors = exhibitors.filter((e) => e.tier === currentTierFilter);
  }
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    exhibitors = exhibitors.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.roast || "").toLowerCase().includes(q) ||
        (e.categories || []).some((c) => c.toLowerCase().includes(q)),
    );
  }

  countEl.textContent = `Showing ${exhibitors.length} of ${DATA.meta.total} companies`;

  const html = exhibitors
    .map((ex) => {
      const badge = TIER_LABELS[ex.tier] || ex.tier;
      const cats = (ex.categories || []).slice(0, 3).join(" · ");
      const cursorBtn = ex.cursor_prompt
        ? `<button class="cursor-btn" data-prompt="${encodeURIComponent(ex.cursor_prompt)}">
          ⌨️ Build in Cursor
        </button>`
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

  grid.innerHTML = html;

  grid.querySelectorAll(".cursor-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const prompt = decodeURIComponent(this.dataset.prompt);
      navigator.clipboard.writeText(prompt).then(() => showToast());
    });
  });
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
      document
        .querySelectorAll(".tier-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      currentTierFilter = this.dataset.tier;
      renderGallery();
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.1 },
  );
  document.querySelectorAll(".section").forEach((s) => observer.observe(s));
}
