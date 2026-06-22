const test = require("node:test");
const assert = require("node:assert/strict");
const serverTime = require("../server/time");
const browserTime = require("../public/time");

for (const [name, time] of Object.entries({ server: serverTime, browser: browserTime })) {
  test(`${name} date uses the Istanbul calendar day`, () => {
    assert.equal(time.toDateValue("2026-06-21T20:30:00.000Z"), "2026-06-21");
    assert.equal(time.toDateValue("2026-06-21T21:30:00.000Z"), "2026-06-22");
  });

  test(`${name} date preserves invalid input as empty`, () => {
    assert.equal(time.toDateValue("not-a-date"), "");
  });
}
