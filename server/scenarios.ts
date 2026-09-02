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
    },
    expectedLocation: { latitude: 26.2235, longitude: 50.5876, radiusMeters: 12_000 },
  },
  {
    id: "account-takeover",
    title: "Possible account takeover",
    shortDescription: "A large transfer follows a recent SIM change and unusual device context.",
    phoneNumber: "+99999991000",
    transaction: {
      amount: 4_800,
      currency: "BHD",
      journey: "new-beneficiary",
      destination: "International",
      newBeneficiary: true,
      accountAgeDays: 390,
      expectedArea: "Manama, Bahrain",
    },
    expectedLocation: { latitude: 26.2235, longitude: 50.5876, radiusMeters: 12_000 },
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
    },
    expectedLocation: { latitude: 26.2572, longitude: 50.6119, radiusMeters: 12_000 },
    toolDeviceOverrides: {
      reachability: "+99999990504",
    },
  },
];

export function getScenario(id: string): DemoScenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
