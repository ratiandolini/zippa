// Zippa-ს იურიდიული რეკვიზიტები და საკონტაქტო მონაცემები.
// ერთი წყარო — ქვითრები, ინვოისები, footer, metadata, JSON-LD.
// ელფოსტის/ტელეფონის/მისამართის შესაცვლელად შეცვალე მხოლოდ აქ.
export const COMPANY = {
  name: "ინდ. მეწარმე რატი კურტანიძე",
  brand: "Zippa",
  taxId: "01008043044",
  address: "თბილისი, მინდელის ქ. 3",
  // საჯარო საკონტაქტო ელფოსტა — კომპანიის, არა პირადი
  email: "support.zippa@gmail.com",
  site: "zippa.ge",
} as const;

export const COMPANY_MAILTO = `mailto:${COMPANY.email}`;
