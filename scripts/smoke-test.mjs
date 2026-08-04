const base = "http://localhost:3000";

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "owner@sunset-tours.example",
    password: "demo1234",
  }),
});

const cookie = loginRes.headers.getSetCookie?.().join("; ") ?? loginRes.headers.get("set-cookie");
console.log("login", loginRes.status, await loginRes.json());

const simRes = await fetch(`${base}/api/simulate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookie ?? "",
  },
  body: JSON.stringify({
    channel: "whatsapp",
    customerHandle: "+628111",
    body: "Hi, where is the meeting point for the Uluwatu sunset tour and what should I bring?",
  }),
});

const sim = await simRes.json();
console.log("simulate", simRes.status, JSON.stringify(sim.result ?? sim, null, 2));

const escRes = await fetch(`${base}/api/simulate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookie ?? "",
  },
  body: JSON.stringify({
    channel: "email",
    customerHandle: "guest@example.com",
    subject: "Refund",
    body: "I need a full refund for my booking right now",
  }),
});
const esc = await escRes.json();
console.log("escalate", escRes.status, JSON.stringify(esc.result ?? esc, null, 2));

const digestRes = await fetch(`${base}/api/digest`, {
  method: "POST",
  headers: { Cookie: cookie ?? "" },
});
console.log("digest", digestRes.status, await digestRes.json().then((d) => ({
  auto: d.payload?.autoResolvedCount,
  esc: d.payload?.escalatedCount,
})));
