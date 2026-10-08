# DetheAI backend

## Accounts and sessions

Google is the supported sign-in method. OAuth verifies state and the Google email before issuing a seven-day signed HttpOnly, SameSite=Lax cookie (Secure on HTTPS). Use one canonical `APP_ORIGIN`; Google callback must match it. Logout clears the browser cookie. Rotating `SESSION_SECRET` invalidates existing sessions globally.

The browser caches display information only. Account identity, plan, credits and API permissions are read from server records. Accounts are keyed by a hash of the normalized verified email in the private GitHub data repository. Contents API SHA comparisons retry concurrent mutations; operation markers prevent duplicate debits after a lost response. This storage has GitHub rate/size limits and should be replaced with a transactional database if usage grows.

## Credits and limits

| Plan | Studio credits / 30 days | Separate API credits / 30 days | Studio characters |
|---|---:|---:|---:|
| Free | 10,000 | None | 1,000 |
| Pro | 50,000 | 50,000 | 4,000 |
| Business | 200,000 | 200,000 | 4,000 |

Speech costs 500 credits per started 100-word block. Debit happens before synthesis; a provider failure triggers an idempotent refund for that reservation. Refunds require storage availability. Monthly/yearly purchases expire after 30/365 days; credit refill never extends a subscription. Expired subscriptions return to Free.

Preview endpoints accept only fixed server-owned samples. They cannot generate caller-supplied text. AI writing is limited to 20 Free / 200 paid requests per UTC day; transcription to 60 / 600 chunks. Failed attempts count toward those daily limits. Uploads are limited to 85 MB and ten minutes in the browser; longer media is rejected. Subtitle timings are estimates, not word alignment.

## Payments and migration

Checkout stores account, plan, cycle, amount and currency. Verification checks the Razorpay HMAC plus the actual captured payment, matching amount/order/currency and no refund. A payment grants credits once, including concurrent or repeated verification. Prices in paise are defined in `shared/billing.js`.

Existing customers sign in with the Google email matching their payment email. The browser attempts restoration using locally saved old billing proof. The server retrieves the original provider order and payment, checks product/price/signature and payer email, and retains the original purchase expiry. Clearing old local data can remove this automatic restoration proof; support must verify the purchase with the payment provider. Unverified old browser-only plans and balances cannot grant access.

Up to three active API keys per paid account. All newly issued keys share the account API quota; revoking/replacing keys does not refill it. Keys expire at the subscription expiry recorded when issued. Existing pre-migration keys retain their finite original quota and expiry; device-saved keys can be revoked by their verified owner. API requests allow at most 3,000 characters.

Refunds after an already granted purchase are not automatically reconciled: there is no payment webhook handler. Operators must reconcile refunded entitlements with provider records before revoking account access.

## Providers

`shared/synthesis.js`: Sarvam → Microsoft Edge → Google Translate fallback, subject to language support and availability. Fallback audio may differ from the selected premium voice. A synthesis deadline bounds the provider chain; storage retries still depend on external response time.

AI writing tries configured Sarvam, Gemini and OpenAI providers. Provider failures return a real error. Transcription requires Sarvam STT and audio chunks; there is no fabricated/demo result or link transcription.

## Deployment and configuration

`.env.example` lists required variables. Keep the private database repo and original Razorpay secret when migrating existing purchases/keys. The data token should have Contents read/write access only to that repository. Account records include names, email, balances, payment references and API keys; restrict access and apply your retention/deletion policy to repository history and backups too.

Vercel runs 11 API function entrypoints with a configured 60-second maximum. The build generates `dist/`; shared helpers remain outside `api/`. Deploy from the repository root. Project/environment access is required; neither a successful local build nor a Git push proves production publication.

`npm run build && npm test` covers SEO rendering, auth/credits/payment/key regressions using synthetic provider transport, and transcription preprocessing. These checks do not prove live Google, Razorpay or Sarvam integration. See the release notes for checks actually performed.
