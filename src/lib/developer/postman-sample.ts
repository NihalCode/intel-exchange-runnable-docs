/** Minimal Postman Collection v2.1 for testing Preview parse in Settings → Content. */
export const SAMPLE_POSTMAN_COLLECTION_JSON = `{
  "info": {
    "name": "CTIX Ping Example",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Ping",
      "request": {
        "method": "GET",
        "header": [],
        "url": "{{baseUrl}}/ping/?AccessID={{AccessID}}&Signature={{Signature}}&Expires={{Expires}}"
      }
    }
  ],
  "variable": [
    { "key": "baseUrl", "value": "https://cs-testv2.cyware.com/ctixapi" },
    { "key": "AccessID", "value": "YOUR_ACCESS_ID" },
    { "key": "Signature", "value": "YOUR_SIGNATURE" },
    { "key": "Expires", "value": "YOUR_EXPIRES" }
  ]
}`;

export const POSTMAN_PASTE_INSTRUCTIONS =
  "In Postman: open your collection → ⋯ menu → Export → Collection v2.1 → export as JSON file → open that file in a text editor → select all (Ctrl+A) → copy → paste here. The box must contain the full JSON file starting with { and \"info\".";
