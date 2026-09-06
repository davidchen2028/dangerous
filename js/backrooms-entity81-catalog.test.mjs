import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseEntity81CabinAction,
  expressionLooksLikeArithmeticOrFactorial,
  listEntity81Destinations,
  listEntity81Expressions,
  pickEntity81Buttons,
} from "./backrooms-entity81-catalog.js";

test("Entity 81 destinations are numeric implemented levels only", () => {
  const dests = listEntity81Destinations();
  assert.ok(dests.some((d) => d.number === 1 && d.pass === "clip"));
  assert.ok(dests.some((d) => d.number === 4 && d.page === "backrooms-level4.html"));
  assert.equal(dests.some((d) => d.levelId === "l110"), false);
  assert.equal(dests.some((d) => d.levelId === "l6_1"), false);
  assert.equal(dests.some((d) => String(d.levelId).startsWith("c")), false);
  assert.equal(dests.some((d) => /c1290|129/.test(d.page)), false);
});

test("button labels are trig or log identities, never arithmetic or factorial", () => {
  const samples = [0, 1, 4, 5, 6, 11, 37, 363];
  for (const n of samples) {
    const exprs = listEntity81Expressions(n);
    assert.ok(exprs.length >= 8, "n=" + n);
    for (const expr of exprs) {
      assert.equal(expressionLooksLikeArithmeticOrFactorial(expr), false, expr);
      assert.doesNotMatch(expr, /tan\(\s*π\/2\s*\)/);
      assert.doesNotMatch(expr, /!/);
      const isTrig = /sin|cos|tan|sec|csc|cot/.test(expr);
      const isLog = /log|lg|ln/.test(expr);
      assert.ok(isTrig || isLog, expr);
    }
  }
  assert.ok(listEntity81Expressions(1).includes("tan(π/4)"));
  assert.ok(listEntity81Expressions(1).includes("2sin(π/6)"));
  assert.ok(listEntity81Expressions(1).includes("ln(e)"));
});

test("button sets stay within 4–20 and keep the host floor", () => {
  const a = pickEntity81Buttons("clip", 81);
  const b = pickEntity81Buttons("clip", 81);
  assert.deepEqual(a.map((x) => x.expr), b.map((x) => x.expr));
  assert.ok(a.length >= 4 && a.length <= 20);
  assert.ok(a.some((btn) => btn.number === 1 && btn.isCurrent));
  const luxury = pickEntity81Buttons("l5", 99);
  assert.ok(luxury.some((btn) => btn.number === 5 && btn.isCurrent));
});

test("cabin actions lock on death, UI, and current-floor buttons", () => {
  const go = { number: 4, isCurrent: false };
  const here = { number: 1, isCurrent: true };
  assert.equal(chooseEntity81CabinAction("e81_button", go, {}), "travel");
  assert.equal(chooseEntity81CabinAction("e81_button", here, {}), "stay");
  assert.equal(chooseEntity81CabinAction("e81_door", null, {}), "return_origin");
  assert.equal(chooseEntity81CabinAction("e81_button", go, { uiBlocked: true }), null);
  assert.equal(chooseEntity81CabinAction("e81_button", go, { transitionLock: true }), null);
  assert.equal(chooseEntity81CabinAction("e81_button", go, { dead: true }), null);
});
