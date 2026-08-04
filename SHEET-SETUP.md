# Google Sheet backend — 5 minute setup

## 1. Make the Sheet
1. New Google Sheet. Name it `markilux InvestFest 2026`.
2. Put these headers in row 1, exactly in this order (A → K):

```
Signed up | Name | Email | Phone | Role | Interested in | Timeline | Location | Notes | Event | ID
```

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete whatever is there and paste this:

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // skip duplicates if a queued row is re-sent
    var ids = sheet.getRange(2, 11, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] && ids[i][0] === d.id) {
        return ContentService.createTextOutput('duplicate');
      }
    }

    sheet.appendRow([
      d.submitted ? new Date(d.submitted) : new Date(),
      d.name || '', d.email || '', d.phone || '', d.role || '',
      d.interests || '', d.timeline || '', d.location || '',
      d.notes || '', d.event || '', d.id || ''
    ]);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('markilux InvestFest endpoint is live');
}
```

3. Save (disk icon).

## 3. Deploy it
1. **Deploy → New deployment**.
2. Gear icon → type: **Web app**.
3. Description: `InvestFest signups`. Execute as: **Me**. Who has access: **Anyone**  ← this matters; without it the page can't post.
4. **Deploy**, then authorize (pick your account, "Advanced" → "Go to … (unsafe)" → Allow — that warning is normal for your own script).
5. Copy the **Web app URL**. It ends in `/exec`.

## 4. Connect the page
1. Open the sign-up page → footer **Organizer** → code `MKX-2026`.
2. **Backend** tab → paste the URL → **Save** → **Send test row**.
3. Check the Sheet: a "Test row" line should appear. Delete that row when you're done testing.

## At the booth
- Sign-ups post to the Sheet instantly and also save on the device as a backup.
- No wifi? A red bar shows how many are queued; they sync automatically when the connection returns (or hit **Sync pending now**).
- The organizer list shows **Sent** or **Queued** per person.
- **Download CSV** still works as an offline backup.

## Notes
- Anyone with the URL can post rows; it can't read your Sheet. Fine for a weekend event. To retire it: **Deploy → Manage deployments → Archive**.
- Change the organizer code by editing `ORGANIZER_CODE` in the page.
- If you edit the script later, use **Deploy → Manage deployments → Edit → Version: New version**, or the URL keeps serving the old code.
