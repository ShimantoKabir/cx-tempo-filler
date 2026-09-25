# CX Tempo Page Filler

Fills the Page Selection form (tenant → page type → page ID → submit) on
`v2.tempo.cxtools.walmart.com` from two inputs: device type and page ID.

## Install (unpacked)

1. Open `chrome://extensions` in the VDI's Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the extension so its icon is visible in the toolbar.

If Developer mode is greyed out or "Load unpacked" is missing, the VDI's
enterprise policy blocks unpacked extensions — this won't work as-is, and
would need IT to push it as a policy-installed extension instead.

## Use

1. Click the extension icon.
2. Choose **Mobile** or **Desktop**.
3. Enter the **Page ID**.
4. Leave **Auto-submit** unchecked the first few times — the script fills
   every field and highlights the Submit button in orange for you to click
   yourself, so you can confirm the data landed in the right fields before
   anything is submitted to Walmart's platform. Only enable Auto-submit once
   you've verified it works reliably.
5. Click **Open & Fill Form**. It opens the target page in a new tab and
   runs the fill sequence automatically.

## If the site changes

The selectors (`#option-0`, `#option-50`, etc.) are tied to Walmart's
current dropdown markup and option ordering. If CX Tempo updates its UI or
reorders dropdown items, this will silently click the wrong option — check
the filled values against the sheet after any Walmart-side update, and
re-inspect the selectors in `page-id-founder.js` if something looks off.

## Before relying on this day to day

This automates data entry into a client-owned, internal platform. Get
sign-off from whoever manages the Walmart relationship (Client Partner /
account lead) that this is an acceptable way to work in their system —
independent of whether it's technically possible, it's still their platform.
