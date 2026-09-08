import { describe, it, expect } from "vitest";
import { resetDb, call, makeUser, actAs, session } from "./helpers";
import { GET as geoSearch } from "@/app/api/geo/search/route";
import { GET as geoReverse } from "@/app/api/geo/reverse/route";

describe("Nominatim proxy (/api/geo/*)", () => {
  it("ავტორიზაციის გარეშე → 401", async () => {
    actAs(null);
    expect((await call(geoSearch, { query: { q: "თბილისი" } })).status).toBe(401);
  });

  it("მოკლე query → ცარიელი results (Nominatim-ს არ ეხება)", async () => {
    await resetDb();
    actAs(session(await makeUser("CUSTOMER")));
    const r = await call(geoSearch, { query: { q: "თბ" } });
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it("reverse — არასწორი კოორდინატი → 400", async () => {
    await resetDb();
    actAs(session(await makeUser("CUSTOMER")));
    const r = await call(geoReverse, { query: { lat: "abc", lng: "44" } });
    expect(r.status).toBe(400);
  });
});
