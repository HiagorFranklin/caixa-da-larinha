/* Caixa da Larinha — app de controle de contas e gastos.
   Dados salvos no próprio aparelho (localStorage), com backup em arquivo JSON. */
(function () {
  "use strict";

  const STORAGE_KEY = "caixa-da-larinha:v1";
  const CATS = ["Moradia", "Contas da casa", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Assinaturas", "Outros"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1);
  const isoOf = (d) => ymOf(d) + "-" + pad(d.getDate());
  const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
  const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const money = (v) => brl.format(Number(v) || 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmtInput = (v) => (v ? v.toFixed(2).replace(".", ",") : "");
  function parseValor(s) {
    s = String(s || "").trim().replace(/[R$\s]/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  // ---------- armazenamento ----------
  const empty = () => ({ versao: 1, contas: {}, pagamentos: {}, gastos: {}, config: { renda: 0, meta: 0, ultimoBackup: null } });
  let D = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty();
      return normalize(JSON.parse(raw));
    } catch (e) { return empty(); }
  }
  function normalize(x) {
    const d = empty();
    if (x && typeof x === "object") {
      for (const k of ["contas", "pagamentos", "gastos"]) if (x[k] && typeof x[k] === "object") d[k] = x[k];
      if (x.config && typeof x.config === "object") d.config = { ...d.config, ...x.config };
    }
    return d;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(D)); }
    catch (e) { toast("Não foi possível salvar. O armazenamento do aparelho pode estar cheio."); }
    render();
  }
  // pede ao navegador para não apagar os dados quando faltar espaço
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- estado de tela ----------
  const UI = { ym: ymOf(new Date()), editId: null, pendingDel: null, importData: null };

  // ---------- regras ----------
  function contasDoMes(ym) {
    return Object.entries(D.contas).map(([id, c]) => ({ id, ...c }))
      .filter((c) => (c.recorrente !== false || c.mes === ym) && (!c.inicio || c.inicio <= ym))
      .sort((a, b) => (a.dia || 0) - (b.dia || 0) || String(a.nome).localeCompare(b.nome, "pt-BR"));
  }
  function status(c, ym) {
    const pg = D.pagamentos[c.id + "_" + ym];
    if (pg) { const [, m, d] = String(pg.pagoEm || "").split("-"); return { k: "paga", label: d ? `Paga ${Number(d)}/${Number(m)}` : "Paga", pg }; }
    const dia = Math.min(c.dia || 1, lastDay(ym)); const [y, m] = ym.split("-").map(Number);
    const diff = Math.round((new Date(y, m - 1, dia) - today0()) / 86400000);
    if (diff < 0) return { k: "atrasada", label: `Atrasada há ${-diff} dia${-diff > 1 ? "s" : ""}` };
    if (diff === 0) return { k: "hoje", label: "Vence hoje" };
    if (diff <= 3) return { k: "breve", label: `Vence em ${diff} dia${diff > 1 ? "s" : ""}` };
    return { k: "aberta", label: "Em aberto" };
  }
  const gastosDoMes = (ym) => Object.entries(D.gastos).map(([id, g]) => ({ id, ...g }))
    .filter((g) => String(g.data || "").startsWith(ym))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  // ---------- render ----------
  function render() {
    const ym = UI.ym; const [y, m] = ym.split("-").map(Number);
    $("monthLabel").textContent = MESES[m - 1].replace(/^./, (c) => c.toUpperCase()) + " de " + y;

    const contas = contasDoMes(ym); const gastos = gastosDoMes(ym);
    const totContas = contas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const pagas = contas.filter((c) => D.pagamentos[c.id + "_" + ym]);
    const totPago = pagas.reduce((s, c) => s + (Number(D.pagamentos[c.id + "_" + ym].valor ?? c.valor) || 0), 0);
    const totGastos = gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0);
    const renda = Number(D.config.renda) || 0; const saldo = renda - totContas - totGastos;

    $("ledger").innerHTML = `
      <div><span class="label">Renda do mês</span><span class="v num">${renda ? money(renda) : "—"}</span>
        <button class="linkbtn" id="editRenda" type="button">${renda ? "Alterar renda" : "Definir renda"}</button></div>
      <div><span class="label">Contas fixas</span><span class="v"><span class="op">−</span>${money(totContas)}</span>
        <span class="sub">${money(totPago)} pago · ${money(totContas - totPago)} falta</span></div>
      <div><span class="label">Gastos do dia a dia</span><span class="v"><span class="op">−</span>${money(totGastos)}</span>
        <span class="sub">${gastos.length} lançamento${gastos.length === 1 ? "" : "s"}</span></div>
      <div class="saldo ${saldo < 0 && renda ? "neg" : ""}"><span class="label">Sobra prevista</span><span class="v num">${renda ? money(saldo) : "—"}</span>
        <span class="sub">${renda ? (saldo < 0 ? "Gastos passaram da renda" : "Renda − contas − gastos") : "Defina a renda para calcular"}</span></div>`;

    const atras = contas.filter((c) => status(c, ym).k === "atrasada");
    const breve = contas.filter((c) => ["hoje", "breve"].includes(status(c, ym).k));
    const pct = contas.length ? Math.round((pagas.length / contas.length) * 100) : 0;
    $("progress").innerHTML = contas.length ? `
      <div class="row"><span><b style="color:var(--ink)">${pagas.length} de ${contas.length}</b> contas pagas</span><span class="num">${pct}%</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span class="ok" style="width:${pct}%"></span></div>
      ${atras.length || breve.length ? `<div class="alerts">${atras.length ? `<span class="chip c-atrasada">${atras.length} atrasada${atras.length > 1 ? "s" : ""} · ${money(atras.reduce((s, c) => s + (+c.valor || 0), 0))}</span>` : ""}${breve.length ? `<span class="chip c-breve">${breve.length} vence${breve.length > 1 ? "m" : ""} nos próximos 3 dias</span>` : ""}</div>` : ""}` : "";

    $("bills").innerHTML = contas.length ? contas.map((c) => {
      const st = status(c, ym); const dia = Math.min(c.dia || 1, lastDay(ym)); const del = UI.pendingDel === c.id;
      return `<li class="bill is-${st.k}">
        <input type="checkbox" class="check" data-pay="${esc(c.id)}" ${st.k === "paga" ? "checked" : ""} aria-label="Marcar ${esc(c.nome)} como paga">
        <div class="due"><b>${dia}</b><small>${SEM[new Date(y, m - 1, dia).getDay()]}</small></div>
        <div class="info"><span class="name">${esc(c.nome)}</span>
          <span class="meta"><span class="chip c-${st.k}">${st.label}</span><span>${esc(c.categoria || "Outros")}</span>${c.recorrente === false ? `<span class="tag">só este mês</span>` : ""}</span></div>
        <div class="right"><span class="val">${money(st.pg?.valor ?? c.valor)}</span>
          <span class="acts"><button class="mini" data-edit="${esc(c.id)}" type="button">Editar</button><button class="mini ${del ? "danger" : ""}" data-delc="${esc(c.id)}" type="button">${del ? "Confirmar" : "Excluir"}</button></span></div>
      </li>`;
    }).join("") : `<li class="empty"><b>Nenhuma conta neste mês</b>Toque em “+ Nova conta” e cadastre aluguel, luz, água, internet, cartão… Cada conta mensal aparece aqui todo mês para você ir marcando.</li>`;

    $("gTotal").textContent = money(totGastos);
    const meta = Number(D.config.meta) || 0;
    if (meta) {
      const p = Math.min(100, Math.round((totGastos / meta) * 100)); const over = totGastos > meta;
      $("metaBox").innerHTML = `<div class="metabar ${over ? "over" : ""}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px"><span>Limite do dia a dia: <b class="num">${money(meta)}</b></span><span class="num" style="color:${over ? "var(--crit)" : "var(--muted)"}">${over ? "passou " + money(totGastos - meta) : "resta " + money(meta - totGastos)}</span></div><div class="bar"><span class="use" style="width:${p}%"></span></div></div>`;
    } else $("metaBox").innerHTML = "";

    const porCat = {}; gastos.forEach((g) => { const k = g.categoria || "Outros"; porCat[k] = (porCat[k] || 0) + (+g.valor || 0); });
    const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]); const max = cats[0]?.[1] || 1;
    $("cats").innerHTML = cats.length ? `<span class="label">Por categoria</span>` + cats.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${Math.max(3, (v / max) * 100)}%"></div></div><span class="amt">${money(v)}</span></div>`).join("") : "";

    if (!gastos.length) {
      $("days").innerHTML = `<div class="empty"><b>Nenhum gasto lançado em ${MESES[m - 1]}</b>Lance o que gastar no dia (mercado, gasolina, lanche) e veja para onde o dinheiro está indo.</div>`;
    } else {
      const byDay = {}; gastos.forEach((g) => (byDay[g.data] = byDay[g.data] || []).push(g));
      $("days").innerHTML = Object.keys(byDay).sort().reverse().map((dt) => {
        const [yy, mm, dd] = dt.split("-").map(Number); const tot = byDay[dt].reduce((s, g) => s + (+g.valor || 0), 0);
        return `<div class="day"><h3><span>${dd} ${MESES[mm - 1].slice(0, 3)} · ${SEM[new Date(yy, mm - 1, dd).getDay()]}</span><span class="num">${money(tot)}</span></h3><ul>${byDay[dt].map((g) => {
          const del = UI.pendingDel === g.id;
          return `<li class="exp"><div class="d"><span>${esc(g.descricao)}</span><span>${esc(g.categoria || "Outros")} · ${esc(g.forma || "")}</span></div><span class="val">${money(g.valor)}</span><button class="mini ${del ? "danger" : ""}" data-delg="${esc(g.id)}" type="button" aria-label="Excluir ${esc(g.descricao)}">${del ? "Confirmar" : "×"}</button></li>`;
        }).join("")}</ul></div>`;
      }).join("");
    }

    const lb = D.config.ultimoBackup;
    $("lastBackup").textContent = lb ? `Último backup: ${lb.split("-").reverse().join("/")}.` : "Você ainda não fez nenhum backup.";
  }

  // ---------- interação ----------
  let toastT;
  function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2400); }
  let delT;
  function armDelete(id) { UI.pendingDel = id; render(); clearTimeout(delT); delT = setTimeout(() => { UI.pendingDel = null; render(); }, 4000); }

  ["cCat", "gCat"].forEach((id) => ($(id).innerHTML = CATS.map((c) => `<option>${c}</option>`).join("")));
  $("cCat").value = "Contas da casa"; $("gCat").value = "Alimentação";

  const defaultGastoDate = () => { const t = new Date(); return ymOf(t) === UI.ym ? isoOf(t) : UI.ym + "-01"; };
  $("gData").value = defaultGastoDate();
  function goMonth(ym) { UI.ym = ym; UI.pendingDel = null; $("gData").value = defaultGastoDate(); render(); }
  $("prevM").onclick = () => goMonth(addMonths(UI.ym, -1));
  $("nextM").onclick = () => goMonth(addMonths(UI.ym, 1));
  $("todayM").onclick = () => goMonth(ymOf(new Date()));

  function openContaForm(id) {
    UI.editId = id || null; $("contaForm").hidden = false; $("cErr").textContent = "";
    const c = id ? D.contas[id] : null;
    $("cNome").value = c?.nome || ""; $("cValor").value = c ? fmtInput(+c.valor) : ""; $("cDia").value = c?.dia || "";
    $("cCat").value = c?.categoria || "Contas da casa"; $("cTipo").value = c && c.recorrente === false ? "unica" : "mensal";
    $("cSubmit").textContent = id ? "Salvar alterações" : "Adicionar conta";
    $("contaForm").scrollIntoView({ block: "nearest" }); $("cNome").focus();
  }
  $("newConta").onclick = () => openContaForm(null);
  $("cCancel").onclick = () => { $("contaForm").hidden = true; UI.editId = null; };
  $("contaForm").onsubmit = (e) => {
    e.preventDefault();
    const nome = $("cNome").value.trim(), valor = parseValor($("cValor").value), dia = parseInt($("cDia").value, 10);
    if (!nome) return ($("cErr").textContent = "Dê um nome para a conta.");
    if (!(valor >= 0)) return ($("cErr").textContent = "Valor inválido. Use o formato 150,00.");
    if (!(dia >= 1 && dia <= 31)) return ($("cErr").textContent = "O dia de vencimento vai de 1 a 31.");
    const prev = UI.editId ? D.contas[UI.editId] : null; const unica = $("cTipo").value === "unica";
    const data = { nome, valor, dia, categoria: $("cCat").value, recorrente: !unica };
    if (unica) data.mes = prev?.mes && prev.recorrente === false ? prev.mes : UI.ym;
    data.inicio = prev?.inicio || (unica ? data.mes : UI.ym);
    const was = UI.editId; D.contas[UI.editId || uid()] = data;
    $("contaForm").hidden = true; UI.editId = null; save(); toast(was ? "Conta atualizada" : "Conta adicionada");
  };

  $("gastoForm").onsubmit = (e) => {
    e.preventDefault();
    const descricao = $("gDesc").value.trim(), valor = parseValor($("gValor").value), data = $("gData").value;
    if (!descricao) return ($("gErr").textContent = "Descreva o gasto.");
    if (!(valor > 0)) return ($("gErr").textContent = "Valor inválido. Use o formato 25,90.");
    if (!data) return ($("gErr").textContent = "Escolha a data.");
    $("gErr").textContent = "";
    D.gastos[uid()] = { descricao, valor, data, categoria: $("gCat").value, forma: $("gForma").value };
    $("gDesc").value = ""; $("gValor").value = "";
    save(); toast(data.startsWith(UI.ym) ? "Gasto lançado" : "Lançado em " + MESES[+data.slice(5, 7) - 1]);
  };

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button,input"); if (!t) return;
    if (t.id === "editRenda") {
      const f = $("rendaForm"); f.hidden = !f.hidden;
      $("rRenda").value = fmtInput(+D.config.renda || 0); $("rMeta").value = fmtInput(+D.config.meta || 0);
      if (!f.hidden) $("rRenda").focus(); return;
    }
    if (t.dataset.pay) {
      const id = t.dataset.pay, pid = id + "_" + UI.ym;
      if (D.pagamentos[pid]) { delete D.pagamentos[pid]; save(); toast("Marcada como não paga"); }
      else { D.pagamentos[pid] = { contaId: id, mes: UI.ym, pagoEm: isoOf(new Date()), valor: +D.contas[id].valor || 0 }; save(); toast("Conta paga ✓"); }
      return;
    }
    if (t.dataset.edit) return openContaForm(t.dataset.edit);
    if (t.dataset.delc) {
      const id = t.dataset.delc; if (UI.pendingDel !== id) return armDelete(id);
      UI.pendingDel = null; delete D.contas[id];
      for (const k of Object.keys(D.pagamentos)) if (D.pagamentos[k].contaId === id) delete D.pagamentos[k];
      save(); toast("Conta excluída"); return;
    }
    if (t.dataset.delg) {
      const id = t.dataset.delg; if (UI.pendingDel !== id) return armDelete(id);
      UI.pendingDel = null; delete D.gastos[id]; save(); toast("Gasto excluído"); return;
    }
  });
  $("rCancel").onclick = () => ($("rendaForm").hidden = true);
  $("rendaForm").onsubmit = (e) => {
    e.preventDefault();
    D.config.renda = parseValor($("rRenda").value) || 0; D.config.meta = parseValor($("rMeta").value) || 0;
    $("rendaForm").hidden = true; save(); toast("Renda salva");
  };

  // ---------- backup ----------
  $("exportBtn").onclick = async () => {
    const anterior = D.config.ultimoBackup;
    D.config.ultimoBackup = isoOf(new Date());
    const nome = `caixa-da-larinha-backup-${D.config.ultimoBackup}.json`;
    const blob = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" });
    // no celular, tenta abrir o menu de compartilhar (Drive, WhatsApp, e-mail)
    try {
      const file = new File([blob], nome, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Backup Caixa da Larinha" });
        save(); toast("Backup exportado"); return;
      }
    } catch (err) { if (err && err.name === "AbortError") { D.config.ultimoBackup = anterior; return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    save(); toast("Backup baixado");
  };
  $("importFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const x = JSON.parse(await f.text());
      if (!x || typeof x !== "object" || !("contas" in x) || !("gastos" in x)) throw new Error();
      UI.importData = normalize(x);
      const nC = Object.keys(UI.importData.contas).length, nG = Object.keys(UI.importData.gastos).length;
      const box = $("importConfirm"); box.hidden = false;
      box.innerHTML = `<span>O backup tem <b>${nC} contas</b> e <b>${nG} gastos</b>. Importar vai <b>substituir</b> tudo o que está neste aparelho.</span><span class="backup-acts"><button class="primary" id="doImport" type="button">Substituir dados</button><button class="ghost" id="cancelImport" type="button">Cancelar</button></span>`;
      $("doImport").onclick = () => { D = UI.importData; UI.importData = null; box.hidden = true; save(); toast("Backup importado"); };
      $("cancelImport").onclick = () => { UI.importData = null; box.hidden = true; };
    } catch (err) { toast("Esse arquivo não é um backup do Caixa da Larinha."); }
  };

  // ---------- instalar como app ----------
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); installEvt = e;
    const bar = $("installBar"); bar.hidden = false;
    bar.innerHTML = `<span>Instale o Caixa da Larinha na tela inicial para abrir como aplicativo, até sem internet.</span><button class="primary" id="installBtn" type="button">Instalar app</button>`;
    $("installBtn").onclick = async () => { bar.hidden = true; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; };
  });
  window.addEventListener("appinstalled", () => { $("installBar").hidden = true; toast("App instalado"); });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !standalone) {
    const bar = $("installBar"); bar.hidden = false;
    bar.innerHTML = `<span>Para instalar no iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</span>`;
  }

  // atualiza status de vencimento quando o app volta para a tela
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { D = load(); render(); } });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  render();
})();
