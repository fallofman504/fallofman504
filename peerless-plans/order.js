// Order flow prototype. Everything stays in the browser: no upload, no payment.
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  // Published prices. Keep in sync with the price list on index.html.
  const BANDS = [
    { max: 3000, spec: 350, prospect: 490 },
    { max: 7500, spec: 600, prospect: 840 },
    { max: 15000, spec: 950, prospect: 1330 },
    { max: 30000, spec: 1600, prospect: 2240 },
  ];
  const OVER = { spec: 0.05, prospect: 0.07 };
  const EXHIBIT = { single: 175, set: 450 };
  const RUSH = 0.5;
  const NAMES = { spec: "Spec test fit", prospect: "Prospect test fit", exhibit: "Lease exhibit" };

  let step = 1;
  let files = [];

  function service() {
    const r = $('input[name="service"]:checked');
    return r ? r.value : null;
  }

  function quote() {
    const svc = service();
    const lines = [];
    let base;
    if (svc === "exhibit") {
      const t = $("#exType").value;
      base = EXHIBIT[t];
      lines.push([t === "set" ? "Lease exhibit set" : "Lease exhibit", base]);
    } else {
      const sf = Number($("#sf").value);
      const band = BANDS.find((b) => sf <= b.max);
      base = band ? band[svc] : sf * OVER[svc];
      const label = band ? `up to ${band.max.toLocaleString("en-US")} SF` : `${sf.toLocaleString("en-US")} SF at $${OVER[svc].toFixed(2)} / SF`;
      lines.push([`${NAMES[svc]}, ${label}`, base]);
    }
    const rush = $("#speed").value === "rush";
    if (rush) lines.push(["Same-day rush (+50%)", base * RUSH]);
    const total = lines.reduce((a, l) => a + l[1], 0);
    const eta = rush ? "Same day" : svc === "exhibit" ? "24 hours" : svc === "spec" ? "48 hours" : "24 to 48 hours";
    return { lines, total, eta };
  }

  function show(n) {
    step = n;
    $$(".panel").forEach((p) => (p.hidden = Number(p.dataset.step) !== n));
    $$("#progress li").forEach((li, i) => {
      li.className = i + 1 < n ? "done" : i + 1 === n ? "now" : "";
    });
    $$("[data-err]").forEach((e) => (e.textContent = ""));
    const svc = service();
    $$("[data-for]").forEach((el) => (el.hidden = !el.dataset.for.split(" ").includes(svc)));
    if (n === 4) renderScope();
    if (n === 5) renderQuote();
    window.scrollTo({ top: 0 });
    const h = $(`.panel[data-step="${n}"] h2`);
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  function validate(n) {
    const svc = service();
    if (n === 1 && !svc) return "Choose the drawing you need.";
    if (n === 2) {
      if (!$("#bldg").value.trim()) return "Add the building name or address.";
      if (!$("#suite").value.trim()) return "Add the floor and suite.";
      if (svc !== "exhibit" && !(Number($("#sf").value) > 0)) return "Add the suite size in square feet. An estimate is fine; we confirm it from your files.";
      if (svc === "prospect" && $("#program").value.trim().length < 10) return "Describe the prospect's program: headcount and the rooms they need.";
      if (svc === "exhibit" && !$("#exTitle").value.trim()) return "Add the exhibit title exactly as it should print.";
    }
    if (n === 3 && !files.length && $("#dims").value.trim().length < 20) return "Upload at least one file, or type the dimensions and a description of the space.";
    if (n === 4) {
      if (!$("#email").checkValidity() || !$("#email").value) return "Add a valid email so we can send your preview.";
      if (!$("#confirm").checked) return "Tick the box to confirm the scope is right.";
    }
    return "";
  }

  function renderScope() {
    const svc = service();
    const rows = [["Drawing", svc === "exhibit" && $("#exType").value === "set" ? "Lease exhibit set" : NAMES[svc]], ["Building", $("#bldg").value.trim()], ["Floor and suite", $("#suite").value.trim()]];
    if (svc !== "exhibit") rows.push(["Suite size", Number($("#sf").value).toLocaleString("en-US") + " SF (as you stated)"]);
    if (svc === "spec") rows.push(["Tenant type", $("#tenant").value]);
    if (svc === "prospect") rows.push(["Program", $("#program").value.trim()], ["Options", "Two layouts, one revision round"]);
    if (svc === "exhibit") rows.push(["Exhibit title", $("#exTitle").value.trim()]);
    rows.push(["Turnaround", quote().eta + " after payment"]);
    rows.push(["Reference material", (files.length ? files.length + " file" + (files.length > 1 ? "s" : "") : "No files") + ($("#dims").value.trim() ? ", plus typed dimensions" : "")]);
    if ($("#notes").value.trim()) rows.push(["Notes", $("#notes").value.trim()]);
    const ul = $("#scope");
    ul.textContent = "";
    rows.forEach(([k, v]) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = k;
      const b = document.createElement("span"); b.textContent = v;
      li.append(a, b); ul.append(li);
    });
    const flags = [];
    const hasCad = files.some((f) => /\.(dwg|dxf)$/i.test(f.name));
    if (!hasCad) flags.push("No CAD file supplied. We will draft from your other material, and the sheet will say the scale is not verified unless two known dimensions check out.");
    if (svc !== "exhibit" && Number($("#sf").value) > 30000) flags.push("Suites over 30,000 SF are priced per square foot.");
    $("#flags").innerHTML = "";
    flags.forEach((t) => { const d = document.createElement("div"); d.className = "flag"; d.textContent = t; $("#flags").append(d); });
  }

  function renderQuote() {
    const svc = service();
    const q = quote();
    const ul = $("#lines");
    ul.textContent = "";
    q.lines.forEach(([k, v]) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = k;
      const b = document.createElement("span"); b.className = "mono"; b.textContent = money(v);
      li.append(a, b); ul.append(li);
    });
    $("#total").textContent = money(q.total);
    $("#eta").textContent = "Delivered " + q.eta.toLowerCase() + " after payment, once a person has checked and signed the sheet.";
    $("#fmt").innerHTML = (svc === "exhibit" ? ["PDF", "QA sheet"] : ["PDF", "DWG", "QA sheet"]).map((f) => `<span>${f}</span>`).join("");
    $("#conceptText").textContent = svc === "exhibit"
      ? "I understand the exhibit is drawn as I instruct, from the drawings I provide, and is not field verified."
      : "I understand this is a conceptual space plan for discussion only, not for construction or permit.";
    $("#concept").checked = false;
    $("#previewPlan").innerHTML = peerlessPlanSVG({ watermark: true, viewBox: "30 30 330 230", label: "Watermarked sample preview" });
  }

  function addFiles(list) {
    Array.from(list).forEach((f) => { if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f); });
    const ul = $("#fileList");
    ul.textContent = "";
    files.forEach((f, i) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = f.name;
      const b = document.createElement("button"); b.className = "linkbtn"; b.type = "button"; b.textContent = "Remove";
      b.onclick = () => { files.splice(i, 1); addFiles([]); };
      li.append(a, b); ul.append(li);
    });
  }

  function reset() {
    $$("input[type=text], input[type=email], input[type=number], textarea").forEach((i) => (i.value = ""));
    $$("input[type=radio], input[type=checkbox]").forEach((i) => (i.checked = false));
    $$("select").forEach((s) => (s.selectedIndex = 0));
    files = []; addFiles([]);
    show(1);
  }

  // wiring
  $$("[data-next]").forEach((b) => b.addEventListener("click", () => {
    const msg = validate(step);
    if (msg) { $(`[data-err="${step}"]`).textContent = msg; return; }
    show(step + 1);
  }));
  $$("[data-back]").forEach((b) => b.addEventListener("click", () => show(step - 1)));
  $("#adjust").addEventListener("click", () => show(2));
  $("#restart").addEventListener("click", reset);
  $("#restart2").addEventListener("click", reset);
  $("#buy").addEventListener("click", () => {
    if (!$("#concept").checked) { $('[data-err="5"]').textContent = "Tick the box above to continue."; return; }
    show(6);
  });

  const drop = $("#drop"), input = $("#fileInput");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  show(1);
})();
