# Jerusalem Doctors Directory

### دليل أطبّاء القدس · تجمّع أطبّاء العائلة المقدسي

*A closed, Arabic-first professional directory that helps verified doctors in Jerusalem find each other and connect over WhatsApp. Built voluntarily for the Jerusalemite medical community.*

🌐 Live: [jerusalem-doctors.vercel.app](https://jerusalem-doctors.vercel.app)

---

## The problem

Jerusalem's Palestinian doctors are scattered across hospitals, clinics, and private practices, Hadassah, Al-Maqassed, Augusta Victoria, Saint Joseph, Shaare Zedek, and dozens of smaller clinics. There has never been a single trustworthy way for them to find each other and refer patients across specialties.

Existing options are either public (and ignore the privacy
expectations of practising physicians), informal (WhatsApp groups that age poorly), or simply don't exist for the Arabic-speaking medical community.

This directory closes that gap. It's a **closed, identity-verified, Arabic-first** network. Only registered, license-checked doctors can sign in, search, or be searched.

---

## Screenshots


![Landing.png](docs/screenshots/landing.png)
![search](docs/screenshots/search.png)

---

## What it does

- **Closed signup, checked against the official registry.** Every signup is
  cross-checked against the Israel Ministry of Health doctors registry
  (published as an open dataset on data.gov.il): license number and Hebrew
  name. The registry is public, so a match proves a license exists, not who
  is signing up. That is why **every new signup waits for an admin**, who
  records how they know the person before accepting.
- **Arabic-first UI**, RTL throughout. Hebrew name fields are stored but the interface stays Arabic.
- **Phone-code sign-in for doctors**, by SMS, with no password to leak. The admin team signs in by email, password and an authenticator app.
- **Smart Arabic search.** A custom normalization layer treats أحمد / احمد / إحمد / آحمد as the same name. Searches doctors by name, subspecialty, specialty, *and* workplace, all in one box.
- **Two view modes**, visual cards for browsing, compact rows for scanning.
- **WhatsApp click-to-chat** straight from any doctor card, with a daily limit on how many colleagues' numbers one account can reveal.
- **Privacy posture**, Row-Level Security on every table holding personal data, and the directory tables are closed to the public API entirely: they are read only through the server. The service-role key never reaches the browser; cron jobs and webhooks run server-side under their own secrets; error reports are scrubbed of personal data before they leave.

## Built with

| Layer | Tools |
|---|---|
| Framework | **Next.js 16**, React 19, TypeScript |
| Styling | **Tailwind 4**, RTL-aware, Noto Naskh Arabic font |
| Database & auth | **Supabase** (Postgres), Row Level Security, Phone Auth, Storage |
| Validation | **Zod** end-to-end |
| External data | **CKAN API** for the MoH practitioners registry (weekly full sync, nightly check of our own doctors) |
| Rate limiting | **Upstash Redis** sliding window |
| Bot protection | **Cloudflare Turnstile** |
| OTP delivery | **SMS4FREE** via a Supabase Send SMS Hook (a Meta WhatsApp Cloud API sender is wired in but not used) |
| Testing | **Vitest**, **Playwright** end-to-end (desktop and phone, RTL), against a local Supabase |
| CI and security checks | **GitHub Actions**: CodeQL, gitleaks, zizmor, Dependabot, a production smoke check |
| Error monitoring | **Sentry** |
| Hosting | **Vercel** |

## A few engineering details

- **Single-source Arabic normalization.** A pure JS function handles hamza variants, alef-maksura, tatweel, and diacritics, and the same rules are baked into the seed migration so the DB and the search query agree to the byte. Test corpus: 18 Arabic edge cases.
- **MoH license matching.** Three-tier match: exact, soft (Levenshtein ≤ 1 or substring, for spelling variants like דוד / דויד), or not-found. The match is a signal for the admin, not an approval: every new signup waits for an admin, who gives a reason when accepting (#16).
- **Mirrored 56k-row MoH dataset.** A weekly cron refreshes the whole registry, and a nightly one re-checks our own doctors. It deduplicates doctors with multiple specialty certificates (the public dataset has one row per certificate, not per doctor) and upserts in batches of 500 to avoid Postgres' "ON CONFLICT cannot affect a row twice" trap.
- **Mobile-first responsive shell.** Tested on real Android/iOS phones, RTL preserved, big tap targets.

## Security

Report a problem privately, not in a public issue: see [SECURITY.md](SECURITY.md) (the **Security** tab of this repository, then **Report a vulnerability**). How the system is operated, and what to do when something breaks, is in [docs/runbook.md](docs/runbook.md).

## About the team

Built and maintained voluntarily by the **Salhab Brothers**: designed, implemented, deployed and operated by the two of us. We are available for software engineering work and meaningful collaborations.

- 🔗 [Salhab Brothers on Linktree](https://linktr.ee/SalhabBrothers)
- 💬 [WhatsApp](https://wa.me/972524209156)

If this project helps someone you know, or if you'd like a similar tool for
your community, get in touch.

## License

[MIT](LICENSE). The community logo and name in `public/` belong to their owners and are not covered by it.

---
> Code published openly so other community-tech projects can borrow patterns (Arabic search, registry cross-checks).