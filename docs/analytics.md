# Analytics

RoamingEye can count visits without an account, a cookie, or a backend. The
wiring ships in the app and stays **off** until one line in
[`src/analytics/config.ts`](../src/analytics/config.ts) is filled in. Visitors
of the default build download no analytics script.

Cloudflare Web Analytics is the selected provider. Its JavaScript beacon works
on GitHub Pages without moving DNS. The beacon token is public (it is embedded
in the page), so it belongs in that config file.

## Privacy

- No cookies. The app does not set one, and the three adapters below are the
  cookie-free products.
- No personal data is attached. Search text, coordinates, place names, and the
  URL hash are not sent. The hash is where a shared view stores its camera,
  time, and place.
- Do Not Track (`navigator.doNotTrack` of `1` or `yes`) and Global Privacy
  Control (`navigator.globalPrivacyControl`) turn the whole module off before
  any script is requested. A stored session flag is neither read nor written
  in that case.
- The provider script is added with `async` after the globe is already
  running. A failed load is ignored. The globe, search, and probe behave the
  same way when the script is blocked.
- While the config token is empty, `track` and `pageview` return immediately
  and the analytics chunk is not downloaded.

Cloudflare's beacon removes the URL hash and query before it sends a pageview.
GoatCounter and Plausible are given `location.pathname` only (Plausible via
the `u` option). GoatCounter is also told `no_onload` so it does not fall
back to its own path, which would include the query string.

A tab session remembers which `first_*` events and `activated` have already
fired, under the sessionStorage key `re.ax`. The value is a pair of counters,
not an identifier. It dies with the tab. It is not a cookie.

## Events

Names are stable. Dashboards and tests should use these strings.

| Name           | When it fires                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `pageview`     | Once, when the app boots. Pathname only.                                                              |
| `first_search` | The first time in this tab that a search result is chosen.                                            |
| `first_scrub`  | The first time in this tab that the visitor moves the timeline (drag, step, arrow key, or play).      |
| `first_probe`  | The first time in this tab that the visitor charts a point (click the globe, or Enter / Space on it). |
| `compare`      | Each time the visitor turns month comparison on, including a "then and now" choice.                   |
| `share`        | Each time the visitor uses Share view.                                                                |
| `activated`    | Once, when the visitor has done a search or a scrub and at least one other action.                    |

`first_search`, `first_scrub`, `first_probe`, and `activated` fire once per
tab session. A second search does not send `first_search` again. `compare`
and `share` fire on every use.

`activated` is the project's own engagement metric. Any of these sessions
qualify, because each one includes a search or a scrub plus one more action:

- search, then probe
- scrub, then share
- search, then scrub
- probe, then search (the earlier probe is the other action)
- two timeline steps (the second scrub is the other action)

A session that only probes and shares does not qualify. One search by itself
does not qualify.

Programmatic moves do not count as a scrub: opening a shared link, skipping
the intro, flying to a search result, or playing a story.

The public functions are `pageview()`, `track(event, props?)`, and
`record(action)`. Call sites use `record` with `search`, `scrub`, `probe`,
`compare`, or `share`. `record` is what emits the names in the table.
`track` sends an event name as given. Props are optional short tokens
(`button`, `yes`). Place names and free text are dropped. None of the built-in
events send props.

## Enabling a provider

Edit the single exported line in `src/analytics/config.ts`:

```ts
export const ANALYTICS = "cloudflare:";
```

That line is Cloudflare with an empty token, which is off.

**Cloudflare Web Analytics** (pageviews):

```ts
export const ANALYTICS = "cloudflare:YOUR_BEACON_TOKEN";
```

Paste the token from the Cloudflare snippet, the value of `token` inside
`data-cf-beacon`. Leave the script tag out of `index.html`. The app inserts
`https://static.cloudflareinsights.com/beacon.min.js` itself, once, on the
first pageview.

**Cloudflare has no custom events.** `track` and `record` still run, and a
same-page test sink can see them, but the beacon does not receive
`first_search`, `first_scrub`, `first_probe`, `compare`, `share`, or
`activated`. Those events need a second adapter. GoatCounter and Plausible
are included for that. Switching is the same one line, and it replaces
Cloudflare rather than running beside it:

**GoatCounter** (pageviews and events):

```ts
export const ANALYTICS = "goatcounter:YOUR_CODE";
```

`YOUR_CODE` is the site code in `https://YOUR_CODE.goatcounter.com`. A
self-hosted counter can use its count URL instead:

```ts
export const ANALYTICS = "goatcounter:https://stats.example.com/count";
```

The script is `https://gc.zgo.at/count.js` with `no_onload` and `no_events`.
Pageviews use the pathname. Events use `count({ path, event: true })`.
GoatCounter records the event name and does not receive props. On localhost
the script is allowed to send, so a production build can be checked locally.
GoatCounter's own script may include a referrer and a screen width. Those
come from the provider, and this app adds nothing further.

**Plausible** (pageviews and events):

```ts
export const ANALYTICS = "plausible:roamingeye.org";
```

The value is the site domain configured in Plausible. The script is
`https://plausible.io/js/script.manual.js`, which does not send a pageview
until `pageview()` runs. Every call passes `u` set to the origin plus the
pathname, so the hash is not the page URL. Custom events can carry the safe
props described above. Plausible's script ignores `localhost` unless its own
local flag is set, so local checks need a deployed host or that flag.

Rebuild after changing the line (`npm run build`, or the GitHub Pages
workflow). There is no server to configure and no API key to hide.

## Checking events locally

With the config still off, a page can record the event stream without a
provider. Before the app boots:

```js
window.__reAnalytics = (event, props) => {
  console.log(event, props ?? "");
};
```

Then search, scrub, click the globe, compare, and share. The names in the
table above are what prints. `pageview` prints on boot. This sink is for
local checks and the end-to-end test. It does not load a third-party script
and it does not forward data anywhere.

The browser suite covers two cases: a normal visit requests no analytics
host, and a visit with the sink installed records `pageview`, `first_probe`,
`first_search`, `activated`, `first_scrub`, `compare`, and `share` for that
journey.
