import test from "node:test";
import assert from "node:assert/strict";
import { THRESHOLDS, classify, worstOf } from "../lib/thresholds.js";

test("classify returns green below yellowAt", () => {
	assert.equal(classify(0.1, THRESHOLDS["retry-rate-per-turn"]), "green");
});

test("classify returns yellow at or above yellowAt and below redAt", () => {
	assert.equal(classify(0.5, THRESHOLDS["retry-rate-per-turn"]), "yellow");
	assert.equal(classify(0.99, THRESHOLDS["retry-rate-per-turn"]), "yellow");
});

test("classify returns red at or above redAt", () => {
	assert.equal(classify(1.0, THRESHOLDS["retry-rate-per-turn"]), "red");
	assert.equal(classify(2.5, THRESHOLDS["retry-rate-per-turn"]), "red");
});

test("classify returns green for non-numeric input", () => {
	assert.equal(classify(Number.NaN, THRESHOLDS["retry-rate-per-turn"]), "green");
	assert.equal(classify(undefined, THRESHOLDS["retry-rate-per-turn"]), "green");
});

test("worstOf returns the worst verdict in the record", () => {
	assert.equal(worstOf({ a: "green", b: "red", c: "yellow" }), "red");
	assert.equal(worstOf({ a: "green", b: "yellow" }), "yellow");
	assert.equal(worstOf({ a: "green", b: "green" }), "green");
	assert.equal(worstOf({}), "green");
});
