package game

import "backend/pkg/models"

// propertyDef is a compact spec for building the 40-tile board.
type propertyDef struct {
	id        int
	nameBn    string
	nameEn    string
	price     int
	houseCost int
	group     string
}

// rentTiers derives [Base, 1H, 2H, 3H, 4H, Hotel] from a base rent.
func rentTiers(base int) []int {
	return []int{base, base * 5, base * 15, base * 30, base * 45, base * 60}
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
		{1, "স্বন্দীপ", "Swandip", 60, 50, "violet"},
		{3, "সীতাকুন্ড", "Sitakund", 60, 50, "violet"},
		{6, "পটিয়া", "Patiya", 100, 50, "lightblue"},
		{8, "আনোয়ারা", "Anwara", 100, 50, "lightblue"},
		{9, "সাতকানিয়া", "Satkania", 120, 50, "lightblue"},
		{11, "রাউজান", "Raozan", 140, 100, "pink"},
		{13, "ফটিকছড়ি", "Fatikchhari", 140, 100, "pink"},
		{14, "রাঙ্গুনিয়া", "Rangunia", 160, 100, "pink"},
		{16, "কোতোয়ালি", "Kotwali", 180, 100, "orange"},
		{18, "আন্দরকিল্লা", "Andarkilla", 180, 100, "orange"},
		{19, "চকবাজার", "Chakbazar", 200, 100, "orange"},
		{21, "জিইসি", "GEC", 220, 150, "red"},
		{23, "বাটালি হিল", "Batali Hill", 220, 150, "red"},
		// Plan §2.1 prices Dewanhat at ৳140 (red group: 220/220/140) —
		// kept exactly as specified.
		{24, "দেওয়ানহাট", "Dewanhat", 140, 150, "red"},
		{26, "হালিশহর", "Halishahar", 260, 150, "yellow"},
		{27, "অলংকার", "Alankar", 260, 150, "yellow"},
		{29, "আগ্রাবাদ", "Agrabad", 280, 150, "yellow"},
		{31, "মুরাদপুর", "Muradpur", 300, 200, "green"},
		{32, "বহদ্দারহাট", "Bahaddarhat", 300, 200, "green"},
		{34, "চান্দগাঁও", "Chandgaon", 320, 200, "green"},
		{37, "খুলশী", "Khulshi", 350, 200, "darkblue"},
		{39, "পাঁচলাইশ", "Panchlaish", 400, 200, "darkblue"},
	}

	baseRent := map[string]int{
		"violet": 2, "lightblue": 6, "pink": 10, "orange": 14,
		"red": 18, "yellow": 22, "green": 26, "darkblue": 35,
	}
	// Scale base rent slightly with price inside the group so the
	// 3rd (premium) tile in each group pays a bit more.
	priceBonus := func(p propertyDef) int {
		return p.price / 100
	}

	for _, p := range props {
		base := baseRent[p.group] + priceBonus(p)
		tiles[p.id] = &models.Tile{
			ID:        p.id,
			NameBn:    p.nameBn,
			NameEn:    p.nameEn,
			Type:      models.TileProperty,
			Price:     p.price,
			RentTiers: rentTiers(base),
			HouseCost: p.houseCost,
			Group:     p.group,
		}
	}

	railroads := []propertyDef{
		{5, "পাহাড়তলী স্টেশন", "Pahartali Station", 200, 0, "railroad"},
		{15, "চট্টগ্রাম জংশন", "Chattogram Junction", 200, 0, "railroad"},
		{25, "ষোলশহর স্টেশন", "Sholoshahar Station", 200, 0, "railroad"},
		{35, "বিমানবন্দর", "Airport", 200, 0, "railroad"},
	}
	for _, r := range railroads {
		tiles[r.id] = &models.Tile{
			ID:     r.id,
			NameBn: r.nameBn,
			NameEn: r.nameEn,
			Type:   models.TileRailroad,
			Price:  200,
			Group:  "railroad",
		}
	}

	utils := []propertyDef{
		{12, "পিডিবি", "PDB Power Grid", 150, 0, "utility"},
		{28, "ওয়াসা", "WASA", 150, 0, "utility"},
	}
	for _, u := range utils {
		tiles[u.id] = &models.Tile{
			ID:     u.id,
			NameBn: u.nameBn,
			NameEn: u.nameEn,
			Type:   models.TileUtility,
			Price:  150,
			Group:  "utility",
		}
	}

	special := map[int]models.Tile{
		0:  {ID: 0, NameBn: "শুরু", NameEn: "GO", Type: models.TileGo},
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
