/**
 * Minified by jsDelivr using Terser v5.39.0.
 * Original file: /gh/galaxykate/tracery@master/tracery.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var tracery = { utilities: {} };
!(function () {
  function t(t) {
    return '"' + t + '"';
  }
  function e(e) {
    var s,
      r,
      n = [],
      o = [],
      i = [],
      a = 0,
      h = 0,
      l = !0;
    function u(t) {
      if (h !== t) {
        var o = e.substring(h, t);
        if (l) {
          l = !1;
          var i = o.split(".");
          ((s = i[0]), (r = i.slice(1, i.length)));
        } else n.push("multiple possible expansion symbols in tag!" + e);
      }
      h = t;
    }
    for (var c = 0; c < e.length; c++) {
      switch (e.charAt(c)) {
        case "[":
          (0 === a && u(c), a++);
          break;
        case "]":
          if (0 === --a) {
            var p = e.substring(h + 1, c);
            (l ? o.push(p) : i.push(p), (h = c + 1));
          }
      }
    }
    if ((u(c), a > 0)) {
      var f = "Too many '[' in rule " + t(e);
      n.push(f);
    }
    if (a < 0) {
      f = "Too many ']' in rule " + t(e);
      n.push(f);
    }
    return {
      preActions: o,
      postActions: i,
      symbol: s,
      mods: r,
      raw: e,
      errors: n,
    };
  }
  function s(s) {
    var r = [],
      n = [];
    if (!("string" == typeof s || s instanceof String))
      return (n.push("Cannot parse non-string rule " + s), (r.errors = n), r);
    if (0 === s.length) return [];
    var o = 0,
      i = 0,
      a = !1;
    function h(t) {
      var n = s.substring(i, t);
      (n.length > 0 && (a ? r.push(e(n)) : r.push(n)), (a = !a), (i = t + 1));
    }
    for (var l = 0; l < s.length; l++) {
      switch (s.charAt(l)) {
        case "[":
          o++;
          break;
        case "]":
          o--;
          break;
        case "#":
          0 === o && h(l);
      }
    }
    if (o > 0) {
      var u = "Too many '[' in rule " + t(s);
      n.push(u);
    }
    if (o < 0) {
      u = "Too many ']' in rule " + t(s);
      n.push(u);
    }
    if (a) {
      u = "Odd number of '#' in rule " + t(s);
      n.push(u);
    }
    return (h(s.length), (r.errors = n), r);
  }
  ((tracery.testParse = function (e, r) {
    (console.log("-------"), console.log("Test parse rule: " + t(e) + " " + r));
    var n = s(e);
    if (n.errors && n.errors.length > 0)
      for (var o = 0; o < n.errors.length; o++) console.log(n.errors[o]);
  }),
    (tracery.testParseTag = function (s, r) {
      (console.log("-------"),
        console.log("Test parse tag: " + t(s) + " " + r));
      var n = e(s);
      if (n.errors && n.errors.length > 0)
        for (var o = 0; o < n.errors.length; o++) console.log(n.errors[o]);
    }),
    (tracery.parseRule = s),
    (tracery.parseTag = e),
    (function () {
      var t = !1,
        e = /xyz/.test(function () {
          xyz;
        })
          ? /\b_super\b/
          : /.*/;
      ((this.Class = function () {}),
        (Class.extend = function (s) {
          var r = this.prototype;
          t = !0;
          var n = new this();
          for (var o in ((t = !1), s))
            n[o] =
              "function" == typeof s[o] &&
              "function" == typeof r[o] &&
              e.test(s[o])
                ? (function (t, e) {
                    return function () {
                      var s = this._super;
                      this._super = r[t];
                      var n = e.apply(this, arguments);
                      return ((this._super = s), n);
                    };
                  })(o, s[o])
                : s[o];
          function i() {
            !t && this.init && this.init.apply(this, arguments);
          }
          return (
            (i.prototype = n),
            (i.prototype.constructor = i),
            (i.extend = arguments.callee),
            i
          );
        }));
    })());
  var n = function (t) {
    ((this.raw = t), (this.sections = s(t)));
  };
  ((n.prototype.getParsed = function () {
    return (this.sections || (this.sections = s(raw)), this.sections);
  }),
    (n.prototype.toString = function () {
      return this.raw;
    }),
    (n.prototype.toJSONString = function () {
      return this.raw;
    }));
  Object.freeze({ RED: 0, GREEN: 1, BLUE: 2 });
  var o = function (t) {
    if (t.constructor === Array) t = t.slice(0, t.length);
    else if (t.prototype === o);
    else {
      if (!("string" == typeof t || t instanceof String))
        throw (console.log(t), "creating ruleset with unknown object type!");
      t = Array.prototype.slice.call(arguments);
    }
    ((this.rules = t),
      this.parseAll(),
      (this.uses = []),
      (this.startUses = []),
      (this.totalUses = 0));
    for (var e = 0; e < this.rules.length; e++)
      ((this.uses[e] = 0),
        (this.startUses[e] = this.uses[e]),
        (this.totalUses += this.uses[e]));
  };
  ((o.prototype.parseAll = function (t) {
    for (var e = 0; e < this.rules.length; e++)
      this.rules[e].prototype !== n && (this.rules[e] = new n(this.rules[e]));
  }),
    (o.prototype.mapRules = function (t) {
      return this.rules.map(function (e, s) {
        return t(e, s);
      });
    }),
    (o.prototype.applyToRules = function (t) {
      for (var e = 0; e < this.rules.length; e++) t(this.rules[e], e);
    }),
    (o.prototype.get = function () {
      var t = this.getIndex();
      return this.rules[t];
    }),
    (o.prototype.getRandomIndex = function () {
      return Math.floor(this.uses.length * Math.random());
    }),
    (o.prototype.getIndex = function () {
      for (
        var t = this.getRandomIndex(),
          e = this.totalUses / this.uses.length,
          s = 0;
        this.uses[t] > e && s < 20;
      )
        ((t = this.getRandomIndex()), s++);
      return t;
    }),
    (o.prototype.decayUses = function (t) {
      this.totalUses = 0;
      for (var e = 0; e < this.uses; e++)
        ((this.uses[index] *= 1 - t), (this.totalUses += this.uses[index]));
    }),
    (o.prototype.testRandom = function () {
      console.log("Test random");
      for (var t = [], e = 0; e < this.uses.length; e++) t[e] = 0;
      var s = 10 * this.uses.length;
      for (e = 0; e < s; e++) {
        var r = this.getIndex();
        ((this.uses[r] += 1), t[r]++, this.decayUses(0.1));
      }
      for (e = 0; e < this.uses.length; e++)
        console.log(e + ":\t" + t[e] + " \t" + this.uses[e]);
    }),
    (o.prototype.getSaveRules = function () {
      return this.rules.map(function (t) {
        return t.toJSONString();
      });
    }));
  var i = function (t, e) {
    ((this.node = t), (this.grammar = t.grammar), (this.raw = e));
  };
  ((i.prototype.activate = function () {
    var t = this.node;
    (t.actions.push(this), (this.amended = this.grammar.flatten(this.raw)));
    var s = e(this.amended),
      r = s.preActions;
    if (
      (r &&
        r.length > 0 &&
        (this.subactions = r.map(function (e) {
          return new i(t, e);
        })),
      s.symbol)
    ) {
      var n = s.symbol.split(":");
      if (2 !== n.length) throw "Unknown action: " + s.symbol;
      ((this.push = { symbol: n[0], rules: n[1].split(",") }),
        t.grammar.pushRules(this.push.symbol, this.push.rules));
    }
    if (this.subactions)
      for (var o = 0; o < this.subactions.length; o++)
        this.subactions[o].activate();
  }),
    (i.prototype.deactivate = function () {
      if (this.subactions)
        for (var t = 0; t < this.subactions.length; t++)
          this.subactions[t].deactivate();
      this.push &&
        this.node.grammar.popRules(this.push.symbol, this.push.rules);
    }));
  var a = function (t) {
    switch ((t = t.toLowerCase())) {
      case "a":
      case "e":
      case "i":
      case "o":
      case "u":
        return !1;
    }
    return !0;
  };
  var h = {
      capitalizeAll: function (t) {
        return t.replace(/(?:^|\s)\S/g, function (t) {
          return t.toUpperCase();
        });
      },
      capitalize: function (t) {
        return t.charAt(0).toUpperCase() + t.slice(1);
      },
      inQuotes: function (t) {
        return '"' + t + '"';
      },
      comma: function (t) {
        var e = t.charAt(t.length - 1);
        return "," === e || "." === e || "?" === e || "!" === e ? t : t + ",";
      },
      beeSpeak: function (t) {
        return (t = t.replace(/s/, "zzz"));
      },
      a: function (t) {
        return a(t.charAt()) ? "a " + t : "an " + t;
      },
      s: function (t) {
        switch (t.charAt(t.length - 1)) {
          case "y":
            return a(t.charAt(t.length - 2))
              ? t.slice(0, t.length - 1) + "ies"
              : t + "s";
          case "x":
            return t.slice(0, t.length - 1) + "xen";
          case "z":
            return t.slice(0, t.length - 1) + "zes";
          case "h":
            return t.slice(0, t.length - 1) + "hes";
          default:
            return t + "s";
        }
      },
      ed: function (t) {
        var e = t.indexOf(" "),
          s = ((t = t), "");
        switch (
          (e > 0 && ((s = t.substring(e, t.length)), (t = t.substring(0, e))),
          t.charAt(t.length - 1))
        ) {
          case "y":
            return a(t.charAt(t.length - 2))
              ? t.slice(0, t.length - 1) + "ied" + s
              : t + "ed" + s;
          case "e":
            return t + "d" + s;
          default:
            return t + "ed" + s;
        }
      },
    },
    l = 0,
    u = Class.extend({
      init: function () {
        ((this.depth = 0),
          (this.id = l),
          l++,
          (this.childText = "[[UNEXPANDED]]"));
      },
      setParent: function (t) {
        t &&
          ((this.depth = t.depth + 1),
          (this.parent = t),
          (this.grammar = t.grammar));
      },
      expand: function () {
        return "???";
      },
      expandChildren: function () {
        if (this.children) {
          this.childText = "";
          for (var t = 0; t < this.children.length; t++)
            (this.children[t].expand(),
              (this.childText += this.children[t].finalText));
          this.finalText = this.childText;
        }
      },
      createChildrenFromSections: function (t) {
        var e = this;
        this.children = t.map(function (t) {
          return "string" == typeof t || t instanceof String
            ? new f(e, t)
            : new p(e, t);
        });
      },
    }),
    c = u.extend({
      init: function (t, e) {
        (this._super(), (this.grammar = t), (this.parsedRule = s(e)));
      },
      expand: function () {
        (this.createChildrenFromSections(this.parsedRule),
          this.expandChildren());
      },
    }),
    p = u.extend({
      init: function (t, s) {
        if ((this._super(), null === s || "object" != typeof s)) {
          if (!("string" == typeof s || s instanceof String))
            throw (
              console.log("Unknown tagNode input: ", s),
              "Can't make tagNode from strange tag!"
            );
          (console.warn("Can't make tagNode from unparsed string!"),
            (s = e(s)));
        }
        (this.setParent(t), $.extend(this, s));
      },
      expand: function () {
        (tracery.outputExpansionTrace && console.log(r.sections),
          (this.rule = this.grammar.getRule(this.symbol)),
          (this.actions = []),
          this.createChildrenFromSections(this.rule.getParsed()));
        for (var t = 0; t < this.preActions.length; t++) {
          new i(this, this.preActions[t]).activate();
        }
        (this.rule.sections || console.log(this.rule), this.expandChildren());
        for (t = 0; t < this.actions.length; t++) this.actions[t].deactivate();
        this.finalText = this.childText;
        for (t = 0; t < this.mods.length; t++)
          this.finalText = this.grammar.applyMod(this.mods[t], this.finalText);
      },
      toLabel: function () {
        return this.symbol;
      },
      toString: function () {
        return (
          "TagNode '" +
          this.symbol +
          "' mods:" +
          this.mods +
          ", preactions:" +
          this.preActions +
          ", postactions" +
          this.postActions
        );
      },
    }),
    f = u.extend({
      isLeaf: !0,
      init: function (t, e) {
        (this._super(),
          this.setParent(t),
          (this.text = e),
          (this.finalText = e));
      },
      expand: function () {},
      toLabel: function () {
        return this.text;
      },
    });
  function y(t, e) {
    ((this.grammar = t),
      (this.key = e),
      (this.currentRules = void 0),
      (this.ruleSets = []));
  }
  function m() {
    this.clear();
  }
  ((y.prototype.loadFrom = function (t) {
    ((t = this.wrapRules(t)),
      (this.baseRules = t),
      this.ruleSets.push(t),
      (this.currentRules = this.ruleSets[this.ruleSets.length - 1]));
  }),
    (y.prototype.mapRules = function (t) {
      return this.currentRules.mapRules(t);
    }),
    (y.prototype.applyToRules = function (t) {
      this.currentRules.applyToRules(t);
    }),
    (y.prototype.wrapRules = function (t) {
      if (t.prototype !== o) {
        if (Array.isArray(t)) return new o(t);
        if ("string" == typeof t || t instanceof String) return new o(t);
        throw "Unknown rules type: " + t;
      }
      return t;
    }),
    (y.prototype.pushRules = function (t) {
      ((t = this.wrapRules(t)),
        this.ruleSets.push(t),
        (this.currentRules = this.ruleSets[this.ruleSets.length - 1]));
    }),
    (y.prototype.popRules = function () {
      this.ruleSets.pop();
      (this.ruleSets.length,
        (this.currentRules = this.ruleSets[this.ruleSets.length - 1]));
    }),
    (y.prototype.setRules = function (t) {
      ((t = this.wrapRules(t)), (this.ruleSets = [t]), (this.currentRules = t));
    }),
    (y.prototype.addRule = function (t) {
      this.currentRules.addRule(seed);
    }),
    (y.prototype.select = function () {
      this.isSelected = !0;
    }),
    (y.prototype.deselect = function () {
      this.isSelected = !1;
    }),
    (y.prototype.getRule = function (t) {
      return this.currentRules.get(t);
    }),
    (y.prototype.toString = function () {
      return (
        this.key +
        ": " +
        this.currentRules +
        "(overlaying " +
        (this.ruleSets.length - 1) +
        ")"
      );
    }),
    (y.prototype.toJSON = function () {
      var t = this.baseRules.rules.map(function (t) {
        return '"' + t.raw + '"';
      });
      return '"' + this.key + '": [' + t.join(", ") + "]";
    }),
    (y.prototype.toHTML = function (t) {
      var e = '"' + this.key + '"';
      return (
        t &&
          (e = "<span class='symbol symbol_" + this.key + "'>" + e + "</span>"),
        e +
          ": [" +
          this.baseRules.rules
            .map(function (e) {
              var s = e.raw.replace(/&/g, "&amp;"),
                r =
                  '"' +
                  (s = (s = s.replace(/>/g, "&gt;")).replace(/</g, "&lt;")) +
                  '"';
              return (t && (r = "<span class='rule'>" + r + "</span>"), r);
            })
            .join(", ") +
          "]"
      );
    }),
    (m.prototype.clear = function () {
      for (var t in ((this.symbols = {}),
      (this.errors = []),
      (this.modifiers = {}),
      h))
        h.hasOwnProperty(t) && (this.modifiers[t] = h[t]);
    }),
    (m.prototype.loadFrom = function (t) {
      var e;
      (this.clear(), (e = void 0 !== t.symbols ? t.symbols : t));
      var s = Object.keys(e);
      this.symbolNames = [];
      for (var r = 0; r < s.length; r++) {
        var n = s[r];
        (this.symbolNames.push(n),
          (this.symbols[n] = new y(this, n)),
          this.symbols[n].loadFrom(e[n]));
      }
    }),
    (m.prototype.toHTML = function (t) {
      var e = Object.keys(this.symbols);
      this.symbolNames = [];
      for (var s = [], r = 0; r < e.length; r++) {
        var n = e[r],
          o = this.symbols[n];
        o && o.baseRules && s.push("    " + this.symbols[n].toHTML(t));
      }
      return "{<p>" + s.join(",</p><p>") + "</p>}";
    }),
    (m.prototype.toJSON = function () {
      var t = Object.keys(this.symbols);
      this.symbolNames = [];
      for (var e = [], s = 0; s < t.length; s++) {
        var r = t[s],
          n = this.symbols[r];
        n && n.baseRules && e.push("    " + this.symbols[r].toJSON());
      }
      return "{\n" + e.join(",\n") + "\n}";
    }),
    (m.prototype.select = function () {
      this.isSelected = !0;
    }),
    (m.prototype.deselect = function () {
      this.isSelected = !1;
    }),
    (m.prototype.mapSymbols = function (t) {
      var e = this.symbols;
      return this.symbolNames.map(function (s) {
        return t(e[s], s);
      });
    }),
    (m.prototype.applyToSymbols = function (t) {
      for (var e = 0; e < this.symbolNames.length; e++) {
        var s = this.symbolNames[e];
        t(this.symbols[s], s);
      }
    }),
    (m.prototype.addOrGetSymbol = function (t) {
      return (
        void 0 === this.symbols[t] && (this.symbols[t] = new y(t)),
        this.symbols[t]
      );
    }),
    (m.prototype.pushRules = function (t, e) {
      this.addOrGetSymbol(t).pushRules(e);
    }),
    (m.prototype.popRules = function (t, e) {
      var s = this.addOrGetSymbol(t);
      s.popRules();
      0 === s.ruleSets.length && (this.symbols[t] = void 0);
    }),
    (m.prototype.applyMod = function (t, e) {
      if (!this.modifiers[t])
        throw (console.log(this.modifiers), "Unknown mod: " + t);
      return this.modifiers[t](e);
    }),
    (m.prototype.getRule = function (t, e) {
      var s = this.symbols[t];
      if (void 0 === s)
        return (
          ((o = new n("{{" + t + "}}")).error = "Missing symbol " + t),
          o
        );
      var r = s.getRule();
      if (void 0 === r) {
        var o = new n("[" + t + "]");
        return (
          console.log(o.sections),
          (o.error = "Symbol " + t + " has no rule"),
          o
        );
      }
      return r;
    }),
    (m.prototype.expand = function (t) {
      var e = new c(this, t);
      return (e.expand(), e);
    }),
    (m.prototype.flatten = function (t) {
      var e = new c(this, t);
      return (e.expand(), e.childText);
    }),
    (m.prototype.analyze = function () {
      for (var t in ((this.symbolNames = []), this.symbols))
        this.symbols.hasOwnProperty(t) && this.symbolNames.push(t);
      for (var e = 0; e < this.symbolNames.length; e++)
        for (
          var s = this.symbolNames[e], r = this.symbols[s], n = 0;
          n < r.baseRules.length;
          n++
        ) {
          var o = r.baseRules[n];
          o.parsed = tracery.parse(o.raw);
        }
    }),
    (m.prototype.selectSymbol = function (t) {
      console.log(this);
      this.get(t);
    }),
    (tracery.createGrammar = function (t) {
      var e = new m();
      return (e.loadFrom(t), e);
    }),
    (tracery.test = function () {
      (console.log("=========================================="),
        console.log("test tracery"),
        tracery.testParse("", !1),
        tracery.testParse("fooo", !1),
        tracery.testParse("####", !1),
        tracery.testParse("#[]#[]##", !1),
        tracery.testParse("#someSymbol# and #someOtherSymbol#", !1),
        tracery.testParse("#someOtherSymbol.cap.pluralize#", !1),
        tracery.testParse(
          "#[#do some things#]symbol.mod[someotherthings[and a function]]#",
          !1,
        ),
        tracery.testParse("#[fxn][fxn][fxn[subfxn]]symbol[[fxn]]#", !1),
        tracery.testParse("#[fxn][#fxn#][fxn[#subfxn#]]symbol[[fxn]]#", !1),
        tracery.testParse("#hero# ate some #color# #animal.s#", !1),
        tracery.testParseTag("[action]symbol.mod1.mod2[postAction]", !1),
        tracery.testParse("#someSymbol# and #someOtherSymbol", !0),
        tracery.testParse("#[fxn][fxn][fxn[subfxn]]symbol[fxn]]#", !0),
        tracery.testParseTag("stuff[action]symbol.mod1.mod2[postAction]", !0),
        tracery.testParseTag("[action]symbol.mod1.mod2[postAction]stuff", !0),
        tracery.testParse("#hero# ate some #color# #animal.s#", !0),
        tracery.testParse(
          "#[#setPronouns#][#setOccupation#][hero:#name#]story#",
          !0,
        ));
    }));
})();
//# sourceMappingURL=/sm/5dc4b7e5033f1811b1bd7273d426075fe3f59222c8b7111bdb301de2ad66b652.map
