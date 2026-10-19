// End-to-end flow test against a running dev server (`npx alchemy dev`).
// Drives the real TanStack Start server-function protocol (seroval + /_serverFn/)
// using the app's own client RPC layer, so it exercises auth, D1, signing, and
// PDF data exactly like a browser would.
//
// Usage: node scripts/e2e-flow.mjs [baseUrl]   (default http://localhost:3002)

const BASE = (process.argv[2] ?? "http://localhost:3002").replace(/\/$/, "");

process.env.TSS_SERVER_FN_BASE = `${BASE}/_serverFn/`;

const { createClientRpc } = await import("@tanstack/start-client-core/client-rpc");
const { runWithStartContext } = await import("@tanstack/start-storage-context");

let cookie = null;
let failures = 0;

// fetch wrapper: sends the session cookie, captures set-cookie responses
const fetchWithSession = async (url, init) => {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(url, { ...init, headers });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    if (c.startsWith("logbook_session=")) {
      cookie = c.split(";")[0];
    }
  }
  return res;
};

const rpc = async (id, args) => {
  const fn = createClientRpc(id);
  const payload = await runWithStartContext({ startOptions: {} }, () =>
    fn({ fetch: fetchWithSession, method: fnMethods[id] ?? "GET", ...args }),
  );
  // The server wraps successes as { result } and failures as { error }.
  // createServerFn's client executor throws the error; emulate that here.
  if (payload && typeof payload === "object" && "error" in payload) throw payload.error;
  return payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
};

// Pull the compiled client stubs from Vite to learn each fn's wire ID and method.
const fnIds = {};
const fnMethods = {};
for (const mod of ["auth", "weeks", "settings-fns"]) {
  const src = await (await fetchWithSession(`${BASE}/src/server/${mod}.ts`)).text();
  for (const [, name, method, id] of src.matchAll(
    /export const (\w+) = createServerFn\(\{ method: "(\w+)" \}\)\.handler\(createClientRpc\("([^"]+)"\)\)/g,
  )) {
    fnIds[name] = id;
    fnMethods[id] = method;
  }
}

const check = (label, cond, extra = "") => {
  if (cond) {
    console.log(`PASS  ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

const expectError = async (label, promise, needle) => {
  try {
    await promise;
    check(label, false, "expected an error but the call succeeded");
  } catch (e) {
    const msg = String(e?.message ?? e);
    check(label, !needle || msg.toLowerCase().includes(needle.toLowerCase()), msg.slice(0, 140));
  }
};

// 1x1 transparent PNG
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const EMAIL = "alex@dev.test";
const PASSWORD = "devpassword1";

// ---------- auth ----------
check("hasAccount is false initially", (await rpc(fnIds.hasAccount)) === false);

await expectError(
  "register rejects a short password",
  rpc(fnIds.register, {
    data: {
      email: EMAIL, password: "short", name: "Alex", studentName: "s", studentNim: "n",
      studyProgram: "p", partnerName: "m", fieldSupervisorName: "f", academicAdvisorName: "d",
    },
  }),
);

const reg = await rpc(fnIds.register, {
  data: {
    email: EMAIL,
    password: PASSWORD,
    name: "Alexander Agung Raya",
    studentName: "Alexander Agung Raya",
    studentNim: "2341720040",
    studyProgram: "Sarjana Terapan Teknik Informatika",
    partnerName: "PT. Studio Karya Semesta",
    fieldSupervisorName: "Muhammad Ali Zulfikar",
    academicAdvisorName: "Rokhimatul Wakhidah S.Pd., M.T.",
  },
});
check("register succeeds", reg?.ok === true, `cookie ${cookie ? "captured" : "MISSING"}`);

await expectError(
  "second register is rejected",
  rpc(fnIds.register, {
    data: {
      email: "x@y.test", password: PASSWORD, name: "X", studentName: "s", studentNim: "n",
      studyProgram: "p", partnerName: "m", fieldSupervisorName: "f", academicAdvisorName: "d",
    },
  }),
  "already exists",
);

const user = await rpc(fnIds.getSessionUser);
check("session resolves the registered user", user?.email === EMAIL, JSON.stringify(user?.email));

await expectError("login rejects a wrong password", rpc(fnIds.login, { data: { email: EMAIL, password: "wrongpass1" } }));
check("login succeeds", (await rpc(fnIds.login, { data: { email: EMAIL, password: PASSWORD } }))?.ok === true);

// ---------- settings ----------
const settings = await rpc(fnIds.getSettings);
check(
  "settings seeded from the Polinema template",
  settings?.institutionLines?.length === 4 && settings?.logoPng === "/img/polinema-header-logo.png" &&
    settings?.fontHeading === "Times New Roman" && settings?.fontBody === "Calibri" &&
    settings?.studentNim === "2341720040",
  JSON.stringify({ fonts: [settings?.fontHeading, settings?.fontBody] }),
);

await rpc(fnIds.updateSettings, { data: { ...settings, fontHeading: "Calibri", studentSignaturePng: null } });
check(
  "updateSettings persists a font change",
  (await rpc(fnIds.getSettings))?.fontHeading === "Calibri",
);
await rpc(fnIds.updateSettings, { data: { ...settings, studentSignaturePng: null } });

// ---------- auth guard ----------
cookie = null;
await expectError("listWeeks requires a session", rpc(fnIds.listWeeks));
const restored = await rpc(fnIds.getSessionUser);
check("no session without cookie", restored === null);
// restore
await rpc(fnIds.login, { data: { email: EMAIL, password: PASSWORD } });

// ---------- weeks & entries ----------
check("weeks list starts empty", (await rpc(fnIds.listWeeks)).weeks.length === 0);

await expectError(
  "createWeek rejects a bad date",
  rpc(fnIds.createWeek, { data: { label: "w0", startDate: "19-10-2026" } }),
);

const { id: weekId } = await rpc(fnIds.createWeek, { data: { label: "26_10_w3", startDate: "2026-10-19" } });
check("createWeek returns an id", typeof weekId === "string" && weekId.length > 10);

const listed = (await rpc(fnIds.listWeeks)).weeks;
check(
  "listWeeks shows the week with 3 pending signature roles",
  listed.length === 1 && listed[0].entryCount === 0 &&
    ["student", "field_supervisor", "academic_advisor"].every((r) => listed[0].signatures[r]?.status === "pending"),
);

const e1 = await rpc(fnIds.saveEntry, {
  data: { weekId, entryDate: "2026-10-19", clockIn: "08:00", clockOut: "12:00", activity: "deploy worker" },
});
const e2 = await rpc(fnIds.saveEntry, {
  data: { weekId, entryDate: "2026-10-19", clockIn: "13:00", clockOut: "17:00", activity: "membuat REST API" },
});
check("two entries saved", typeof e1?.id === "string" && typeof e2?.id === "string");

const updated = await rpc(fnIds.saveEntry, {
  data: { weekId, id: e1.id, entryDate: "2026-10-19", clockIn: "08:30", clockOut: "12:30", activity: "deploy worker ke cloudflare" },
});
check("entry edit keeps its id", updated?.id === e1.id);

let week = await rpc(fnIds.getWeek, { data: { id: weekId } });
check(
  "getWeek returns sorted entries with the edited values",
  week?.entries?.length === 2 && week.entries[0].activity === "deploy worker ke cloudflare" &&
    week.entries[0].clockIn === "08:30",
  `count ${week?.entries?.length}`,
);

// ---------- AI refine (dev key is a placeholder → must fail gracefully) ----------
await expectError(
  "AI refine fails gracefully with a placeholder key",
  rpc(fnIds.refineEntryActivity, { data: { entryId: e1.id, text: "deploy worker" } }),
);
check("worker still healthy after AI error", (await rpc(fnIds.getWeek, { data: { id: weekId } })) != null);

// ---------- signing ----------
const tokenOf = (role) => week.signatures.find((s) => s.role === role)?.token;

const signReq = await rpc(fnIds.getSignRequest, { data: { token: tokenOf("student") } });
check(
  "sign link (no session) exposes only display data",
  signReq?.role === "student" && signReq?.week?.label === "26_10_w3" &&
    signReq?.setting?.studentName === "Alexander Agung Raya" && signReq?.signatures?.student?.token === undefined,
);

await expectError("signing rejects a bogus token", rpc(fnIds.signWeek, { data: { token: "nope", signerName: "A", signaturePng: TINY_PNG } }));

check(
  "student signs",
  (await rpc(fnIds.signWeek, { data: { token: tokenOf("student"), signerName: "Alexander Agung Raya", signaturePng: TINY_PNG } }))?.ok === true,
);

const afterStudent = await rpc(fnIds.saveEntry, {
  data: { weekId, entryDate: "2026-10-20", clockIn: "08:00", clockOut: "12:00", activity: "still editable after student signs" },
});
check("entries stay editable after only the student signed", typeof afterStudent?.id === "string");

check(
  "field supervisor signs",
  (await rpc(fnIds.signWeek, { data: { token: tokenOf("field_supervisor"), signerName: "Muhammad Ali Zulfikar", signaturePng: TINY_PNG } }))?.ok === true,
);

await expectError(
  "entries are locked once a supervisor signed",
  rpc(fnIds.saveEntry, { data: { weekId, entryDate: "2026-10-21", clockIn: "08:00", clockOut: "12:00", activity: "x" } }),
  "locked",
);

await expectError(
  "student signature cannot be reset after a supervisor signed",
  rpc(fnIds.resetSignature, { data: { weekId, role: "student" } }),
);

check(
  "academic advisor signs",
  (await rpc(fnIds.signWeek, { data: { token: tokenOf("academic_advisor"), signerName: "Rokhimatul Wakhidah S.Pd., M.T.", signaturePng: TINY_PNG } }))?.ok === true,
);

await expectError("a signed week cannot be signed again", rpc(fnIds.signWeek, { data: { token: tokenOf("student"), signerName: "A", signaturePng: TINY_PNG } }));
await expectError("a signed week cannot be deleted", rpc(fnIds.deleteWeek, { data: { id: weekId } }));

// ---------- PDF data ----------
const pdf = await rpc(fnIds.getPdfData, { data: { weekIds: [weekId] } });
check(
  "PDF data carries the full template payload",
  pdf?.settings?.studentNim === "2341720040" && pdf?.weeks?.length === 1 &&
    pdf.weeks[0].entries.length === 3 &&
    pdf.weeks[0].signatures.academic_advisor?.status === "signed" &&
    typeof pdf.weeks[0].signatures.academic_advisor?.signaturePng === "string" &&
    pdf.weeks[0].signatures.academic_advisor.token === undefined,
  `${pdf?.weeks?.[0]?.entries?.length} entries, 3 signatures`,
);

// unlock path (advisor also signed, so reset it too)
check("supervisor signature resets", (await rpc(fnIds.resetSignature, { data: { weekId, role: "field_supervisor" } }))?.ok === true);
check("advisor signature resets", (await rpc(fnIds.resetSignature, { data: { weekId, role: "academic_advisor" } }))?.ok === true);
const unlocked = await rpc(fnIds.saveEntry, {
  data: { weekId, entryDate: "2026-10-21", clockIn: "09:00", clockOut: "15:00", activity: "editable again after reset" },
});
check("editable again after supervisor reset", typeof unlocked?.id === "string");

// restore full signed state
await rpc(fnIds.signWeek, { data: { token: tokenOf("field_supervisor"), signerName: "Muhammad Ali Zulfikar", signaturePng: TINY_PNG } });
await rpc(fnIds.signWeek, { data: { token: tokenOf("academic_advisor"), signerName: "Rokhimatul Wakhidah S.Pd., M.T.", signaturePng: TINY_PNG } });
week = await rpc(fnIds.getWeek, { data: { id: weekId } });
check(
  "week ends fully signed",
  week.signatures.every((s) => s.status === "signed"),
);

// ---------- SSR pages with the session ----------
cookie = null;
await rpc(fnIds.login, { data: { email: EMAIL, password: PASSWORD } });
for (const path of ["/app", "/app/weeks", `/app/weeks/${weekId}`, "/app/settings"]) {
  const res = await fetchWithSession(`${BASE}${path}`, { headers: { accept: "text/html" } });
  const html = await res.text();
  check(`GET ${path} renders`, res.status === 200 && html.includes("Log Book"), `status ${res.status}`);
}
const signPage = await fetch(`${BASE}/sign/${tokenOf("student")}`, { headers: { accept: "text/html" } });
check("GET /sign/<token> renders publicly", signPage.status === 200, `status ${signPage.status}`);

check("logout clears the session", (await rpc(fnIds.logout))?.ok === true);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
