/**
 * End-to-End System Test — Garage Management System
 * Runs against the live Docker Compose stack (gateway on :8000).
 * Covers: health, auth, RBAC, vehicles, repair lifecycle, RabbitMQ-driven
 * notifications + auto-invoice, payments, AI chat, photo upload, negative tests.
 *
 * Usage: node e2e-system-test.mjs
 */

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:8000';
const services = {
  gateway: 'http://localhost:8000',
  identity: 'http://10.65.125.123:8001', // host loopback :8001 is shadowed by a local proxy
  repair: 'http://localhost:8002',
  payment: 'http://localhost:8003',
  notification: 'http://localhost:8004',
  ai: 'http://localhost:8005',
};

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function api(service, method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData || body instanceof Blob || Buffer.isBuffer(body)) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${service}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

/** Poll an async (RabbitMQ-driven) condition with timeout */
async function waitFor(name, fn, { timeoutMs = 20000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
      last = result;
    } catch (e) {
      last = `error: ${e.message}`;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor('${name}') timed out after ${timeoutMs}ms (last: ${JSON.stringify(last)})`);
}

// ---------------------------------------------------------------------------
async function main() {
  const stamp = Date.now();
  const customerEmail = `e2e-cust-${stamp}@test.com`;
  console.log(`\n=== END-TO-END SYSTEM TEST — ${new Date().toISOString()} ===`);
  console.log(`Gateway: ${GATEWAY}\n`);

  // ---------------- 1. Health checks (static infra) ----------------
  console.log('\n[1] HEALTH CHECKS');
  for (const [name, url] of Object.entries(services)) {
    const r = await api(url, 'GET', '/health').catch((e) => ({ status: 0, json: null, text: String(e) }));
    ok(`health ${name} (:${new URL(url).port})`, r.status === 200 && r.json?.status === 'ok');
  }
  const fe = await fetch('http://localhost:3000').then((r) => r.status).catch(() => 0);
  ok('health frontend (:3000)', fe === 200);

  // ---------------- 2. Registration & Login ----------------
  console.log('\n[2] AUTHENTICATION (identity service)');
  const reg = await api(GATEWAY, 'POST', '/api/auth/register', {
    body: { name: 'E2E Customer', email: customerEmail, phone: '+96170111222', password: 'e2epass123' },
  });
  ok('register customer via gateway → 201', reg.status === 201, `got ${reg.status}`);
  ok('registered role is CUSTOMER', reg.json?.data?.user?.role === 'CUSTOMER');
  const customerToken = reg.json?.data?.token;
  const customerId = reg.json?.data?.user?.id;
  ok('register returns JWT token', typeof customerToken === 'string' && customerToken.split('.').length === 3);

  const dupReg = await api(GATEWAY, 'POST', '/api/auth/register', {
    body: { name: 'Dup', email: customerEmail, phone: '+96170111222', password: 'e2epass123' },
  });
  ok('duplicate email rejected → 409', dupReg.status === 409, `got ${dupReg.status}`);

  const badReg = await api(GATEWAY, 'POST', '/api/auth/register', {
    body: { name: 'Bad', email: 'not-an-email', phone: 'x', password: '123' },
  });
  ok('invalid registration rejected → 400', badReg.status === 400, `got ${badReg.status}`);

  const custLogin = await api(GATEWAY, 'POST', '/api/auth/login', {
    body: { email: customerEmail, password: 'e2epass123' },
  });
  ok('customer login → 200', custLogin.status === 200, `got ${custLogin.status}`);

  const badLogin = await api(GATEWAY, 'POST', '/api/auth/login', {
    body: { email: customerEmail, password: 'wrongpassword' },
  });
  ok('wrong password rejected → 401', badLogin.status === 401, `got ${badLogin.status}`);

  const adminLogin = await api(GATEWAY, 'POST', '/api/auth/login', {
    body: { email: 'admin@garage.com', password: 'admin123' },
  });
  ok('admin login → 200', adminLogin.status === 200, `got ${adminLogin.status}`);
  ok('admin role is ADMIN', adminLogin.json?.data?.user?.role === 'ADMIN');
  const adminToken = adminLogin.json?.data?.token;

  // Register the admin as a notification recipient (so system events reach them)
  const adminReg = await api(GATEWAY, 'POST', '/api/notifications/admins/register', { token: adminToken });
  ok('admin registered as notification recipient → 200', adminReg.status === 200, `got ${adminReg.status}`);

  // customer must NOT be able to register as a notification recipient
  const custReg = await api(GATEWAY, 'POST', '/api/notifications/admins/register', { token: customerToken });
  ok('customer blocked from admin registration → 403', custReg.status === 403, `got ${custReg.status}`);

  const me = await api(GATEWAY, 'GET', '/api/users/me', { token: customerToken });
  ok('GET /api/users/me (customer) → 200', me.status === 200 && me.json?.data?.user?.email === customerEmail);

  const noAuth = await api(GATEWAY, 'GET', '/api/users/me');
  ok('GET /api/users/me without token → 401', noAuth.status === 401);
  ok('error code NO_TOKEN', noAuth.json?.error?.code === 'NO_TOKEN');

  const badToken = await api(GATEWAY, 'GET', '/api/users/me', { token: 'forged.token.value' });
  ok('GET /api/users/me with forged token → 401', badToken.status === 401);

  // ---------------- 3. Vehicles ----------------
  console.log('\n[3] VEHICLES (repair service)');
  const plateNumber = `E2E-${String(stamp).slice(-8)}`;
  const veh = await api(GATEWAY, 'POST', '/api/vehicles', {
    token: customerToken,
    body: { make: 'Toyota', model: 'Corolla', year: 2019, plateNumber, color: 'Blue' },
  });
  ok('add vehicle → 201', veh.status === 201, `got ${veh.status} ${veh.text?.slice(0, 120)}`);
  const vehicleId = veh.json?.data?.vehicle?.id ?? veh.json?.data?.id;
  ok('vehicle id returned', !!vehicleId);

  const dupVeh = await api(GATEWAY, 'POST', '/api/vehicles', {
    token: customerToken,
    body: { make: 'Toyota', model: 'Corolla', year: 2020, plateNumber, color: 'Red' },
  });
  ok('duplicate plate number rejected → 409 PLATE_EXISTS',
    dupVeh.status === 409 && dupVeh.json?.error?.code === 'PLATE_EXISTS',
    `got ${dupVeh.status} ${JSON.stringify(dupVeh.json?.error ?? {}).slice(0, 120)}`);

  const badVeh = await api(GATEWAY, 'POST', '/api/vehicles', {
    token: customerToken,
    body: { make: 'Toyota', model: 'Corolla', year: 1800, plateNumber: 'X', color: 'Red' },
  });
  ok('vehicle with invalid year rejected → 400', badVeh.status === 400, `got ${badVeh.status}`);

  const vehList = await api(GATEWAY, 'GET', '/api/vehicles', { token: customerToken });
  ok('list own vehicles contains the new vehicle',
    vehList.status === 200 && (vehList.json?.data?.vehicles ?? vehList.json?.data)?.some?.((v) => v.id === vehicleId));

  // ---------------- 4. Repair lifecycle ----------------
  console.log('\n[4] REPAIR LIFECYCLE (repair service + events)');
  const today = new Date().toISOString().slice(0, 10);
  const rep = await api(GATEWAY, 'POST', '/api/repairs', {
    token: customerToken,
    body: { vehicleId, problemDescription: 'Engine overheats on highway', handoverDate: today, handoverTime: '09:00' },
  });
  ok('create repair → 201', rep.status === 201, `got ${rep.status} ${rep.text?.slice(0, 150)}`);
  const repairId = rep.json?.data?.repairOrder?.id ?? rep.json?.data?.id;
  ok('repair starts as SUBMITTED',
    (rep.json?.data?.repairOrder?.status ?? rep.json?.data?.status) === 'SUBMITTED');

  const repList = await api(GATEWAY, 'GET', '/api/repairs', { token: customerToken });
  ok('customer sees own repairs', repList.status === 200 &&
    (repList.json?.data?.repairOrders ?? [])?.some?.((r) => r.id === repairId));

  const repDetail = await api(GATEWAY, 'GET', `/api/repairs/${repairId}`, { token: customerToken });
  ok('repair detail → 200', repDetail.status === 200);

  // customer cannot update (admin-only)
  const custPatch = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: customerToken,
    body: { status: 'COMPLETED' },
  });
  ok('customer PATCH repair forbidden → 403', custPatch.status === 403, `got ${custPatch.status}`);

  // negative: invalid transition SUBMITTED → COMPLETED
  const badTransition = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: adminToken,
    body: { status: 'COMPLETED' },
  });
  ok('invalid transition SUBMITTED→COMPLETED rejected → 400',
    badTransition.status === 400 && badTransition.json?.error?.code === 'INVALID_STATUS_TRANSITION',
    `got ${badTransition.status}`);

  // lifecycle: UNDER_REVIEW → DIAGNOSED (publishes repair.diagnosed)
  const diag = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: adminToken,
    body: {
      status: 'UNDER_REVIEW',
      diagnosis: 'Faulty thermostat and clogged radiator',
      requiredWork: 'Replace thermostat, flush radiator',
      estimatedCost: 145.5,
      expectedPickupDate: today,
    },
  });
  ok('admin UNDER_REVIEW → 200', diag.status === 200, `got ${diag.status}`);

  const diag2 = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: adminToken,
    body: { status: 'DIAGNOSED' },
  });
  ok('admin → DIAGNOSED → 200', diag2.status === 200, `got ${diag2.status}`);

  // ---------------- 5. Async: auto-invoice (payment service consumes repair.diagnosed) ----------------
  console.log('\n[5] EVENT-DRIVEN AUTO-INVOICE (RabbitMQ: repair.diagnosed → payment)');
  const invoice = await waitFor('auto-created invoice', async () => {
    const r = await api(GATEWAY, 'GET', `/api/invoices/customer/${customerId}`, { token: customerToken });
    const list = r.json?.data?.invoices ?? r.json?.data ?? [];
    const found = (Array.isArray(list) ? list : []).find((i) => i.repairOrderId === repairId);
    return found || null;
  });
  ok('invoice auto-created after diagnosis', !!invoice);
  ok('invoice amount = estimatedCost (145.5)', invoice.amount === 145.5, `amount=${invoice.amount}`);
  ok('invoice status PENDING', invoice.status === 'PENDING');
  const invoiceId = invoice.id;

  const otherInvoices = await api(GATEWAY, 'GET', `/api/invoices/customer/${adminLogin.json?.data?.user?.id}`, { token: customerToken });
  ok('customer cannot view another customer invoices → 403', otherInvoices.status === 403, `got ${otherInvoices.status}`);

  // ---------------- 6. Pre-payment lifecycle + PAYMENT GATE ----------------
  console.log('\n[6] PAYMENT GATE (admin cannot complete before customer pays)');
  for (const status of ['APPROVED', 'IN_PROGRESS', 'READY_FOR_PICKUP']) {
    const r = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, { token: adminToken, body: { status } });
    ok(`admin transition → ${status}`, r.status === 200, `got ${r.status}`);
  }

  // invoice exists (auto-created on diagnosis) but is UNPAID → COMPLETED must be blocked
  const earlyComplete = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: adminToken,
    body: { status: 'COMPLETED' },
  });
  ok('admin COMPLETED blocked while invoice unpaid → 400 PAYMENT_REQUIRED',
    earlyComplete.status === 400 && earlyComplete.json?.error?.code === 'PAYMENT_REQUIRED',
    `got ${earlyComplete.status} ${JSON.stringify(earlyComplete.json?.error ?? {}).slice(0, 120)}`);
  const afterBlock = await api(GATEWAY, 'GET', `/api/repairs/${repairId}`, { token: customerToken });
  ok('status unchanged after blocked completion',
    (afterBlock.json?.data?.repairOrder?.status) === 'READY_FOR_PICKUP');

  // ---------------- 7. Payment ----------------
  console.log('\n[7] PAYMENTS (payment service)');
  const invDetail = await api(GATEWAY, 'GET', `/api/invoices/${invoiceId}`, { token: customerToken });
  ok('get invoice detail → 200', invDetail.status === 200);

  const pay = await api(GATEWAY, 'POST', `/api/invoices/${invoiceId}/pay`, { token: customerToken });
  ok('pay invoice → 200', pay.status === 200, `got ${pay.status} ${pay.text?.slice(0, 150)}`);
  ok('paid status is PAID', pay.json?.data?.invoice?.status === 'PAID' || pay.json?.data?.status === 'PAID');

  const payAgain = await api(GATEWAY, 'POST', `/api/invoices/${invoiceId}/pay`, { token: customerToken });
  ok('double payment rejected → 409', payAgain.status === 409, `got ${payAgain.status}`);

  // ---------------- 8. Completion allowed after payment ----------------
  console.log('\n[8] COMPLETION AFTER PAYMENT');
  const complete = await api(GATEWAY, 'PATCH', `/api/repairs/${repairId}`, {
    token: adminToken,
    body: { status: 'COMPLETED' },
  });
  ok('admin COMPLETED allowed after payment → 200', complete.status === 200, `got ${complete.status}`);
  ok('repair status is COMPLETED', complete.json?.data?.repairOrder?.status === 'COMPLETED');

  // poll notifications for the customer; events: created, diagnosed, started, ready, completed, payment.completed
  console.log('\n[9] NOTIFICATIONS (RabbitMQ → notification service)');
  const notifs = await waitFor('all 6 notifications', async () => {
    const r = await api(GATEWAY, 'GET', '/api/notifications', { token: customerToken });
    const list = r.json?.data?.notifications ?? r.json?.data ?? [];
    if (!Array.isArray(list)) return null;
    const titles = list.map((n) => n.title);
    const needed = ['Repair Request Received', 'Vehicle Diagnosed', 'Repair In Progress', 'Vehicle Ready', 'Repair Completed', 'Payment Successful'];
    return needed.every((t) => titles.includes(t)) ? list : null;
  });
  ok('all 6 lifecycle notifications received via RabbitMQ', Array.isArray(notifs) && notifs.length >= 6);

  const paymentNotif = notifs.find((n) => n.title === 'Payment Successful');
  ok('payment notification includes amount', paymentNotif?.message?.includes('€145.5'), `msg="${paymentNotif?.message}"`);

  const unread = await api(GATEWAY, 'PATCH', `/api/notifications/${notifs[0].id}/read`, { token: customerToken });
  ok('mark notification read → 200', unread.status === 200, `got ${unread.status}`);

  // admin-facing notifications: new repair request + payment received
  const adminNotifs = await waitFor('admin notifications', async () => {
    const r = await api(GATEWAY, 'GET', '/api/notifications', { token: adminToken });
    const list = r.json?.data?.notifications ?? [];
    if (!Array.isArray(list)) return null;
    const titles = list.map((n) => n.title);
    return titles.includes('New Repair Request') && titles.includes('Payment Received') ? list : null;
  });
  ok('admin notified of new repair request', adminNotifs.some((n) => n.title === 'New Repair Request'));
  ok('admin notified of payment received',
    adminNotifs.some((n) => n.title === 'Payment Received' && n.message?.includes('€145.5')));

  // ---------------- 10. Photo upload ----------------
  console.log('\n[10] PHOTO UPLOAD (repair service)');
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d4944415478da63fcffff3f030005fe02fea72d7f640000000049454e44ae426082', 'hex');
  const form = new FormData();
  form.append('photos', new Blob([png], { type: 'image/png' }), 'damage.png');
  const up = await api(GATEWAY, 'POST', `/api/repairs/${repairId}/photos`, { token: customerToken, body: form });
  ok('upload photo → 201', up.status === 200 || up.status === 201, `got ${up.status} ${up.text?.slice(0, 120)}`);

  const afterUpload = await api(GATEWAY, 'GET', `/api/repairs/${repairId}`, { token: customerToken });
  const photos = afterUpload.json?.data?.repairOrder?.photos ?? afterUpload.json?.data?.photos ?? [];
  ok('photo persisted on repair', Array.isArray(photos) && photos.length >= 1);

  // ---------------- 11. AI service ----------------
  console.log('\n[11] AI ASSISTANT (ai-service → repair-service)');
  const ai = await api(GATEWAY, 'POST', '/api/ai/chat', {
    token: customerToken,
    body: { repairOrderId: repairId, question: 'What is wrong with my car and how will it be fixed?' },
  });
  ok('AI chat → 200', ai.status === 200, `got ${ai.status} ${ai.text?.slice(0, 150)}`);
  ok('AI answer is non-empty', (ai.json?.data?.answer ?? ai.json?.data?.response ?? '').length > 10,
    `answer="${JSON.stringify(ai.json).slice(0, 100)}"`);

  const aiOther = await api(GATEWAY, 'POST', '/api/ai/chat', {
    token: customerToken,
    body: { repairOrderId: '00000000-0000-0000-0000-000000000000', question: 'hello' },
  });
  ok('AI refuses foreign/nonexistent repair', aiOther.status !== 200 || aiOther.json?.success === false, `got ${aiOther.status}`);

  // ---------------- 12. Dead routes / contract gaps ----------------
  console.log('\n[12] API CONTRACT CHECKS (documented endpoints)');
  const deadPayments = await api(GATEWAY, 'GET', '/api/payments/invoices', { token: adminToken });
  ok('documented /api/payments/* actually serves 404 (gateway route is dead) — KNOWN ISSUE',
    deadPayments.status === 404, `got ${deadPayments.status}`);

  const adminInvoiceList = await api(GATEWAY, 'GET', '/api/invoices', { token: adminToken });
  ok('admin GET /api/invoices (list all) not implemented — KNOWN ISSUE',
    adminInvoiceList.status === 404, `got ${adminInvoiceList.status}`);

  // ---------------- Summary ----------------
  console.log('\n==========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('==========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E fatal:', e);
  process.exit(1);
});
