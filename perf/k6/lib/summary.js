import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.4/index.js";

/**
 * Shared end-of-test summary: always print the standard table; additionally
 * write the raw JSON when K6_RESULTS_DIR is set (perf/run.sh mounts
 * perf/results there and names the run).
 */
export function makeHandleSummary() {
  return function (data) {
    const out = { stdout: textSummary(data, { indent: " ", enableColors: true }) };
    if (__ENV.K6_RESULTS_DIR) {
      const name = __ENV.K6_RUN_NAME || "run";
      out[`${__ENV.K6_RESULTS_DIR}/${name}.json`] = JSON.stringify(data, null, 2);
    }
    return out;
  };
}
