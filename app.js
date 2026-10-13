/* Caixa da Larinha — app de controle de contas e gastos.
   Dados salvos no próprio aparelho (localStorage), com backup em arquivo JSON. */
(function () {
  "use strict";

  const STORAGE_KEY = "caixa-da-larinha:v1";
  const APP_URL = "https://hiagorfranklin.github.io/caixa-da-larinha/";
  const CATS = ["Moradia", "Contas da casa", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Assinaturas", "Outros"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MAX_PARCELAS = 24;
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1);
  const isoOf = (d) => ymOf(d) + "-" + pad(d.getDate());
  const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
  const monthDiff = (a, b) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
  const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const money = (v) => brl.format(Number(v) || 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmtInput = (v) => (v ? v.toFixed(2).replace(".", ",") : "");
  const mesCurto = (ym) => { const [y, m] = ym.split("-").map(Number); return MESES[m - 1].slice(0, 3) + "/" + String(y).slice(2); };
  function parseValor(s) {
    s = String(s || "").trim().replace(/[R$\s]/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  // ---------- armazenamento ----------
  const empty = () => ({ versao: 2, contas: {}, pagamentos: {}, gastos: {}, cartoes: {}, config: { renda: 0, meta: 0, ultimoBackup: null } });
  let D = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : empty();
    } catch (e) { return empty(); }
  }
  function normalize(x) {
    const d = empty();
    if (x && typeof x === "object") {
      for (const k of ["contas", "pagamentos", "gastos", "cartoes"]) if (x[k] && typeof x[k] === "object") d[k] = x[k];
      if (x.config && typeof x.config === "object") d.config = { ...d.config, ...x.config };
    }
    return d;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(D)); }
    catch (e) { toast("Não foi possível salvar. O armazenamento do aparelho pode estar cheio."); }
    render();
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- estado de tela ----------
  const UI = { ym: ymOf(new Date()), editId: null, pendingDel: null, importData: null, openFatura: null };

  // ---------- cartões e parcelas ----------
  const cartaoDe = (g) => (g.forma === "Crédito" && g.cartaoId && D.cartoes[g.cartaoId]) ? D.cartoes[g.cartaoId] : null;
  // mês (YYYY-MM) em que vence a fatura que recebe uma compra feita em `dataISO`
  function mesDaFatura(dataISO, k) {
    const [y, m, d] = dataISO.split("-").map(Number);
    let fecha = ymOf(new Date(y, m - 1, 1));
    if (d >= k.fechamento) fecha = addMonths(fecha, 1);
    return k.vencimento > k.fechamento ? fecha : addMonths(fecha, 1);
  }
  // valor da parcela i (0..n-1); os centavos que sobram vão para as primeiras parcelas
  function valorParcela(total, n, i) {
    const cents = Math.round(total * 100), base = Math.floor(cents / n), resto = cents - base * n;
    return (base + (i < resto ? 1 : 0)) / 100;
  }
  // parcelas de compras no cartão que caem na fatura do mês `ym`
  function parcelasNoMes(ym) {
    const out = [];
    for (const [id, g] of Object.entries(D.gastos)) {
      const k = cartaoDe(g); if (!k || !g.data) continue;
      const n = Math.max(1, g.parcelas || 1), i = monthDiff(mesDaFatura(g.data, k), ym);
      if (i >= 0 && i < n) out.push({ id, g, cartaoId: g.cartaoId, i, n, valor: valorParcela(+g.valor || 0, n, i) });
    }
    return out;
  }
  function faturasDoMes(ym) {
    const porCartao = {};
    for (const p of parcelasNoMes(ym)) (porCartao[p.cartaoId] = porCartao[p.cartaoId] || []).push(p);
    return Object.entries(porCartao).map(([cid, itens]) => ({
      id: "fatura-" + cid, fatura: true, cartaoId: cid, nome: "Fatura " + D.cartoes[cid].nome,
      dia: D.cartoes[cid].vencimento, categoria: "Cartão de crédito", itens,
      valor: Math.round(itens.reduce((s, p) => s + p.valor, 0) * 100) / 100,
    }));
  }

  // ---------- regras ----------
  function contasDoMes(ym) {
    const fixas = Object.entries(D.contas).map(([id, c]) => ({ id, ...c }))
      .filter((c) => (c.recorrente !== false || c.mes === ym) && (!c.inicio || c.inicio <= ym));
    return fixas.concat(faturasDoMes(ym))
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
  // tudo o que foi comprado no mês (lista do dia a dia)
  const comprasDoMes = (ym) => Object.entries(D.gastos).map(([id, g]) => ({ id, ...g }))
    .filter((g) => String(g.data || "").startsWith(ym))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const valorPago = (c, ym) => { const pg = D.pagamentos[c.id + "_" + ym]; return Number(pg ? (pg.valor ?? c.valor) : c.valor) || 0; };

  // ---------- render ----------
  function render() {
    const ym = UI.ym; const [y, m] = ym.split("-").map(Number);
    $("monthLabel").textContent = MESES[m - 1].replace(/^./, (c) => c.toUpperCase()) + " de " + y;

    const contas = contasDoMes(ym);
    const fixas = contas.filter((c) => !c.fatura);
    const totFixas = fixas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const pagoFixas = fixas.filter((c) => D.pagamentos[c.id + "_" + ym]).reduce((s, c) => s + valorPago(c, ym), 0);
    const compras = comprasDoMes(ym);
    const aVista = compras.filter((g) => !cartaoDe(g));
    const parcelas = parcelasNoMes(ym);
    const totAVista = aVista.reduce((s, g) => s + (Number(g.valor) || 0), 0);
    const totCartao = parcelas.reduce((s, p) => s + p.valor, 0);
    const totVariavel = totAVista + totCartao;
    const renda = Number(D.config.renda) || 0; const saldo = renda - totFixas - totVariavel;

    $("ledger").innerHTML = `
      <div><span class="label">Renda do mês</span><span class="v num">${renda ? money(renda) : "—"}</span>
        <button class="linkbtn" id="editRenda" type="button">${renda ? "Alterar renda" : "Definir renda"}</button></div>
      <div><span class="label">Contas fixas</span><span class="v"><span class="op">−</span>${money(totFixas)}</span>
        <span class="sub">${money(pagoFixas)} pago · ${money(Math.max(0, totFixas - pagoFixas))} falta</span></div>
      <div><span class="label">Gastos do mês</span><span class="v"><span class="op">−</span>${money(totVariavel)}</span>
        <span class="sub">${money(totAVista)} à vista · ${money(totCartao)} no cartão</span></div>
      <div class="saldo ${saldo < 0 && renda ? "neg" : ""}"><span class="label">Sobra prevista</span><span class="v num">${renda ? money(saldo) : "—"}</span>
        <span class="sub">${renda ? (saldo < 0 ? "Gastos passaram da renda" : "Renda − contas − gastos") : "Defina a renda para calcular"}</span></div>`;

    // checklist
    const pagas = contas.filter((c) => D.pagamentos[c.id + "_" + ym]);
    const atras = contas.filter((c) => status(c, ym).k === "atrasada");
    const breve = contas.filter((c) => ["hoje", "breve"].includes(status(c, ym).k));
    const pct = contas.length ? Math.round((pagas.length / contas.length) * 100) : 0;
    $("progress").innerHTML = contas.length ? `
      <div class="row"><span><b style="color:var(--ink)">${pagas.length} de ${contas.length}</b> contas pagas</span><span class="num">${pct}%</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span class="ok" style="width:${pct}%"></span></div>
      ${atras.length || breve.length ? `<div class="alerts">${atras.length ? `<span class="chip c-atrasada">${atras.length} atrasada${atras.length > 1 ? "s" : ""} · ${money(atras.reduce((s, c) => s + (+c.valor || 0), 0))}</span>` : ""}${breve.length ? `<span class="chip c-breve">${breve.length} vence${breve.length > 1 ? "m" : ""} nos próximos 3 dias</span>` : ""}</div>` : ""}` : "";

    $("bills").innerHTML = contas.length ? contas.map((c) => {
      const st = status(c, ym); const dia = Math.min(c.dia || 1, lastDay(ym)); const del = UI.pendingDel === c.id;
      const head = `<input type="checkbox" class="check" data-pay="${esc(c.id)}" ${st.k === "paga" ? "checked" : ""} aria-label="Marcar ${esc(c.nome)} como paga">
        <div class="due"><b>${dia}</b><small>${SEM[new Date(y, m - 1, dia).getDay()]}</small></div>`;
      if (c.fatura) {
        const open = UI.openFatura === c.id;
        return `<li class="bill is-${st.k} is-fatura">${head}
          <div class="info"><span class="name">${esc(c.nome)}</span>
            <span class="meta"><span class="chip c-${st.k}">${st.label}</span><button class="linkbtn small" data-fat="${esc(c.id)}" type="button" aria-expanded="${open}">${open ? "Ocultar" : "Ver"} ${c.itens.length} compra${c.itens.length > 1 ? "s" : ""}</button></span></div>
          <div class="right"><span class="val">${money(st.pg?.valor ?? c.valor)}</span></div>
          ${open ? `<ul class="fatitems">${c.itens.map((p) => `<li><span>${esc(p.g.descricao)}${p.n > 1 ? ` · ${p.i + 1}/${p.n}` : ""}</span><span class="val">${money(p.valor)}</span></li>`).join("")}</ul>` : ""}
        </li>`;
      }
      return `<li class="bill is-${st.k}">${head}
        <div class="info"><span class="name">${esc(c.nome)}</span>
          <span class="meta"><span class="chip c-${st.k}">${st.label}</span><span>${esc(c.categoria || "Outros")}</span>${c.recorrente === false ? `<span class="tag">só este mês</span>` : ""}</span></div>
        <div class="right"><span class="val">${money(st.pg?.valor ?? c.valor)}</span>
          <span class="acts"><button class="mini" data-edit="${esc(c.id)}" type="button">Editar</button><button class="mini ${del ? "danger" : ""}" data-delc="${esc(c.id)}" type="button">${del ? "Confirmar" : "Excluir"}</button></span></div>
      </li>`;
    }).join("") : `<li class="empty"><b>Nenhuma conta neste mês</b>Toque em “+ Nova conta” e cadastre aluguel, luz, água, internet… Cada conta mensal aparece aqui todo mês para você ir marcando.</li>`;

    // gastos
    $("gTotal").textContent = money(totVariavel);
    const meta = Number(D.config.meta) || 0;
    if (meta) {
      const p = Math.min(100, Math.round((totVariavel / meta) * 100)); const over = totVariavel > meta;
      $("metaBox").innerHTML = `<div class="metabar ${over ? "over" : ""}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px"><span>Limite do mês: <b class="num">${money(meta)}</b></span><span class="num" style="color:${over ? "var(--crit)" : "var(--muted)"}">${over ? "passou " + money(totVariavel - meta) : "resta " + money(meta - totVariavel)}</span></div><div class="bar"><span class="use" style="width:${p}%"></span></div></div>`;
    } else $("metaBox").innerHTML = "";

    const porCat = {};
    aVista.forEach((g) => { const k = g.categoria || "Outros"; porCat[k] = (porCat[k] || 0) + (+g.valor || 0); });
    parcelas.forEach((p) => { const k = p.g.categoria || "Outros"; porCat[k] = (porCat[k] || 0) + p.valor; });
    const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]); const max = cats[0]?.[1] || 1;
    $("cats").innerHTML = cats.length ? `<span class="label">Por categoria (à vista + fatura do mês)</span>` + cats.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${Math.max(3, (v / max) * 100)}%"></div></div><span class="amt">${money(v)}</span></div>`).join("") : "";

    if (!compras.length) {
      $("days").innerHTML = `<div class="empty"><b>Nenhuma compra lançada em ${MESES[m - 1]}</b>Lance o que gastar no dia (mercado, gasolina, lanche) e veja para onde o dinheiro está indo.${totCartao ? ` As parcelas de meses anteriores estão na fatura, em Contas a pagar.` : ""}</div>`;
    } else {
      const byDay = {}; compras.forEach((g) => (byDay[g.data] = byDay[g.data] || []).push(g));
      $("days").innerHTML = Object.keys(byDay).sort().reverse().map((dt) => {
        const [yy, mm, dd] = dt.split("-").map(Number); const tot = byDay[dt].reduce((s, g) => s + (+g.valor || 0), 0);
        return `<div class="day"><h3><span>${dd} ${MESES[mm - 1].slice(0, 3)} · ${SEM[new Date(yy, mm - 1, dd).getDay()]}</span><span class="num">${money(tot)}</span></h3><ul>${byDay[dt].map((g) => {
          const del = UI.pendingDel === g.id; const k = cartaoDe(g); const n = g.parcelas || 1;
          let sub = `${esc(g.categoria || "Outros")} · ${esc(g.forma || "")}`;
          if (k) sub = `${esc(g.categoria || "Outros")} · ${esc(k.nome)} · ${n > 1 ? `${n}x de ${money(valorParcela(+g.valor, n, n - 1))} · ` : ""}fatura de ${mesCurto(mesDaFatura(g.data, k))}`;
          return `<li class="exp"><div class="d"><span>${esc(g.descricao)}</span><span>${sub}</span></div><span class="val">${money(g.valor)}</span><button class="mini ${del ? "danger" : ""}" data-delg="${esc(g.id)}" type="button" aria-label="Excluir ${esc(g.descricao)}">${del ? "Confirmar" : "×"}</button></li>`;
        }).join("")}</ul></div>`;
      }).join("");
    }

    // cartões
    const ks = Object.entries(D.cartoes).sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"));
    $("cardList").innerHTML = ks.length ? ks.map(([id, k]) => {
      const del = UI.pendingDel === id;
      return `<li><div><div class="cname">${esc(k.nome)}</div><div class="cmeta">Fecha dia ${k.fechamento} · vence dia ${k.vencimento}</div></div>
        <span class="acts"><button class="mini" data-editk="${esc(id)}" type="button">Editar</button><button class="mini ${del ? "danger" : ""}" data-delk="${esc(id)}" type="button">${del ? "Confirmar" : "Excluir"}</button></span></li>`;
    }).join("") : `<li><div class="empty"><b>Nenhum cartão cadastrado</b>Cadastre seu cartão com os dias de fechamento e vencimento para lançar compras parceladas.</div></li>`;
    updateCardFields();

    const lb = D.config.ultimoBackup;
    $("lastBackup").textContent = lb ? `Último backup: ${lb.split("-").reverse().join("/")}.` : "Você ainda não fez nenhum backup.";
  }

  // ---------- campos de crédito no formulário de gasto ----------
  $("gParc").innerHTML = Array.from({ length: MAX_PARCELAS }, (_, i) => `<option value="${i + 1}">${i + 1 === 1 ? "À vista (1x)" : (i + 1) + "x"}</option>`).join("");
  function updateCardFields() {
    const credito = $("gForma").value === "Crédito";
    const ks = Object.entries(D.cartoes);
    const sel = $("gCartao"); const atual = sel.value;
    sel.innerHTML = ks.map(([id, k]) => `<option value="${esc(id)}">${esc(k.nome)}</option>`).join("");
    if (atual && D.cartoes[atual]) sel.value = atual;
    $("gCartaoBox").hidden = !credito || !ks.length;
    $("gParcBox").hidden = !credito || !ks.length;
    $("gValorLbl").textContent = credito && ks.length ? "Valor total (R$)" : "Valor (R$)";
    const hint = $("gCardHint");
    if (credito && !ks.length) { hint.hidden = false; hint.textContent = "Cadastre um cartão em “Cartões de crédito” para a compra ir para a fatura e poder parcelar. Sem cartão, ela conta como gasto à vista."; }
    else if (credito) {
      const k = D.cartoes[sel.value]; const n = +$("gParc").value || 1; const v = parseValor($("gValor").value);
      const data = $("gData").value;
      if (k && data) {
        const mf = mesDaFatura(data, k);
        hint.hidden = false;
        hint.textContent = (n > 1 && v > 0 ? `${n}x de ${money(valorParcela(v, n, n - 1))}, ` : "") + `primeira parcela na fatura de ${mesCurto(mf)} (vence dia ${k.vencimento}).`;
      } else hint.hidden = true;
    } else hint.hidden = true;
  }
  ["gForma", "gCartao", "gParc", "gData"].forEach((id) => $(id).addEventListener("change", updateCardFields));
  $("gValor").addEventListener("input", () => { if ($("gForma").value === "Crédito") updateCardFields(); });

  // ---------- interação ----------
  let toastT;
  function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600); }
  let delT;
  function armDelete(id) { UI.pendingDel = id; render(); clearTimeout(delT); delT = setTimeout(() => { UI.pendingDel = null; render(); }, 4000); }

  ["cCat", "gCat"].forEach((id) => ($(id).innerHTML = CATS.map((c) => `<option>${c}</option>`).join("")));
  $("cCat").value = "Contas da casa"; $("gCat").value = "Alimentação";

  const defaultGastoDate = () => { const t = new Date(); return ymOf(t) === UI.ym ? isoOf(t) : UI.ym + "-01"; };
  $("gData").value = defaultGastoDate();
  function goMonth(ym) { UI.ym = ym; UI.pendingDel = null; UI.openFatura = null; $("gData").value = defaultGastoDate(); render(); }
  $("prevM").onclick = () => goMonth(addMonths(UI.ym, -1));
  $("nextM").onclick = () => goMonth(addMonths(UI.ym, 1));
  $("todayM").onclick = () => goMonth(ymOf(new Date()));

  // contas fixas
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

  // cartões
  let editCartao = null;
  function openCartaoForm(id) {
    editCartao = id || null; $("cartaoForm").hidden = false; $("kErr").textContent = "";
    const k = id ? D.cartoes[id] : null;
    $("kNome").value = k?.nome || ""; $("kFecha").value = k?.fechamento || ""; $("kVence").value = k?.vencimento || "";
    $("kSubmit").textContent = id ? "Salvar alterações" : "Adicionar cartão"; $("kNome").focus();
  }
  $("newCartao").onclick = () => openCartaoForm(null);
  $("kCancel").onclick = () => { $("cartaoForm").hidden = true; editCartao = null; };
  $("cartaoForm").onsubmit = (e) => {
    e.preventDefault();
    const nome = $("kNome").value.trim(), fechamento = parseInt($("kFecha").value, 10), vencimento = parseInt($("kVence").value, 10);
    if (!nome) return ($("kErr").textContent = "Dê um nome para o cartão.");
    if (!(fechamento >= 1 && fechamento <= 31) || !(vencimento >= 1 && vencimento <= 31)) return ($("kErr").textContent = "Os dias vão de 1 a 31.");
    if (fechamento === vencimento) return ($("kErr").textContent = "O fechamento e o vencimento não podem cair no mesmo dia.");
    const was = editCartao; D.cartoes[editCartao || uid()] = { nome, fechamento, vencimento };
    $("cartaoForm").hidden = true; editCartao = null; save(); toast(was ? "Cartão atualizado" : "Cartão adicionado");
  };

  // gastos
  $("gastoForm").onsubmit = (e) => {
    e.preventDefault();
    const descricao = $("gDesc").value.trim(), valor = parseValor($("gValor").value), data = $("gData").value;
    if (!descricao) return ($("gErr").textContent = "Descreva o gasto.");
    if (!(valor > 0)) return ($("gErr").textContent = "Valor inválido. Use o formato 25,90.");
    if (!data) return ($("gErr").textContent = "Escolha a data.");
    $("gErr").textContent = "";
    const row = { descricao, valor, data, categoria: $("gCat").value, forma: $("gForma").value };
    let msg = data.startsWith(UI.ym) ? "Gasto lançado" : "Lançado em " + MESES[+data.slice(5, 7) - 1];
    if (row.forma === "Crédito" && D.cartoes[$("gCartao").value]) {
      row.cartaoId = $("gCartao").value; row.parcelas = Math.min(MAX_PARCELAS, Math.max(1, +$("gParc").value || 1));
      msg = `Lançado na fatura de ${mesCurto(mesDaFatura(data, D.cartoes[row.cartaoId]))}` + (row.parcelas > 1 ? ` em ${row.parcelas}x` : "");
    }
    D.gastos[uid()] = row;
    $("gDesc").value = ""; $("gValor").value = ""; $("gParc").value = "1";
    save(); toast(msg);
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
      if (D.pagamentos[pid]) { delete D.pagamentos[pid]; save(); toast("Marcada como não paga"); return; }
      const c = contasDoMes(UI.ym).find((x) => x.id === id); if (!c) return;
      D.pagamentos[pid] = { contaId: id, mes: UI.ym, pagoEm: isoOf(new Date()), valor: +c.valor || 0 };
      save(); toast(c.fatura ? "Fatura paga ✓" : "Conta paga ✓"); return;
    }
    if (t.dataset.fat) { UI.openFatura = UI.openFatura === t.dataset.fat ? null : t.dataset.fat; render(); return; }
    if (t.dataset.edit) return openContaForm(t.dataset.edit);
    if (t.dataset.editk) return openCartaoForm(t.dataset.editk);
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
    if (t.dataset.delk) {
      const id = t.dataset.delk; if (UI.pendingDel !== id) return armDelete(id);
      UI.pendingDel = null; delete D.cartoes[id];
      for (const k of Object.keys(D.pagamentos)) if (D.pagamentos[k].contaId === "fatura-" + id) delete D.pagamentos[k];
      save(); toast("Cartão excluído. As compras dele passam a contar como à vista."); return;
    }
  });
  $("rCancel").onclick = () => ($("rendaForm").hidden = true);
  $("rendaForm").onsubmit = (e) => {
    e.preventDefault();
    D.config.renda = parseValor($("rRenda").value) || 0; D.config.meta = parseValor($("rMeta").value) || 0;
    $("rendaForm").hidden = true; save(); toast("Renda salva");
  };

  // ---------- salvar/compartilhar arquivo ----------
  // no celular abre o menu de compartilhar; se não der, baixa o arquivo
  async function entregarArquivo(blob, nome, titulo) {
    try {
      const file = new File([blob], nome, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: titulo }); return "ok"; }
    } catch (err) { if (err && err.name === "AbortError") return "cancelado"; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "ok";
  }

  // ---------- agenda (.ics) ----------
  const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  function icsFold(line) {
    const out = []; let cur = "", bytes = 0; const enc = new TextEncoder();
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  const ymd = (ym, dia) => ym.replace("-", "") + pad(Math.min(dia, lastDay(ym)));
  const nextDay = (s) => { const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8) + 1); return isoOf(d).replace(/-/g, ""); };
  function regraMensal(dia) {
    if (dia <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${dia}`;
    const dias = []; for (let d = 28; d <= dia; d++) dias.push(d);
    return `FREQ=MONTHLY;BYMONTHDAY=${dias.join(",")};BYSETPOS=-1`; // usa o último dia válido em meses curtos
  }
  function gerarICS() {
    const agora = new Date(); const ymAgora = ymOf(agora);
    const stamp = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Caixa da Larinha//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Contas da Larinha", "X-WR-TIMEZONE:America/Sao_Paulo"];
    let n = 0;
    const evento = (uidv, titulo, inicio, rrule, desc) => {
      n++;
      L.push("BEGIN:VEVENT", "UID:" + uidv + "@caixa-da-larinha", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + inicio, "DTEND;VALUE=DATE:" + nextDay(inicio));
      if (rrule) L.push("RRULE:" + rrule);
      L.push("SUMMARY:" + icsEsc(titulo), "DESCRIPTION:" + icsEsc(desc + "\nMarque como paga no app: " + APP_URL), "TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Vence em 2 dias: " + titulo), "TRIGGER:-P1DT15H", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Vence hoje: " + titulo), "TRIGGER:PT9H", "END:VALARM",
        "END:VEVENT");
    };
    for (const [id, c] of Object.entries(D.contas)) {
      if (c.recorrente === false) {
        if (c.mes && c.mes >= ymAgora) evento(id, `Pagar ${c.nome}`, ymd(c.mes, c.dia), null, `Valor: ${money(c.valor)}`);
      } else {
        const ini = c.inicio && c.inicio > ymAgora ? c.inicio : ymAgora;
        evento(id, `Pagar ${c.nome}`, ymd(ini, c.dia), regraMensal(c.dia), `Valor: ${money(c.valor)} (todo mês)`);
      }
    }
    for (const [id, k] of Object.entries(D.cartoes)) {
      evento("fatura-" + id, `Pagar fatura ${k.nome}`, ymd(ymAgora, k.vencimento), regraMensal(k.vencimento), "O valor de cada mês está no app.");
    }
    L.push("END:VCALENDAR");
    return { texto: L.map(icsFold).join("\r\n") + "\r\n", n };
  }
  $("icsBtn").onclick = async () => {
    const { texto, n } = gerarICS();
    if (!n) return toast("Cadastre uma conta ou um cartão primeiro.");
    const r = await entregarArquivo(new Blob([texto], { type: "text/calendar" }), "contas-da-larinha.ics", "Vencimentos – Caixa da Larinha");
    if (r === "ok") toast(`${n} lembrete${n > 1 ? "s" : ""} gerado${n > 1 ? "s" : ""}. Abra o arquivo com a agenda.`);
  };

  // ---------- backup ----------
  $("exportBtn").onclick = async () => {
    const anterior = D.config.ultimoBackup;
    D.config.ultimoBackup = isoOf(new Date());
    const nome = `caixa-da-larinha-backup-${D.config.ultimoBackup}.json`;
    const r = await entregarArquivo(new Blob([JSON.stringify(D, null, 2)], { type: "application/json" }), nome, "Backup Caixa da Larinha");
    if (r === "cancelado") { D.config.ultimoBackup = anterior; return; }
    save(); toast("Backup exportado");
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
