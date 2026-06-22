(function (globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.XeraTime = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DEFAULT_TIME_ZONE = "Europe/Istanbul";

  function toDateValue(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function todayDateValue() {
    return toDateValue(new Date());
  }

  return { DEFAULT_TIME_ZONE, toDateValue, todayDateValue };
});
