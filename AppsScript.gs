const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
const AISENSY_CAMPAIGN_NAME = 'piles_lead_first_touch';
const OTP_LIFETIME_SECONDS = 300;
const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const requestId = String(params.requestId || '');
  if (!/^[A-Za-z0-9-]{1,80}$/.test(requestId)) {
    return bridgeResponse_({ source: 'piles-otp-backend', requestId: requestId, ok: false, message: 'Invalid request.' });
  }

  try {
    let result;
    if (params.action === 'sendOtp') {
      result = sendOtp_(params);
    } else if (params.action === 'verifyOtp') {
      result = verifyOtp_(params);
    } else {
      throw publicError_('Unsupported request.');
    }

    return bridgeResponse_({
      source: 'piles-otp-backend',
      requestId: requestId,
      ok: true,
      message: result.message
    });
  } catch (error) {
    console.error(error);
    return bridgeResponse_({
      source: 'piles-otp-backend',
      requestId: requestId,
      ok: false,
      message: error.publicMessage || 'Request failed. Please try again.'
    });
  }
}

function sendOtp_(params) {
  const name = String(params.name || '').trim().slice(0, 120);
  const phone = normalizePhone_(params.phone);
  if (!name) throw publicError_('कृपया अपना पूरा नाम दर्ज करें।');
  if (!/^\d{10}$/.test(phone)) throw publicError_('कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।');

  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('AISENSY_API_KEY');
  const hashSecret = properties.getProperty('OTP_HASH_SECRET');
  if (!apiKey || !hashSecret) {
    throw publicError_('OTP सेवा कॉन्फ़िगर नहीं है। कृपया सहायता से संपर्क करें।');
  }

  const cache = CacheService.getScriptCache();
  const phoneKey = digestHex_(phone);
  const otpCacheKey = `otp_${phoneKey}`;
  const cooldownKey = `cooldown_${phoneKey}`;
  const attemptsKey = `attempts_${phoneKey}`;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_('कृपया कुछ देर बाद फिर से प्रयास करें।');
  try {
    if (cache.get(cooldownKey)) throw publicError_('नया OTP भेजने से पहले 60 सेकंड प्रतीक्षा करें।');
    cache.put(cooldownKey, '1', OTP_RESEND_SECONDS);
  } finally {
    lock.releaseLock();
  }

  const otp = (Utilities.getUuid().replace(/\D/g, '') + Utilities.getUuid().replace(/\D/g, '')).slice(0, 6);
  cache.put(otpCacheKey, JSON.stringify({ hash: hmacHex_(`${phone}:${otp}`, hashSecret), name: name }), OTP_LIFETIME_SECONDS);
  cache.remove(attemptsKey);

  try {
    const response = UrlFetchApp.fetch(AISENSY_API_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        apiKey: apiKey,
        campaignName: AISENSY_CAMPAIGN_NAME,
        destination: `91${phone}`,
        userName: name,
        templateParams: [otp]
      }),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const responseText = response.getContentText();
    let responseData = {};
    try {
      responseData = JSON.parse(responseText);
    } catch (ignored) {
      responseData = {};
    }

    const rejected = responseData.success === false || responseData.status === false ||
      ['error', 'failed'].includes(String(responseData.status || '').toLowerCase());
    if (status < 200 || status >= 300 || rejected) {
      console.error(`AiSensy rejected OTP request (${status}): ${responseText}`);
      throw publicError_('WhatsApp पर OTP नहीं भेजा जा सका। कृपया फिर से प्रयास करें।');
    }
  } catch (error) {
    cache.remove(otpCacheKey);
    cache.remove(cooldownKey);
    throw error.publicMessage ? error : publicError_('WhatsApp पर OTP नहीं भेजा जा सका। कृपया फिर से प्रयास करें।');
  }

  return { message: 'OTP sent.' };
}

function verifyOtp_(params) {
  const phone = normalizePhone_(params.phone);
  const otp = String(params.otp || '').trim();
  if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)) throw publicError_('मोबाइल नंबर या OTP सही नहीं है।');

  const properties = PropertiesService.getScriptProperties();
  const hashSecret = properties.getProperty('OTP_HASH_SECRET');
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!hashSecret || !spreadsheetId) {
    throw publicError_('लीड सेवा कॉन्फ़िगर नहीं है। कृपया सहायता से संपर्क करें।');
  }

  const cache = CacheService.getScriptCache();
  const phoneKey = digestHex_(phone);
  const otpCacheKey = `otp_${phoneKey}`;
  const attemptsKey = `attempts_${phoneKey}`;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_('कृपया फिर से प्रयास करें।');

  try {
    const stored = cache.get(otpCacheKey);
    if (!stored) throw publicError_('OTP की समय-सीमा समाप्त हो गई है। नया OTP प्राप्त करें।');

    const record = JSON.parse(stored);
    const attempts = Number(cache.get(attemptsKey) || 0);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      cache.remove(otpCacheKey);
      throw publicError_('कई गलत प्रयास हुए। नया OTP प्राप्त करें।');
    }

    const submittedHash = hmacHex_(`${phone}:${otp}`, hashSecret);
    if (!constantTimeEquals_(record.hash, submittedHash)) {
      cache.put(attemptsKey, String(attempts + 1), OTP_LIFETIME_SECONDS);
      throw publicError_('OTP सही नहीं है। कृपया फिर से जाँचें।');
    }

    appendLead_(spreadsheetId, record.name, phone);
    cache.remove(otpCacheKey);
    cache.remove(attemptsKey);
    cache.remove(`cooldown_${phoneKey}`);
  } finally {
    lock.releaseLock();
  }

  return { message: 'OTP verified and lead saved.' };
}

function appendLead_(spreadsheetId, name, phone) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName('Leads') || spreadsheet.insertSheet('Leads');
  if (sheet.getLastRow() === 0) sheet.appendRow(['Submitted At', 'Name', 'Phone', 'Product']);

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 2, 1, 3).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 4).setValues([[
    new Date(), safeCell_(name), phone, 'Aarogya India 3A Piles Kit'
  ]]);
}

function bridgeResponse_(data) {
  const message = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><body><script>window.parent.postMessage(${message}, '*');</script></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

function digestHex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(byte => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function hmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret)
    .map(byte => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function safeCell_(value) {
  const text = String(value || '').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function publicError_(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}