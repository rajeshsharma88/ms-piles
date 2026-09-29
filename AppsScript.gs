function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const requestId = String(params.requestId || '');
  if (!/^[A-Za-z0-9-]{1,80}$/.test(requestId)) {
    return bridgeResponse_({ source: 'piles-lead-backend', requestId: requestId, ok: false, message: 'Invalid request.' });
  }

  try {
    let result;
    if (params.action === 'submitLead') {
      result = submitLead_(params);
    } else {
      throw publicError_('Unsupported request.');
    }

    return bridgeResponse_({
      source: 'piles-lead-backend',
      requestId: requestId,
      ok: true,
      message: result.message
    });
  } catch (error) {
    console.error(error);
    return bridgeResponse_({
      source: 'piles-lead-backend',
      requestId: requestId,
      ok: false,
      message: error.publicMessage || 'Request failed. Please try again.'
    });
  }
}

function submitLead_(params) {
  const name = String(params.name || '').trim().slice(0, 120);
  const phone = normalizePhone_(params.phone);
  if (!name) throw publicError_('कृपया अपना पूरा नाम दर्ज करें।');
  if (!/^\d{10}$/.test(phone)) throw publicError_('कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।');

  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw publicError_('लीड सेवा कॉन्फ़िगर नहीं है। कृपया सहायता से संपर्क करें।');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_('कृपया कुछ देर बाद फिर से प्रयास करें।');
  try {
    appendLead_(spreadsheetId, name, phone);
  } finally {
    lock.releaseLock();
  }

  return { message: 'Lead saved.' };
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
  const html = `<!doctype html><html><body><script>window.top.postMessage(${message}, '*');</script></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
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
