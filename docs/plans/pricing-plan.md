# Stori — Regional Pricing Plan

## Tiers

- **Free**: ₹0 / $0 — Limited features, watermark, 1 min export, BYOK
- **Pro**: Regional pricing below — All features unlocked, BYOK

## 15-Country Regional Pricing

| # | Country | Monthly | Annual | Annual (per month) | Currency |
|---|---------|---------|--------|--------------------|----------|
| 1 | India | ₹199 | ₹1,499 | ₹125 | INR |
| 2 | Indonesia | Rp29,000 | Rp199,000 | Rp16,583 | IDR |
| 3 | Brazil | R$19 | R$149 | R$12.42 | BRL |
| 4 | Mexico | MX$79 | MX$599 | MX$49.92 | MXN |
| 5 | Turkey | ₺99 | ₺749 | ₺62.42 | TRY |
| 6 | Philippines | ₱199 | ₱1,499 | ₱124.92 | PHP |
| 7 | Vietnam | ₫49,000 | ₫399,000 | ₫33,250 | VND |
| 8 | Thailand | ฿149 | ฿1,099 | ฿91.58 | THB |
| 9 | Egypt | E£149 | E£1,099 | E£91.58 | EGP |
| 10 | Nigeria | ₦2,499 | ₦18,999 | ₦1,583.25 | NGN |
| 11 | Colombia | COP$14,900 | COP$109,000 | COP$9,083 | COP |
| 12 | South Korea | ₩4,900 | ₩39,000 | ₩3,250 | KRW |
| 13 | Japan | ¥800 | ¥5,900 | ¥491.67 | JPY |
| 14 | United Kingdom | £5 | £39 | £3.25 | GBP |
| 15 | Germany (EU) | €6 | €49 | €4.08 | EUR |
| — | **Global (default)** | **$8** | **$59** | **$4.92** | **USD** |

## Why These Countries

| Country | Reason |
|---------|--------|
| India | Story culture, mythology, education, 800M+ internet users, multi-language support |
| Indonesia | Largest SE Asia creator market, Islamic education content |
| Brazil | Huge YouTube/TikTok market, Portuguese content demand |
| Mexico | Growing Spanish creator economy, educational content |
| Turkey | Strong storytelling culture, growing creator economy |
| Philippines | English-speaking, massive social media usage |
| Vietnam | Fast-growing creator economy, education focused |
| Thailand | Strong social media culture, Buddhist/spiritual content |
| Egypt | Arabic content hub, Islamic/educational market |
| Nigeria | Largest African creator market, English-speaking |
| Colombia | Growing Latin American creator market |
| South Korea | K-content culture, high tech adoption |
| Japan | Anime culture fits visual styles, high willingness to pay |
| United Kingdom | English-speaking, strong podcast market |
| Germany | Largest EU market, education content culture |

## Pricing Logic

- **India, Indonesia, Vietnam, Nigeria, Egypt** — ~60-70% cheaper than US (PPP adjusted)
- **Brazil, Mexico, Turkey, Colombia, Philippines** — ~50-60% cheaper
- **Thailand, South Korea** — ~40% cheaper
- **Japan, UK, Germany** — ~20-30% cheaper (higher purchasing power)
- **All annual plans** — ~35-40% savings vs monthly

## Detection Method

Browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) maps to country.
No match → USD global pricing shown.

## Launch Offer

| | India | Global |
|---|---|---|
| Early adopter (first 100) | ₹999/yr lifetime | $39/yr lifetime |
| Regular | ₹1,499/yr or ₹199/mo | $59/yr or $8/mo |

## EUR Countries

Germany pricing (€6/mo, €49/yr) applies to all EU/Eurozone countries:
France, Spain, Italy, Netherlands, Austria, Belgium, Portugal, Ireland, Finland, Greece, etc.
