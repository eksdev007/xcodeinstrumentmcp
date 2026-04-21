import { describe, expect, test } from "vitest";

import { parseTraceToc } from "../../src/parsers/trace-toc-parser.js";

describe("Trace TOC parser", () => {
  test("discovers the time-profile table and signpost-like schemas from exported TOC XML", () => {
    const tocXml = `<?xml version="1.0"?>
<trace-toc>
  <run number="1">
    <processes>
      <process name="kernel.release.t6000" pid="0" path="/System/Library/Kernels/kernel.release.t6000"/>
      <process name="AppName" pid="10061" path="/tmp/app"/>
    </processes>
    <data>
      <table schema="time-profile" target-pid="SINGLE"/>
      <table schema="os-signpost" category="PointsOfInterest"/>
      <table schema="region-of-interest" target-pid="SINGLE"/>
    </data>
  </run>
</trace-toc>`;

    const toc = parseTraceToc(tocXml);

    expect(toc.runs).toHaveLength(1);
    expect(toc.runs[0]?.processes[1]?.name).toBe("AppName");
    expect(toc.runs[0]?.tables.map((table) => table.schema)).toEqual([
      "time-profile",
      "os-signpost",
      "region-of-interest",
    ]);
  });
});
