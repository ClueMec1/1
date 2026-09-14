/**
 * Emergency Chat — Google Apps Script Web App
 * ---------------------------------------------
 * This is the *server* side of Emergency Chat. It runs on Google's
 * infrastructure, not in the family board app itself — that's the whole
 * point: it works even if Firebase is completely down.
 *
 * SETUP (one-time, takes about 3 minutes):
 * 1. Open a new or existing Google Sheet — this is where messages get
 *    stored. Any sheet works; a fresh blank one is simplest.
 * 2. In the Sheet, go to Extensions -> Apps Script. This opens the
 *    script editor, already linked to this specific spreadsheet.
 * 3. Delete whatever's in the editor and paste this entire file in its
 *    place.
 * 4. Click Deploy -> New deployment.
 *    - Click the gear icon next to "Select type" and choose "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - Click Deploy. Google will ask you to authorize the script the
 *      first time — that's expected, approve it.
 * 5. Copy the "Web app URL" it gives you (looks like
 *    https://script.google.com/macros/s/AKfycb.../exec).
 * 6. Open index.html in the family board app, find the line near the top
 *    of the <script> that says:
 *        const EMERGENCY_SHEETS_URL = "";
 *    and paste the URL between the quotes.
 *
 * That's it. A tab called "EmergencyChat" will be created automatically
 * in this spreadsheet the first time someone sends a message.
 *
 * IF YOU EVER CHANGE THIS SCRIPT: you must create a NEW deployment (or
 * edit the existing one via Deploy -> Manage deployments -> pencil icon)
 * for changes to take effect — saving the script alone does not update
 * a live deployment.
 */

const SHEET_NAME = "EmergencyChat";

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Time", "Name", "Message"]);
  }
  return sheet;
}

// Fetches the most recent messages. Called by the app's polling loop
// every ~8 seconds — no request body needed, just a plain GET.
function doGet(e) {
  const sheet = getOrCreateSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // drop the header row
  const recent = rows.slice(-50); // last 50 messages is plenty for a fallback
  const messages = recent.map(function (r) {
    return { time: r[0], name: r[1], text: r[2] };
  });
  return ContentService
    .createTextOutput(JSON.stringify(messages))
    .setMimeType(ContentService.MimeType.JSON);
}

// Appends one new message. The app sends this with a
// "text/plain" content type on purpose (not "application/json") to avoid
// a CORS preflight request that Apps Script Web Apps can't answer — the
// body is still valid JSON underneath, just parsed manually below.
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const name = (body.name || "Someone").toString().slice(0, 60);
    const text = (body.text || "").toString().slice(0, 1000);
    if (text) {
      const sheet = getOrCreateSheet_();
      sheet.appendRow([new Date().toISOString(), name, text]);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
