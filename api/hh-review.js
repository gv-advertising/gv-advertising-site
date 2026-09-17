// /api/hh-review — the free directory-review form on /home-health-hospice.
// Validates, drops honeypot hits, inserts one row into public.site_requests in the
// gv-outreach Supabase project. The publishable (anon) key is public by design: RLS on
// site_requests lets anon INSERT and nothing else. Never put a service_role key in this repo.

const SUPABASE_URL = 'https://arxvqugtdhudbihwlyeb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SaMUADJubPfZL-3xMET-Xg_ZAXFfah3';
const LICENSE_TYPES = ['HH', 'HP', 'BOTH'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const body = parseBody(req);
  if (!body) {
    res.status(400).json({ ok: false, error: 'invalid_json' });
    return;
  }

  // Honeypot: real visitors never see the field. A bot that filled it gets a quiet 200.
  if (text(body.website, 10) !== '') {
    res.status(200).json({ ok: true });
    return;
  }

  const agencyName = text(body.agency_name, 200);
  const email = text(body.email, 254).toLowerCase();
  const licenseType = text(body.license_type, 10).toUpperCase();
  const facid = text(body.facid, 40);
  const sourcePage = text(body.source_page, 200) || '/home-health-hospice';
  const userAgent = text(req.headers['user-agent'], 500);

  const errors = [];
  if (!agencyName) errors.push('agency_name');
  if (!email || !EMAIL_PATTERN.test(email)) errors.push('email');
  if (!LICENSE_TYPES.includes(licenseType)) errors.push('license_type');
  if (errors.length > 0) {
    res.status(400).json({ ok: false, error: 'invalid_fields', fields: errors });
    return;
  }

  const row = {
    agency_name: agencyName,
    email,
    license_type: licenseType,
    facid: facid || null,
    source_page: sourcePage,
    user_agent: userAgent || null,
  };

  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/site_requests', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('site_requests insert failed', response.status, detail);
      res.status(502).json({ ok: false, error: 'insert_failed' });
      return;
    }
  } catch (error) {
    console.error('site_requests insert error', error);
    res.status(502).json({ ok: false, error: 'insert_failed' });
    return;
  }

  res.status(200).json({ ok: true });
};
