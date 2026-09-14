package game

import "backend/pkg/models"

// propertyDef is a compact spec for building the 40-tile board.
// Rents are the classic tiers: [Base, 1H, 2H, 3H, 4H, Hotel].
// Mortgage is display-only info (no mortgage feature exists).
type propertyDef struct {
	id        int
	nameBn    string
	nameEn    string
	price     int
	houseCost int
	group     string
	rent      []int
	mortgage  int
}

// NewBoard builds the full 40-tile Mahajoni board.
//
// Layout follows classic Monopoly positions so the 22 Chattogram
// properties + 4 railroads + 2 utilities + 12 special tiles = 40.
// Special tiles: GO(0), CHEST(2,17,33), TAX(4,38), RAIL(5,15,25,35),
// CHANCE(7,22,36), JAIL(10), UTIL(12,28), PARKING(20), GOTO_JAIL(30).
func NewBoard() map[int]*models.Tile {
	tiles := make(map[int]*models.Tile, 40)

	props := []propertyDef{
		{1, "স্বন্দীপ", "Swandip", 60, 50, "violet", []int{2, 10, 30, 90, 160, 250}, 30},
		{3, "সীতাকুন্ড", "Sitakund", 60, 50, "violet", []int{4, 20, 60, 180, 320, 450}, 30},
		{6, "পটিয়া", "Patiya", 100, 50, "lightblue", []int{6, 30, 90, 270, 400, 550}, 50},
		{8, "আনোয়ারা", "Anwara", 100, 50, "lightblue", []int{6, 30, 90, 270, 400, 550}, 50},
		{9, "সাতকানিয়া", "Satkania", 120, 50, "lightblue", []int{8, 40, 100, 300, 450, 600}, 60},
		{11, "রাউজান", "Raozan", 140, 100, "pink", []int{10, 50, 150, 450, 625, 750}, 70},
		{13, "ফটিকছড়ি", "Fatikchhari", 140, 100, "pink", []int{10, 50, 150, 450, 625, 750}, 70},
		{14, "রাঙ্গুনিয়া", "Rangunia", 160, 100, "pink", []int{12, 60, 180, 500, 700, 900}, 80},
		{16, "কোতোয়ালি", "Kotwali", 180, 100, "orange", []int{14, 70, 200, 550, 750, 950}, 90},
		{18, "আন্দরকিল্লা", "Andarkilla", 180, 100, "orange", []int{14, 70, 200, 550, 750, 950}, 90},
		{19, "চকবাজার", "Chakbazar", 200, 100, "orange", []int{16, 80, 220, 600, 800, 1000}, 100},
		{21, "জিইসি", "GEC", 220, 150, "red", []int{18, 90, 250, 700, 875, 1050}, 110},
		{23, "বাটালি হিল", "Batali Hill", 220, 150, "red", []int{18, 90, 250, 700, 875, 1050}, 110},
		// Plan §2.1 prices Dewanhat at ৳140 (red group: 220/220/140) —
		// kept exactly as specified; rents follow the Illinois Avenue slot.
		{24, "দেওয়ানহাট", "Dewanhat", 140, 150, "red", []int{20, 100, 300, 750, 925, 1100}, 70},
		{26, "হালিশহর", "Halishahar", 260, 150, "yellow", []int{22, 110, 330, 800, 975, 1150}, 130},
		{27, "অলংকার", "Alankar", 260, 150, "yellow", []int{22, 110, 330, 800, 975, 1150}, 130},
		{29, "আগ্রাবাদ", "Agrabad", 280, 150, "yellow", []int{24, 120, 360, 850, 1025, 1200}, 140},
		{31, "মুরাদপুর", "Muradpur", 300, 200, "green", []int{26, 130, 390, 900, 1100, 1275}, 150},
		{32, "বহদ্দারহাট", "Bahaddarhat", 300, 200, "green", []int{26, 130, 390, 900, 1100, 1275}, 150},
		{34, "চান্দগাঁও", "Chandgaon", 320, 200, "green", []int{28, 150, 450, 1000, 1200, 1400}, 160},
		{37, "খুলশী", "Khulshi", 350, 200, "darkblue", []int{35, 175, 500, 1100, 1300, 1500}, 175},
		{39, "পাঁচলাইশ", "Panchlaish", 400, 200, "darkblue", []int{50, 200, 600, 1400, 1700, 2000}, 200},
	}

	for _, p := range props {
		tiles[p.id] = &models.Tile{
			ID:        p.id,
			NameBn:    p.nameBn,
			NameEn:    p.nameEn,
			Type:      models.TileProperty,
			Price:     p.price,
			RentTiers: p.rent,
			HouseCost: p.houseCost,
			Group:     p.group,
			Mortgage:  p.mortgage,
		}
	}

	railroads := []propertyDef{
		{5, "পাহাড়তলী স্টেশন", "Pahartali Station", 200, 0, "railroad", nil, 100},
		{15, "চট্টগ্রাম জংশন", "Chattogram Junction", 200, 0, "railroad", nil, 100},
		{25, "ষোলশহর স্টেশন", "Sholoshahar Station", 200, 0, "railroad", nil, 100},
		{35, "বিমানবন্দর", "Airport", 200, 0, "railroad", nil, 100},
	}
	for _, r := range railroads {
		tiles[r.id] = &models.Tile{
			ID:       r.id,
			NameBn:   r.nameBn,
			NameEn:   r.nameEn,
			Type:     models.TileRailroad,
			Price:    200,
			Group:    "railroad",
			Mortgage: 100,
		}
	}

	utils := []propertyDef{
		{12, "পিডিবি", "PDB Power Grid", 150, 0, "utility", nil, 75},
		{28, "ওয়াসা", "WASA", 150, 0, "utility", nil, 75},
	}
	for _, u := range utils {
		tiles[u.id] = &models.Tile{
			ID:       u.id,
			NameBn:   u.nameBn,
			NameEn:   u.nameEn,
			Type:     models.TileUtility,
			Price:    150,
			Group:    "utility",
			Mortgage: 75,
		}
	}

	special := map[int]models.Tile{
		0:  {ID: 0, NameBn: "যাত্রা শুরু", NameEn: "GO", Type: models.TileGo},
		2:  {ID: 2, NameBn: "সুযোগ গ্রহণ", NameEn: "Community Chest", Type: models.TileChest},
		4:  {ID: 4, NameBn: "আয়কর", NameEn: "Income Tax", Type: models.TileTax, Price: 200},
		7:  {ID: 7, NameBn: "ভাগ্য পরীক্ষা", NameEn: "Chance", Type: models.TileChance},
		10: {ID: 10, NameBn: "জেল", NameEn: "Jail", Type: models.TileJail},
		17: {ID: 17, NameBn: "সুযোগ গ্রহণ", NameEn: "Community Chest", Type: models.TileChest},
		20: {ID: 20, NameBn: "বিশ্রাম", NameEn: "Free Parking", Type: models.TileParking},
		22: {ID: 22, NameBn: "ভাগ্য পরীক্ষা", NameEn: "Chance", Type: models.TileChance},
		30: {ID: 30, NameBn: "জেলে যান", NameEn: "Go To Jail", Type: models.TileGoToJail},
		33: {ID: 33, NameBn: "সুযোগ গ্রহণ", NameEn: "Community Chest", Type: models.TileChest},
		36: {ID: 36, NameBn: "ভাগ্য পরীক্ষা", NameEn: "Chance", Type: models.TileChance},
		38: {ID: 38, NameBn: "বিলাস কর", NameEn: "Luxury Tax", Type: models.TileTax, Price: 100},
	}
	for id, t := range special {
		cp := t
		tiles[id] = &cp
	}

	return tiles
}

// GroupSizes reports how many properties complete each color group.
func GroupSizes() map[string]int {
	return map[string]int{
		"violet": 2, "lightblue": 3, "pink": 3, "orange": 3,
		"red": 3, "yellow": 3, "green": 3, "darkblue": 2,
		"railroad": 4, "utility": 2,
	}
}
