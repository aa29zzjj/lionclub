const specialties = {
  "房地產": /房地產|不動產|房仲|地政|real[ -]?estate|realtor|property management/i,
  "保險": /保險|壽險|產險|保經|保代|insurance/i,
  "工程": /工程|營造|機電|施工|engineering|construction|contractor/i,
  "室內設計": /室內設計|裝潢|室內裝修|interior design/i,
  "財務會計": /會計|記帳|稅務|財務|accounting|cpa|tax advisor/i,
  "法律": /律師|法律|法務|law firm|attorney|legal counsel/i,
  "醫療保健": /醫療|護理|診所|醫師|藥師|healthcare|clinic|physician/i,
  "餐飲": /餐飲|餐廳|外燴|烘焙|catering|restaurant|bakery/i,
  "教育培訓": /教育|培訓|補習|講師|education|training|tutor/i,
  "資訊科技": /資訊科技|軟體|軟件|資安|程式開發|software|cybersecurity|information technology/i,
  "行銷設計": /行銷|廣告|平面設計|品牌設計|marketing|graphic design|advertising/i,
  "物流運輸": /物流|運輸|貨運|配送|logistics|transportation|freight/i,
};

export const professionalTags = Object.keys(specialties);
const removeCjkSpacing = (value: string) => value.normalize("NFKC").replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1");
export function inferProfessionalTags(value: string) {
  const normalized = removeCjkSpacing(value);
  return Object.entries(specialties).filter(([, expression]) => expression.test(normalized)).map(([tag]) => tag);
}

export function resourceProfessionalTags(category: string, title: string, description: string) {
  return [...new Set([category, ...inferProfessionalTags([category, title, description].join(" "))])];
}
