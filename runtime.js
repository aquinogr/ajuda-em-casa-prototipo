// Runtime mínimo para as telas exportadas do Claude Design (.dc.html).
// Faz o que o protótipo usa: {{buracos}}, laços, condições, eventos e estado.
(function () {
  "use strict";

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var TEXT_INPUT = /^(text|search|number|date|tel|email|password|url)$/;
  var MODO_KEY = "ajuda-em-casa:modo";

  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var parts = expr.split(".");
    var obj;
    for (var i = 0; i < scope.length; i++) {
      if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) {
        obj = scope[i][parts[0]];
        break;
      }
    }
    for (var j = 1; j < parts.length && obj != null; j++) obj = obj[parts[j]];
    return obj;
  }

  function interp(text, scope) {
    return text.replace(HOLE, function (_, expr) {
      var v = lookup(expr, scope);
      return v == null ? "" : String(v);
    });
  }

  // Links calculados pelas telas apontam para .dc.html; no site, as páginas são .html.
  function destinoLink(href) {
    if (href === "Main.dc.html") return "index.html";
    return href.replace(/\.dc\.html(#|$)/, ".html$1");
  }

  function holeValue(text, scope) {
    var m = (text || "").match(WHOLE);
    return m ? lookup(m[1], scope) : text;
  }

  function bindAttrs(el, scope) {
    Array.prototype.slice.call(el.attributes).forEach(function (attr) {
      var name = attr.name;
      var value = attr.value;
      if (name.indexOf("hint-") === 0) {
        el.removeAttribute(name);
        return;
      }
      var whole = value.match(WHOLE);
      if (name.slice(0, 2) === "on" && whole) {
        el.removeAttribute(name);
        var fn = lookup(whole[1], scope);
        if (typeof fn !== "function") return;
        var type = name.slice(2);
        if (type === "change") {
          var t = (el.getAttribute("type") || "text").toLowerCase();
          if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && TEXT_INPUT.test(t))) type = "input";
        }
        el.addEventListener(type, function (ev) { fn(ev); });
        return;
      }
      if (name === "checked" && whole) {
        el.removeAttribute(name);
        el.checked = !!lookup(whole[1], scope);
        el.__ligado = true;
        return;
      }
      if (name === "value" && whole && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        var val = lookup(whole[1], scope);
        el.removeAttribute(name);
        el.value = val == null ? "" : String(val);
        el.__ligado = true;
        return;
      }
      if (value.indexOf("{{") === -1) return;
      if (whole) {
        var v = lookup(whole[1], scope);
        if (v === false || v == null) el.removeAttribute(name);
        else el.setAttribute(name, name === "href" ? destinoLink(String(v)) : String(v));
        return;
      }
      var texto = interp(value, scope);
      el.setAttribute(name, name === "href" ? destinoLink(texto) : texto);
    });
  }

  function render(parent, scope) {
    Array.prototype.slice.call(parent.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        if (node.nodeValue.indexOf("{{") !== -1) node.nodeValue = interp(node.nodeValue, scope);
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === "TEMPLATE" && node.hasAttribute("data-for")) {
        var list = holeValue(node.getAttribute("data-for"), scope) || [];
        var as = node.getAttribute("data-as") || "item";
        var frag = document.createDocumentFragment();
        list.forEach(function (item, i) {
          var local = { $index: i };
          local[as] = item;
          var copia = node.content.cloneNode(true);
          render(copia, [local].concat(scope));
          frag.appendChild(copia);
        });
        node.parentNode.replaceChild(frag, node);
        return;
      }
      if (node.tagName === "TEMPLATE" && node.hasAttribute("data-if")) {
        if (holeValue(node.getAttribute("data-if"), scope)) {
          var conteudo = node.content.cloneNode(true);
          render(conteudo, scope);
          node.parentNode.replaceChild(conteudo, node);
        } else {
          node.parentNode.removeChild(node);
        }
        return;
      }
      bindAttrs(node, scope);
      render(node, scope);
    });
  }

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = null;
    }
    setState(patch) {
      var next = typeof patch === "function" ? patch(this.state || {}, this.props) : patch;
      this.state = Object.assign({}, this.state || {}, next);
      agendar();
    }
    forceUpdate() {
      agendar();
    }
  }

  var app = document.getElementById("app");
  var tpl = document.getElementById("tpl");
  var meta = JSON.parse(document.getElementById("props").textContent || "{}");

  var props = {};
  Object.keys(meta).forEach(function (k) {
    if (k.charAt(0) !== "$" && meta[k] && "default" in meta[k]) props[k] = meta[k].default;
  });
  if (meta.modo && meta.modo.options) {
    var salvo = null;
    try { salvo = localStorage.getItem(MODO_KEY); } catch (e) { salvo = null; }
    if (salvo && meta.modo.options.indexOf(salvo) !== -1) props.modo = salvo;
  }

  var Component = new Function("DCLogic", document.getElementById("logic").textContent + "\nreturn Component;")(DCLogic);
  var comp = new Component(props);
  comp.props = props;

  // Telas de celular: o protótipo usa 390 px fixos; aqui elas se ajustam à tela.
  function ajustarRaiz() {
    var raiz = app.firstElementChild;
    if (!raiz || raiz.style.width !== "390px") return;
    raiz.style.width = "100%";
    raiz.style.maxWidth = "430px";
    raiz.style.height = "auto";
    raiz.style.minHeight = "calc(100vh - 34px)";
    raiz.style.margin = "0 auto";
    raiz.style.boxShadow = "0 0 0 1px #E8DED3";
  }

  var pendente = false;
  function agendar() {
    if (pendente) return;
    pendente = true;
    Promise.resolve().then(function () {
      pendente = false;
      montar();
    });
  }

  function montar() {
    // Guarda o que a pessoa digitou e onde estava o cursor, para não perder ao redesenhar.
    var digitado = {};
    Array.prototype.forEach.call(app.querySelectorAll("input[id], textarea[id]"), function (el) {
      if (!el.__ligado && el.type !== "checkbox" && el.type !== "radio") digitado[el.id] = el.value;
    });
    var ativo = document.activeElement;
    var idAtivo = ativo && app.contains(ativo) ? ativo.id : "";
    var ini = null;
    var fim = null;
    if (idAtivo) {
      try { ini = ativo.selectionStart; fim = ativo.selectionEnd; } catch (e) { ini = null; }
    }

    var frag = tpl.content.cloneNode(true);
    render(frag, [comp.renderVals ? comp.renderVals() : {}]);
    app.replaceChildren(frag);
    ajustarRaiz();

    Object.keys(digitado).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.__ligado) el.value = digitado[id];
    });
    if (idAtivo) {
      var foco = document.getElementById(idAtivo);
      if (foco) {
        foco.focus();
        try { if (ini != null) foco.setSelectionRange(ini, fim); } catch (e) { /* tipo sem cursor */ }
      }
    }
  }

  app.addEventListener("submit", function (ev) { ev.preventDefault(); });

  var seletor = document.getElementById("faixa-modo");
  if (seletor) {
    seletor.value = props.modo;
    seletor.addEventListener("change", function () {
      props.modo = seletor.value;
      try { localStorage.setItem(MODO_KEY, seletor.value); } catch (e) { /* sem armazenamento */ }
      montar();
    });
  }

  montar();
})();
