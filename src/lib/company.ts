// Zippa-ს იურიდიული რეკვიზიტები და საკონტაქტო მონაცემები.
// ერთი წყარო — ქვითრები, ინვოისები, footer, metadata, JSON-LD.
// ელფოსტის/ტელეფონის/მისამართის შესაცვლელად შეცვალე მხოლოდ აქ.
export const COMPANY = {
  name: "ინდ. მეწარმე რატი კურტანიძე",
  brand: "Zippa",
  taxId: "01008043044",
  address: "თბილისი, მინდელის ქ. 3",
  // ამჟამად მოქმედი, რეალური საკონტაქტო ელფოსტა
  email: "ratiandolini@gmail.com",
  // ხილული ფორმატით (+995 598 42 32 34) და მანქანურით (tel: href)
  phone: "+995 598 42 32 34",
  phoneHref: "tel:+995598423234",
  site: "zippa.ge",
} as const;

export const COMPANY_MAILTO = `mailto:${COMPANY.email}`;
