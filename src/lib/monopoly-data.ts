// =============================================
// MONOPOLY BOARD DATA - All 40 spaces
// =============================================

export type SpaceType =
  | "property"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "community-chest"
  | "go"
  | "jail"
  | "free-parking"
  | "go-to-jail";

export type ColorGroup =
  | "brown"
  | "light-blue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "dark-blue"
  | "railroad"
  | "utility"
  | "none";

export interface BoardSpace {
  index: number;
  name: string;
  type: SpaceType;
  price?: number;
  rent?: number[];
  houseCost?: number;
  colorGroup: ColorGroup;
  mortgageValue?: number;
  taxAmount?: number;
}

export const BOARD_SPACES: BoardSpace[] = [
  { index: 0, name: "GO", type: "go", colorGroup: "none" },
  {
    index: 1, name: "Marine Drive", type: "property", price: 60,
    rent: [2, 10, 30, 90, 160, 250], houseCost: 50, colorGroup: "brown", mortgageValue: 30,
  },
  { index: 2, name: "Jan Seva Fund", type: "community-chest", colorGroup: "none" },
  {
    index: 3, name: "Colaba Causeway", type: "property", price: 60,
    rent: [4, 20, 60, 180, 320, 450], houseCost: 50, colorGroup: "brown", mortgageValue: 30,
  },
  { index: 4, name: "Income Tax", type: "tax", colorGroup: "none", taxAmount: 200 },
  {
    index: 5, name: "Mumbai Central", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 6, name: "MG Road", type: "property", price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50, colorGroup: "light-blue", mortgageValue: 50,
  },
  { index: 7, name: "Kismat", type: "chance", colorGroup: "none" },
  {
    index: 8, name: "Brigade Road", type: "property", price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50, colorGroup: "light-blue", mortgageValue: 50,
  },
  {
    index: 9, name: "Connaught Place", type: "property", price: 120,
    rent: [8, 40, 100, 300, 450, 600], houseCost: 50, colorGroup: "light-blue", mortgageValue: 60,
  },
  { index: 10, name: "Jail / Just Visiting", type: "jail", colorGroup: "none" },
  {
    index: 11, name: "Banjara Hills", type: "property", price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100, colorGroup: "pink", mortgageValue: 70,
  },
  {
    index: 12, name: "Power Grid", type: "utility", price: 150,
    rent: [4, 10], colorGroup: "utility", mortgageValue: 75,
  },
  {
    index: 13, name: "Jubilee Hills", type: "property", price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100, colorGroup: "pink", mortgageValue: 70,
  },
  {
    index: 14, name: "HITEC City", type: "property", price: 160,
    rent: [12, 60, 180, 500, 700, 900], houseCost: 100, colorGroup: "pink", mortgageValue: 80,
  },
  {
    index: 15, name: "Howrah Junction", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 16, name: "Park Street", type: "property", price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100, colorGroup: "orange", mortgageValue: 90,
  },
  { index: 17, name: "Jan Seva Fund", type: "community-chest", colorGroup: "none" },
  {
    index: 18, name: "Salt Lake", type: "property", price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100, colorGroup: "orange", mortgageValue: 90,
  },
  {
    index: 19, name: "New Town", type: "property", price: 200,
    rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, colorGroup: "orange", mortgageValue: 100,
  },
  { index: 20, name: "Free Parking", type: "free-parking", colorGroup: "none" },
  {
    index: 21, name: "Anna Salai", type: "property", price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, colorGroup: "red", mortgageValue: 110,
  },
  { index: 22, name: "Kismat", type: "chance", colorGroup: "none" },
  {
    index: 23, name: "T Nagar", type: "property", price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, colorGroup: "red", mortgageValue: 110,
  },
  {
    index: 24, name: "Besant Nagar", type: "property", price: 240,
    rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, colorGroup: "red", mortgageValue: 120,
  },
  {
    index: 25, name: "Chennai Central", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 26, name: "Bandra", type: "property", price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, colorGroup: "yellow", mortgageValue: 130,
  },
  {
    index: 27, name: "Juhu", type: "property", price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, colorGroup: "yellow", mortgageValue: 130,
  },
  {
    index: 28, name: "Jal Board", type: "utility", price: 150,
    rent: [4, 10], colorGroup: "utility", mortgageValue: 75,
  },
  {
    index: 29, name: "Powai", type: "property", price: 280,
    rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, colorGroup: "yellow", mortgageValue: 140,
  },
  { index: 30, name: "Go To Jail", type: "go-to-jail", colorGroup: "none" },
  {
    index: 31, name: "Koramangala", type: "property", price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, colorGroup: "green", mortgageValue: 150,
  },
  {
    index: 32, name: "Indiranagar", type: "property", price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, colorGroup: "green", mortgageValue: 150,
  },
  { index: 33, name: "Jan Seva Fund", type: "community-chest", colorGroup: "none" },
  {
    index: 34, name: "Whitefield", type: "property", price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, colorGroup: "green", mortgageValue: 160,
  },
  {
    index: 35, name: "New Delhi Station", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  { index: 36, name: "Kismat", type: "chance", colorGroup: "none" },
  {
    index: 37, name: "Aerocity", type: "property", price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, colorGroup: "dark-blue", mortgageValue: 175,
  },
  { index: 38, name: "Luxury Tax", type: "tax", colorGroup: "none", taxAmount: 100 },
  {
    index: 39, name: "Lutyens Delhi", type: "property", price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, colorGroup: "dark-blue", mortgageValue: 200,
  },
];

// Color group membership
export const COLOR_GROUPS: Record<string, number[]> = {
  brown: [1, 3],
  "light-blue": [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  "dark-blue": [37, 39],
  railroad: [5, 15, 25, 35],
  utility: [12, 28],
};

// Color group CSS colors
export const COLOR_GROUP_CSS: Record<string, string> = {
  brown: "#8B4513",
  "light-blue": "#87CEEB",
  pink: "#FF69B4",
  orange: "#FFA500",
  red: "#FF0000",
  yellow: "#FFD700",
  green: "#228B22",
  "dark-blue": "#00008B",
  railroad: "#333333",
  utility: "#666666",
  none: "#CCCCCC",
};

// Chance cards
export interface GameCard {
  text: string;
  action: string;
  value?: number;
  destination?: number;
}

export const CHANCE_CARDS: GameCard[] = [
  { text: "Advance to GO. Collect Rs 200.", action: "move", destination: 0 },
  { text: "Advance to Besant Nagar.", action: "move", destination: 24 },
  { text: "Advance to Banjara Hills.", action: "move", destination: 11 },
  { text: "Advance to the nearest Railway Hub. Pay owner double rent if owned.", action: "nearest-railroad" },
  { text: "Advance to the nearest Utility. Pay 10x dice roll if owned.", action: "nearest-utility" },
  { text: "Festival bonus from the bank. Collect Rs 50.", action: "collect", value: 50 },
  { text: "Get Out of Jail Free card.", action: "get-out-of-jail" },
  { text: "Go back 3 spaces.", action: "move-back", value: 3 },
  { text: "Go to Jail. Do not pass GO.", action: "go-to-jail" },
  { text: "Monsoon repairs: pay Rs 25 per house and Rs 100 per hotel.", action: "repairs", value: 25 },
  { text: "Pay civic surcharge of Rs 15.", action: "pay", value: 15 },
  { text: "Take a trip to Mumbai Central. Collect Rs 200 if you pass GO.", action: "move", destination: 5 },
  { text: "Take a drive to Lutyens Delhi.", action: "move", destination: 39 },
  { text: "You host the board summit. Pay each player Rs 50.", action: "pay-each", value: 50 },
  { text: "Your fixed deposit matures. Collect Rs 150.", action: "collect", value: 150 },
  { text: "You won a national quiz contest. Collect Rs 100.", action: "collect", value: 100 },
];

export const COMMUNITY_CHEST_CARDS: GameCard[] = [
  { text: "Advance to GO. Collect Rs 200.", action: "move", destination: 0 },
  { text: "Tax rebate approved. Collect Rs 200.", action: "collect", value: 200 },
  { text: "Doctor consultation fee. Pay Rs 50.", action: "pay", value: 50 },
  { text: "Mutual fund payout. Collect Rs 50.", action: "collect", value: 50 },
  { text: "Get Out of Jail Free card.", action: "get-out-of-jail" },
  { text: "Go to Jail. Do not pass GO.", action: "go-to-jail" },
  { text: "Wedding celebration. Collect Rs 50 from every player.", action: "collect-each", value: 50 },
  { text: "Holiday savings mature. Receive Rs 100.", action: "collect", value: 100 },
  { text: "Income tax refund. Collect Rs 20.", action: "collect", value: 20 },
  { text: "Birthday gifts arrive. Collect Rs 10 from each player.", action: "collect-each", value: 10 },
  { text: "Insurance payout matures. Collect Rs 100.", action: "collect", value: 100 },
  { text: "Hospital charges. Pay Rs 100.", action: "pay", value: 100 },
  { text: "School fees due. Pay Rs 50.", action: "pay", value: 50 },
  { text: "Receive Rs 25 consulting fee.", action: "collect", value: 25 },
  { text: "Road repairs levy: pay Rs 40 per house and Rs 115 per hotel.", action: "repairs", value: 40 },
  { text: "You won second prize in a cultural contest. Collect Rs 10.", action: "collect", value: 10 },
  { text: "Family inheritance. Collect Rs 100.", action: "collect", value: 100 },
];

export const PLAYER_COLORS = [
  "#EF4444", // red
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export const PLAYER_TOKENS = ["🚗", "🎩", "👢", "🚢", "🐕", "🔧", "🎲", "💎"];
