import type { DemoScenario } from "./domain.js";

export const scenarios: DemoScenario[] = [
  {
    id: "safe-remittance",
    title: "Safe family remittance",
    shortDescription: "Known customer sends a routine transfer to an existing beneficiary.",
    phoneNumber: "+99999991001",
    transaction: {
      amount: 180,
      currency: "BHD",
      journey: "remittance",
      destination: "Jordan",
      newBeneficiary: false,
      accountAgeDays: 842,
      expectedArea: "Manama, Bahrain",
      customerAction: "Fatima in Manama sends 180 BHD to an existing family beneficiary in Jordan.",
      contextNote: "Known account, familiar beneficiary and normal transfer pattern.",
    },
    expectedLocation: { latitude: 26.2235, longitude: 50.5876, radiusMeters: 12_000 },
  },
  {
    id: "account-takeover",
    title: "Possible account takeover",
    shortDescription: "A first-time cross-border transfer follows recent SIM and device changes.",
    phoneNumber: "+99999991000",
    transaction: {
      amount: 5_000,
      currency: "AED",
      journey: "new-beneficiary",
      destination: "Pakistan",
      newBeneficiary: true,
      accountAgeDays: 390,
      expectedArea: "Dubai, UAE",
      customerAction: "Aisha in Dubai sends 5,000 AED to a first-time beneficiary in Pakistan.",
      contextNote: "The transfer note says “family emergency”; a new device session appeared six hours ago.",
    },
    expectedLocation: { latitude: 25.2048, longitude: 55.2708, radiusMeters: 12_000 },
  },
  {
    id: "provider-timeout",
    title: "Network signal unavailable",
    shortDescription: "A high-value cash-out continues safely when one network check times out.",
    phoneNumber: "+99999991001",
    transaction: {
      amount: 1_250,
      currency: "BHD",
      journey: "wallet-cashout",
      destination: "Bahrain",
      newBeneficiary: false,
      accountAgeDays: 126,
      expectedArea: "Muharraq, Bahrain",
      customerAction: "Yousef requests a 1,250 BHD wallet cash-out from Muharraq.",
      contextNote: "The wallet backend needs a decision even when one network capability is temporarily unavailable.",
    },
    expectedLocation: { latitude: 26.2572, longitude: 50.6119, radiusMeters: 12_000 },
    toolDeviceOverrides: {
      device_swap: "+99999990504",
    },
  },
];

export function getScenario(id: string): DemoScenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
