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
    index: 1, name: "Mediterranean Avenue", type: "property", price: 60,
    rent: [2, 10, 30, 90, 160, 250], houseCost: 50, colorGroup: "brown", mortgageValue: 30,
  },
  { index: 2, name: "Community Chest", type: "community-chest", colorGroup: "none" },
  {
    index: 3, name: "Baltic Avenue", type: "property", price: 60,
    rent: [4, 20, 60, 180, 320, 450], houseCost: 50, colorGroup: "brown", mortgageValue: 30,
  },
  { index: 4, name: "Income Tax", type: "tax", colorGroup: "none", taxAmount: 200 },
  {
    index: 5, name: "Reading Railroad", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 6, name: "Oriental Avenue", type: "property", price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50, colorGroup: "light-blue", mortgageValue: 50,
  },
  { index: 7, name: "Chance", type: "chance", colorGroup: "none" },
  {
    index: 8, name: "Vermont Avenue", type: "property", price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50, colorGroup: "light-blue", mortgageValue: 50,
  },
  {
    index: 9, name: "Connecticut Avenue", type: "property", price: 120,
    rent: [8, 40, 100, 300, 450, 600], houseCost: 50, colorGroup: "light-blue", mortgageValue: 60,
  },
  { index: 10, name: "Jail / Just Visiting", type: "jail", colorGroup: "none" },
  {
    index: 11, name: "St. Charles Place", type: "property", price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100, colorGroup: "pink", mortgageValue: 70,
  },
  {
    index: 12, name: "Electric Company", type: "utility", price: 150,
    rent: [4, 10], colorGroup: "utility", mortgageValue: 75,
  },
  {
    index: 13, name: "States Avenue", type: "property", price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100, colorGroup: "pink", mortgageValue: 70,
  },
  {
    index: 14, name: "Virginia Avenue", type: "property", price: 160,
    rent: [12, 60, 180, 500, 700, 900], houseCost: 100, colorGroup: "pink", mortgageValue: 80,
  },
  {
    index: 15, name: "Pennsylvania Railroad", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 16, name: "St. James Place", type: "property", price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100, colorGroup: "orange", mortgageValue: 90,
  },
  { index: 17, name: "Community Chest", type: "community-chest", colorGroup: "none" },
  {
    index: 18, name: "Tennessee Avenue", type: "property", price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100, colorGroup: "orange", mortgageValue: 90,
  },
  {
    index: 19, name: "New York Avenue", type: "property", price: 200,
    rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, colorGroup: "orange", mortgageValue: 100,
  },
  { index: 20, name: "Free Parking", type: "free-parking", colorGroup: "none" },
  {
    index: 21, name: "Kentucky Avenue", type: "property", price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, colorGroup: "red", mortgageValue: 110,
  },
  { index: 22, name: "Chance", type: "chance", colorGroup: "none" },
  {
    index: 23, name: "Indiana Avenue", type: "property", price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, colorGroup: "red", mortgageValue: 110,
  },
  {
    index: 24, name: "Illinois Avenue", type: "property", price: 240,
    rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, colorGroup: "red", mortgageValue: 120,
  },
  {
    index: 25, name: "B&O Railroad", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  {
    index: 26, name: "Atlantic Avenue", type: "property", price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, colorGroup: "yellow", mortgageValue: 130,
  },
  {
    index: 27, name: "Ventnor Avenue", type: "property", price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, colorGroup: "yellow", mortgageValue: 130,
  },
  {
    index: 28, name: "Water Works", type: "utility", price: 150,
    rent: [4, 10], colorGroup: "utility", mortgageValue: 75,
  },
  {
    index: 29, name: "Marvin Gardens", type: "property", price: 280,
    rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, colorGroup: "yellow", mortgageValue: 140,
  },
  { index: 30, name: "Go To Jail", type: "go-to-jail", colorGroup: "none" },
  {
    index: 31, name: "Pacific Avenue", type: "property", price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, colorGroup: "green", mortgageValue: 150,
  },
  {
    index: 32, name: "North Carolina Avenue", type: "property", price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, colorGroup: "green", mortgageValue: 150,
  },
  { index: 33, name: "Community Chest", type: "community-chest", colorGroup: "none" },
  {
    index: 34, name: "Pennsylvania Avenue", type: "property", price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, colorGroup: "green", mortgageValue: 160,
  },
  {
    index: 35, name: "Short Line", type: "railroad", price: 200,
    rent: [25, 50, 100, 200], colorGroup: "railroad", mortgageValue: 100,
  },
  { index: 36, name: "Chance", type: "chance", colorGroup: "none" },
  {
    index: 37, name: "Park Place", type: "property", price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, colorGroup: "dark-blue", mortgageValue: 175,
  },
  { index: 38, name: "Luxury Tax", type: "tax", colorGroup: "none", taxAmount: 100 },
  {
    index: 39, name: "Boardwalk", type: "property", price: 400,
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
  { text: "Advance to GO. Collect $200.", action: "move", destination: 0 },
  { text: "Advance to Illinois Avenue.", action: "move", destination: 24 },
  { text: "Advance to St. Charles Place.", action: "move", destination: 11 },
  { text: "Advance to nearest Railroad. Pay owner twice the rental.", action: "nearest-railroad" },
  { text: "Advance to nearest Utility. Pay 10× dice roll if owned.", action: "nearest-utility" },
  { text: "Bank pays you dividend of $50.", action: "collect", value: 50 },
  { text: "Get Out of Jail Free card.", action: "get-out-of-jail" },
  { text: "Go Back 3 Spaces.", action: "move-back", value: 3 },
  { text: "Go to Jail. Do not pass GO.", action: "go-to-jail" },
  { text: "Make general repairs: $25 per house, $100 per hotel.", action: "repairs", value: 25 },
  { text: "Pay poor tax of $15.", action: "pay", value: 15 },
  { text: "Take a trip to Reading Railroad. Collect $200 if you pass GO.", action: "move", destination: 5 },
  { text: "Take a walk on the Boardwalk.", action: "move", destination: 39 },
  { text: "You have been elected Chairman of the Board. Pay each player $50.", action: "pay-each", value: 50 },
  { text: "Your building loan matures. Collect $150.", action: "collect", value: 150 },
  { text: "You have won a crossword competition. Collect $100.", action: "collect", value: 100 },
];

export const COMMUNITY_CHEST_CARDS: GameCard[] = [
  { text: "Advance to GO. Collect $200.", action: "move", destination: 0 },
  { text: "Bank error in your favor. Collect $200.", action: "collect", value: 200 },
  { text: "Doctor's fee. Pay $50.", action: "pay", value: 50 },
  { text: "From sale of stock you get $50.", action: "collect", value: 50 },
  { text: "Get Out of Jail Free card.", action: "get-out-of-jail" },
  { text: "Go to Jail. Do not pass GO.", action: "go-to-jail" },
  { text: "Grand Opera Night. Collect $50 from every player.", action: "collect-each", value: 50 },
  { text: "Holiday fund matures. Receive $100.", action: "collect", value: 100 },
  { text: "Income tax refund. Collect $20.", action: "collect", value: 20 },
  { text: "It is your birthday. Collect $10 from each player.", action: "collect-each", value: 10 },
  { text: "Life insurance matures. Collect $100.", action: "collect", value: 100 },
  { text: "Hospital fees. Pay $100.", action: "pay", value: 100 },
  { text: "School fees. Pay $50.", action: "pay", value: 50 },
  { text: "Receive $25 consultancy fee.", action: "collect", value: 25 },
  { text: "You are assessed for street repairs: $40 per house, $115 per hotel.", action: "repairs", value: 40 },
  { text: "You have won second prize in a beauty contest. Collect $10.", action: "collect", value: 10 },
  { text: "You inherit $100.", action: "collect", value: 100 },
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
