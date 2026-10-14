"""
Seed list of Bangalore Durga Pujas for 2026 (research snapshot, 14 Oct 2026).

Every row cites the guides it came from (see SOURCES). Coordinates are
ESTIMATES from landmark knowledge unless coord_confidence == "high" - run
`python scripts/build_seed.py --geocode` on a machine with internet to refine
them via OpenStreetMap Nominatim, and let users fix pins in-app ("Fix location").

This file is only the *seed*. Once the Google Sheet is set up it becomes the
single source of truth, exactly like the Niram roster.
"""

SOURCES = {
    "S1": "https://mytravellingstilettos.com/top-places-to-see-durga-puja-in-bangalore/",
    "S2": "https://pujo.newzchain.com/guides/popular-durga-puja-pandals-bangalore-2026",
    "S3": "https://newsable.asianetnews.com/gallery/lifestyle/bengaluru-durga-puja-guide-2026-10-pandals-to-visit-for-memorable-celebration-pq2n2lo",
    "S4": "https://isharethese.com/top-durga-puja-pandals-in-bangalore/",
    "S5": "https://lbb.in/bangalore/durga-pujo-pandal-bangalore/",
    "S6": "https://curlytales.com/india/durgapuja/6-durga-puja-pandals-to-go-pandal-hopping-in-bengaluru/amp/",
    "S7": "https://www.theweek.in/wire-updates/national/2025/09/24/mds4-ka-bengali-durga-pooja.html",
    "S8": "https://newskarnataka.com/bengaluru/bengaluru-gears-up-for-durga-puja-with-grand-themes-and-unique-celebrations/19092025/",
    "S9": "https://hindupad.com/durga-puja-pandals-in-bangalore-adresses-of-bangalore-durga-puja/",
    "S10": "https://citizenmatters.in/529-bengali-pujas/",
    "S11": "https://ebcafamily.com/durga-puja-bangalore-2026.php",
    "S12": "https://rtnagardurgapuja.org/",
    "S13": "https://en.wikipedia.org/wiki/Sarathi_Socio_Cultural_Trust",
    "S14": "https://www.outlooktraveller.com/amp/story/destinations/india/cant-be-in-bengal-for-durga-puja-2025-heres-where-to-celebrate-in-delhi-mumbai-bengaluru",
    "S15": "https://www.bhromon.in/2025/09/durga-puja-in-bangalore-and-cultural.html",
    "S16": "https://hindupad.com/durga-puja-2009-golden-jubilee-durga-pooja-for-bengali-association-in-bangalore/",
    "S17": "https://citizenmatters.in/3448-durga-puja-bangalore-kolkata-style/",
    "R1": "Instagram reel shared by user (Oct 2026): 'Bengaluru's Durga Puja Pandals You Must Visit' (20 pandals)",
    "R2": "Instagram reel shared by user (Oct 2026): 'Best Durga Pooja Pandals Places in Bangalore' (14 pandals)",
    "R4": "Instagram reel @theraahi.in shared by user (Oct 2026): 'POV: You're in Bengaluru during Durga Puja 2026' (29 pujos)",
    "R3": "Instagram reel @lifewith_ud shared by user (Oct 2026): 'Durga Puja Celebration in Bangalore Part 1' (12 Whitefield-side pandals)",
}

# fields: id, name, short_name, area, zone, venue, lat, lng, coord_confidence,
#         since_year, edition_2026, type, entry, known_for, theme_2026,
#         highlights_2026, nearest_metro, bhog, pet_friendly, parking, status_2026, sources
P = []
def add(id, name, short, area, zone, venue, lat, lng, conf, since="", edition="", type="Community association",
        entry="Open to all", known_for="", theme="", highlights="", metro="", bhog="", pet="", parking="",
        status="Listed 2026", src=""):
    P.append(dict(id=id, name=name, short_name=short, area=area, zone=zone, venue=venue,
                  latitude=lat if lat is not None else "", longitude=lng if lng is not None else "",
                  coord_confidence=conf, since_year=since, edition_2026=edition, type=type, entry=entry,
                  known_for=known_for, theme_2026=theme, highlights_2026=highlights, nearest_metro=metro,
                  bhog=bhog, pet_friendly=pet, parking=parking, status_2026=status, sources=src))

# ---------------- CENTRAL ----------------
add("BLR001", "The Bengalee Association, Bangalore – Shri Shri Durga Puja", "Bengalee Association (Ulsoor)",
    "Ulsoor / Halasuru", "Central", "1/A Assaye Rd, Sivanchetti Gardens (formerly RBANMS Ground)",
    12.9852, 77.6110, "medium", since="c.1959", type="Community association",
    known_for="Oldest and most iconic pujo in the city; food court (aloo bhaja, kosha mangsho); community lunch on donation; Anandamela",
    highlights="16–21 Oct; Anandamela on Panchami (15 Oct)", metro="Halasuru (Purple) ~1 km", bhog="Yes (donation)",
    status="Confirmed 2026", src="S1,S2,S3,S6,S9,S14,S16,R1,R2,R4")
add("BLR002", "Jayamahal Sarbajanin Durga Puja", "Jayamahal", "Jayamahal Extension", "Central",
    "Jayamahal Ladies Club ground, beside Jayamahal Park", 13.0015, 77.5985, "medium", since="1955", edition="72nd",
    type="Sarbojanin", known_for="Oldest sarbojanin in Bangalore; run by the same family for three generations; bhog, dhunuchi, dandiya night",
    highlights="72nd year", metro="None close", bhog="Yes", status="Confirmed 2026", src="S1,S2,S4,S5,S9,S10,R1,R4")
add("BLR003", "RT Nagar Sarbajanin Durga Puja (RT Nagar Socio Cultural Trust)", "RT Nagar (Palace Grounds)",
    "Palace Grounds / Bellary Rd", "Central", "Princess Shrine, Gate 9, Palace Grounds", 13.0040, 77.5895, "low",
    since="2006", edition="20th", known_for="One of the biggest; Kolkata/Krishnanagar artisans, Chandannagar lights, ~90 stalls, celebrity singers",
    highlights="Anandamela 15 Oct", metro="None close", parking="Palace Grounds (paid)", status="Confirmed 2026",
    src="S1,S2,S3,S6,S7,S12,R1,R2,R4")
add("BLR004", "Bengaluru Durga Puja Committee (BDPC)", "BDPC (Manpho, Nagavara)", "Nagavara / Hebbal", "North",
    "Manpho Convention Centre, Nagavara (2026 reels; one reel also lists a separate 'BDPC Puja, Palace Ground'; see BLR068)", 13.0450, 77.6205, "low",
    known_for="2025 'Nari Shakti' theme with all-women priests and women dhakis", highlights="16–21 Oct",
    metro="None close", parking="Paid (₹150 in 2025)", status="Confirmed 2026", src="S1,S2,S3,S4,S8,R1,R4")
add("BLR005", "Socio Cultural Association (SCA) Indiranagar", "SCA Indiranagar", "Indiranagar / New Tippasandra", "East",
    "Sishu Griha Senior School & Poorna Pragna School Ground, New Tippasandra", 12.9735, 77.6535, "low",
    since="c.1969", edition="58th", known_for="Free bhog for all; celebrity cultural nights",
    highlights="15–21 Oct; Anandamela 15 Oct", metro="Indiranagar (Purple) ~2.5 km", bhog="Free",
    status="Confirmed 2026", src="S1,S2,S3,S4,S6,S9,R1,R2,R4")
add("BLR006", "Prabaasee Association", "Prabaasee Malleswaram", "Malleswaram", "West",
    "The Canara Union, 8th Main (near Siddhivinayaka Temple)", 13.0030, 77.5690, "medium", since="1979",
    known_for="Old-Bangalore pujo", metro="Mantri Square / Srirampura (Green) ~1.5 km", parking="None",
    src="S1,S4,S9,R4")

# ---------------- SOUTH: Koramangala / HSR / BTM ----------------
add("BLR007", "Sarathi Socio-Cultural Trust Durga Puja", "Sarathi Koramangala", "Koramangala", "South",
    "Mangala Kalyana Mantapa lawn, 20th Main, KHB Colony", 12.9350, 77.6150, "low", since="2003", edition="24th",
    known_for="Huge crowds (1.5–2 lakh claimed); Senco Sharod Samman 2018; dhunuchi & conch contests; VIP and bhog passes",
    highlights="Anandamela & dhaki competition 15 Oct", metro="None close (Yellow line ~3 km)", bhog="Pass",
    status="Confirmed 2026", src="S1,S2,S4,S5,S6,S9,S13,R1,R2,R4")
add("BLR008", "Koramangala Kalyana Mantap Ground Durga Puja", "Koramangala KM Ground", "Koramangala 5th Block", "South",
    "Kalyana Mantap ground, Ganapathi Temple Rd (opposite Sarathi)", 12.9345, 77.6155, "low",
    known_for="Second pujo opposite Sarathi; combine both in one stop", src="S1,S4,S9")
add("BLR009", "Kolaj Socio-Cultural Trust", "Kolaj", "Koramangala 5th Block", "South",
    "Sri Krishna Temple Kalyana Mandapa, opp. Lazeez", 12.9340, 77.6175, "low",
    known_for="Creative theme pandals; kids' art contest; magic show", src="S1,S4,S6,S9")
add("BLR010", "East Indian Social HSR Association (EISHA)", "EISHA HSR", "HSR Layout", "South",
    "HSR BDA Complex, 12th Main, Sector 6", 12.9110, 77.6400, "medium", since="c.2016", edition="11th",
    known_for="Pet-friendly pujo; East Indian blend", theme="Jamini Roy-inspired",
    highlights="Chhau dance 19 Oct 7 pm", metro="Bommanahalli (Yellow) ~2 km", pet="Yes", status="Confirmed 2026", src="S1,S14,R1,R4")
add("BLR011", "Assam Society of Bangalore – Shree Shree Durga Puja", "Assam Society HSR", "HSR Layout", "South",
    "Freedom International School Ground, near ORR", 12.9200, 77.6470, "low", since="c.2013", edition="14th",
    known_for="Assamese pujo; dandiya; community lunch", highlights="16–21 Oct", status="Confirmed 2026", src="S1,S3,S4,R4")
add("BLR012", "South East Bengaluru Bengali Association (SEBBA)", "SEBBA", "HSR Layout", "South",
    "The White Housse, 14th Main", 12.9130, 77.6420, "low", src="S1")
add("BLR013", "Shree Jagannath Temple Trust, Agara", "Agara Jagannath", "Agara / HSR", "South",
    "Sri Jagannatha Swami Temple", 12.9250, 77.6440, "low", type="Temple", known_for="Durga worship in a temple complex (Odia)", src="S1")
add("BLR014", "Bengali in Bangalore (BinB) Durgotsav", "BinB", "Bannerghatta Rd / Dairy Circle", "South",
    "Chandrodaya Convention Centre", 12.9385, 77.5995, "low", known_for="Food stalls, fun fair; 'Thakur Barir' style pujo",
    metro="Jayadeva (Yellow) ~1.5 km", src="S1,S4,S17,R1,R2,R4")

# ---------------- SOUTH: JP Nagar / Bannerghatta / Kanakapura ----------------
add("BLR015", "Sanskritik Bengali Association Bangalore", "Sanskritik JP Nagar", "JP Nagar 6th Phase / Puttenahalli", "South",
    "Elite Banquet Hall, Puttenahalli Rd (plus code WH2M+X5X)", 12.9024, 77.5829, "high", since="c.2015", edition="12th",
    known_for="Traditional rituals; crafts decor", metro="Yelachenahalli (Green) ~2 km", status="Confirmed 2026", src="S1,S2,S5,S6,R1,R4")
add("BLR016", "Anandadhaara Bangalore Durga Puja", "Anandadhaara", "JP Nagar 1st Phase", "South",
    "JP Nagar Cultural & Welfare Assn open theatre, 25th Main", 12.9100, 77.5880, "low", since="c.2012", edition="15th",
    known_for="Locally popular; bhog", metro="JP Nagar (Green) ~1 km", bhog="Yes", src="S1,S2,S9")
add("BLR017", "South Bangalore Cultural Association (SBCA) Sarbojanin Durgotsav", "SBCA", "Hulimavu / Bannerghatta Rd", "South",
    "Ramalingeshwara Cave Temple, near Royal Meenakshi Mall", 12.8770, 77.6000, "low", since="c.1997", edition="30th",
    known_for="Band concerts; conch contest; dhunuchi; sandhya aarti", highlights="30th year; Anandamela 15 Oct",
    metro="Hulimavu (Pink, if open) ~1 km", status="Confirmed 2026", src="S1,S6,S9,S10,S17,R1")
add("BLR018", "Utsav Bangalore Durga Puja", "Utsav", "Bilekahalli / Vijaya Bank Layout", "South",
    "Mulki Sunder Ram Shetty Sabhangana, 9th Main", 12.8985, 77.6045, "low", since="2012", edition="15th",
    known_for="Bhog; cultural programmes", highlights="Starts 15 Oct", metro="IIMB (Pink, if open) ~1 km", bhog="Yes", src="S1,S2")
add("BLR019", "Kodichikkanahalli Sarbojanin Utsav Committee (KSUC)", "KSUC", "Bilekahalli", "South",
    "Siri Convention Hall, 60 Feet Rd", 12.8930, 77.6120, "low", since="2013", edition="14th", type="Sarbojanin",
    known_for="Bhog; cultural programmes", bhog="Yes", src="S1,S2")
add("BLR020", "Kanakapura Road Bengali Association (KARBA) – Amader Pujo", "KARBA", "Kanakapura Rd", "South",
    "Elaan Convention Centre (per 2026 reel; listed earlier at Shankaraa Foundation, Doddakallasandra)", 12.8860, 77.5600, "low", since="c.2012", edition="15th",
    known_for="Billed as the largest in South Bangalore; Kolkata street food", metro="Doddakallasandra (Green) area", src="S1,S2,S5,R1,R4")
add("BLR021", "Uttarahalli Residents' Cultural Association (URCA)", "URCA", "Vajarahalli", "South",
    "BRS Grandeur, 2nd Cross", 12.8780, 77.5470, "low", metro="Vajarahalli (Green) nearby", src="S1,S15")

# ---------------- SOUTH: Electronic City / Begur ----------------
add("BLR022", "BARSHA Mahapujo (Bengali Association for HSR & Sarjapur)", "BARSHA", "Electronic City", "South",
    "South Avenue Grounds, behind Electronic City metro (NICE toll gate)", 12.8480, 77.6595, "low",
    known_for="One of the largest; award-winning theme pandals; 30+ food stalls; book fair", theme="ANCHAL",
    highlights="16–21 Oct; new venue this year", metro="Electronic City (Yellow), walkable", status="Confirmed 2026",
    src="S1,S2,S3,S4,S5,S6,S8,R1,R2")
add("BLR023", "Electronic City Cultural Association (ECCA)", "ECCA", "Electronic City", "South",
    "White Feather Convention Centre, Hosur Rd", 12.8540, 77.6635, "low", since="c.2013", edition="14th",
    known_for="AC hall; daily bhog; shopping bazaar; good washrooms", highlights="16–21 Oct",
    metro="Electronic City (Yellow) ~1 km", bhog="Yes", status="Confirmed 2026", src="S1,S2,S3,S4,S5,R1,R4")
add("BLR024", "Ganga Vertica Durga Puja Samiti", "Ganga Vertica", "Electronic City", "South",
    "Ganga Vertica apartments, Neeladri Rd", 12.8395, 77.6555, "low", type="Apartment",
    entry="Open to all (per organisers)", known_for="Apartment pujo with a large online following",
    highlights="16–21 Oct", metro="Huskur Rd (Yellow) ~1.5 km", src="S1,S2")
add("BLR025", "Electronic City Kali Bari Durga Puja", "E-City Kali Bari", "Bettadasanapura", "South",
    "Kali Bari, Sai Shakthi Layout", 12.8665, 77.6440, "low", type="Temple", known_for="Metal Durga idol; temple open year-round", src="S1")
add("BLR026", "Trinayani Cultural Samiti", "Trinayani", "Electronic City Phase 1", "South",
    "Doddathoguru", 12.8490, 77.6480, "low", src="S1,S4,R4")
add("BLR027", "Begur Bengali Cultural Association (BBCA)", "Begur BBCA", "Begur / Yelenahalli", "South",
    "Milana Greens, Mylasandra Rd", 12.8680, 77.6200, "low", known_for="Food and cultural events all four days",
    highlights="Anandamela 15 Oct", src="S1,S15,R1,R4")
add("BLR028", "Rainbow Socio-Cultural Association", "Rainbow", "Bommasandra", "South",
    "Prakruthi Vilasa, Singena Agrahara", 12.8130, 77.7050, "low", metro="Bommasandra (Yellow) area", src="S1")
add("BLR029", "Agrani Socio-Cultural Association (ASCA)", "Agrani", "Electronic City", "South",
    "Sri Lakshmi Narayana & Ashta Lakshmi Temple", None, None, "none", since="c.2011", edition="16th", src="S1")

# ---------------- WEST ----------------
add("BLR030", "Aikatan Durgotsav", "Aikatan RR Nagar", "Rajarajeshwari Nagar", "West",
    "Subhas Bhavan Ground, Ideal Homes", 12.9230, 77.5180, "low", since="2011",
    known_for="2024 Dakshineswar-inspired pandal", highlights="16–21 Oct", metro="RR Nagar (Purple) ~1.5 km",
    status="Confirmed 2026", src="S1,S2,R2")
add("BLR031", "Ektara Socio-Cultural Organisation", "Ektara Kengeri", "Kengeri", "West",
    "Ektara Puja Ground near ACS College of Engineering", 12.9030, 77.4980, "low", known_for="Themed pandals", src="S1,R2")
add("BLR032", "North Bangalore Cultural Samithi (NBCS) – Bangalore Kali Bari", "NBCS Kali Bari", "Nandini Layout / Mahalakshmipuram", "West",
    "Bangalore Kali Bari, FTI Colony, opp. ISKCON", 13.0120, 77.5530, "low", since="1977", type="Temple",
    known_for="Durga Puja inside a Kali Mandir; also Kali & Jagaddhatri Puja", highlights="16–21 Oct",
    metro="Mahalakshmi (Green) ~1 km", status="Confirmed 2026", src="S1,S2,S4,S8,S9")
add("BLR033", "Bangiyo Parishad", "Bangiyo Parishad", "Yeshwanthpur / Jalahalli", "West",
    "HMT Executive Club premises", 13.0340, 77.5420, "low", src="S1")
add("BLR034", "Anandamayee Cultural Association", "Anandamayee Peenya", "Peenya", "West",
    "Daivajana Vasudev Shet Kalyana Mantapa, near Jalahalli metro", 13.0390, 77.5250, "low",
    metro="Jalahalli (Green)", status="Unconfirmed 2026", src="S1")
add("BLR035", "Durga Puja Committee, Air Force Station Jalahalli East", "AF Jalahalli East", "Jalahalli East", "West",
    "Sarvamurthy Temple, Air Force Station", 13.0480, 77.5540, "low", since="1978", type="Institutional / defence",
    entry="Restricted (defence campus)", status="Unconfirmed 2026", src="S1,S9")

# ---------------- NORTH ----------------
add("BLR036", "Oikotan Hebbal Durgotsav", "Oikotan Hebbal", "Hebbal / Jakkur", "North",
    "EBISU Convention Center, Hegde Nagar Main Rd", 13.0710, 77.6180, "low", since="2013",
    known_for="Big theme pandals; multiple Sharad Samman awards", theme="Egypt",
    highlights="Rahul Dutta 19 Oct; Lopamudra Mitra 20 Oct", metro="None", parking="Paid",
    status="Confirmed 2026", src="S1,S2,S4,S7,S8,R1,R2,R4")
add("BLR037", "Bongodhara Sarbajanin Durgotsav", "Bongodhara", "Thanisandra / Srinivaspura", "North",
    "White Pearl Convention Centre, Belahalli Cross", 13.0750, 77.6250, "low", since="c.2020", edition="7th",
    type="Sarbojanin", known_for="Bhog; cultural programmes", highlights="Anandamela 15 Oct", bhog="Yes", src="S1,S2")
add("BLR038", "Harmony Cultural and Welfare Association (HCWA) Sarbojonin Durgotsav", "HCWA Thanisandra", "Thanisandra", "North",
    "Harshodaya Convention Center, MCECHS Layout", 13.0600, 77.6330, "low", type="Sarbojanin",
    highlights="Lopamudra Mitra 18 Oct", src="S1,S15,R4")
add("BLR039", "Vivekananda Cultural Association", "VCA Yelahanka", "Yelahanka New Town", "North",
    "Nisarga Grounds, 5th Phase", 13.1050, 77.5810, "low", since="2002", edition="25th", metro="None", src="S1,S9")

# ---------------- EAST: Whitefield ----------------
add("BLR040", "Poorva Bangalore Cultural Association (PBCA)", "PBCA Whitefield", "Whitefield", "East",
    "KTPO, EPIP Zone", 12.9810, 77.7245, "medium", since="2004", edition="23rd",
    known_for="Large pujo; free parking", metro="Kundalahalli / Sri Sathya Sai Hospital (Purple) ~2 km",
    parking="Free", status="Confirmed 2026", src="S1,S2,S4,S9,S15,R2,R3,R4")
add("BLR041", "Whitefield Cultural Association (WCA)", "WCA Whitefield", "Whitefield / Nallurhalli", "East",
    "Behind Mahaveer Tranquil, Palm Meadows Rd", 12.9690, 77.7340, "low", since="c.2003", edition="24th",
    known_for="Mela-style fair with rides; bhog Saptami–Navami; dandiya", theme="Sun Chariot", bhog="Yes",
    status="Confirmed 2026", src="S1,S2,S5,S7,R1,R3,R4")
add("BLR042", "East Bengaluru Cultural Association (EBCA) Mahapujo", "EBCA Kadugodi", "Katamnallur / Kadugodi", "East",
    "Sri Manjunatha Swamy Kalyana Mantapa, Sannatammanahalli", 13.0180, 77.7580, "low",
    known_for="Krishnanagar idol; eco-friendly; AR posters (2025); Kerala food stall",
    highlights="Free entry; Patachitra live demo; dhunuchi & dandiya night 20 Oct", metro="Whitefield (Kadugodi) (Purple) ~4 km",
    status="Confirmed 2026", src="S1,S2,S3,S4,S8,S11,R2,R3")
add("BLR043", "Prestige Shantiniketan Durga Puja Samiti", "Prestige Shantiniketan", "Whitefield / ITPL Rd", "East",
    "Prestige Shantiniketan ground", 12.9915, 77.7300, "low", type="Apartment",
    entry="Residents first; gates may close to visitors when crowded", known_for="Huge ground; bhog on Ashtami",
    metro="Hoodi (Purple) area", src="S1,R3")
add("BLR044", "Prestige Lakeside Habitat Bengali Cultural Association", "Prestige Lakeside", "Varthur / Whitefield", "East",
    "Zephyr Clubhouse, Prestige Lakeside Habitat", 12.9420, 77.7490, "low", type="Apartment",
    entry="Open to all (per organisers)", src="S1")
add("BLR045", "Udaan Socio Cultural Society", "Udaan Whitefield", "Whitefield", "East",
    "Whitefield Convention Centre & Hotel, ITPL Main Rd", 12.9870, 77.7320, "low", metro="Nallurhalli (Purple), near", src="S1,R3")
add("BLR046", "Aarohan Socio-Cultural Forum", "Aarohan", "Seegehalli / Kadugodi", "East",
    "Ground adjacent to Assetz Marq", 13.0060, 77.7480, "low", src="S1,S7,S15,R3")
add("BLR047", "Bengaluru Sreehatta Sammelani (BSS Durga Pujo)", "BSS Hoodi (Sreehatta)", "Hoodi / KR Puram", "East",
    "The Occasion, Anup Layout, Basi Reddy Garden", 12.9930, 77.7160, "low",
    known_for="Sylheti traditions; bhog; pushpanjali", highlights="16–21 Oct", metro="Hoodi (Purple) ~1 km", bhog="Yes",
    status="Confirmed 2026", src="S1,S3,S15,R2,R3,R4")

# ---------------- EAST: KR Puram / CV Raman Nagar / Marathahalli ----------------
add("BLR048", "Jagriti Bangiyo Cultural Association (JBCA)", "JBCA KR Puram", "KR Puram / ITI Layout", "East",
    "ITI Hockey Ground, beside KR Puram hanging bridge", 13.0050, 77.6790, "medium",
    known_for="All-women dhakis; rides; food stalls", highlights="All-women dhakis", metro="KR Pura (Purple) ~1 km",
    parking="Paid (₹70 in 2025)", src="S1,S4,S6")
add("BLR049", "Abhinandan Cultural Association", "Abhinandan", "KR Puram", "East",
    "Silicon City College", 13.0000, 77.6900, "low", highlights="Anandamela 15 Oct 6:30–8:30 pm", metro="KR Pura (Purple)", src="S1,S7")
add("BLR050", "KR Puram Cultural and Welfare Trust", "KRCWT", "KR Puram / Devasandra", "East",
    "Sea College, Devasandra Main Rd", 13.0045, 77.6950, "low", highlights="Anandamela 15 Oct 7 pm", src="S1")
add("BLR051", "Kithaganur Durga Puja Association (KDPA)", "KDPA", "Kithaganur", "East",
    "Birla Open Minds Intl School, Kithaganur Main Rd", 13.0280, 77.7050, "low", src="S1")
add("BLR052", "Horamavu Bengali Cultural Association (HBCA)", "HBCA Horamavu", "Horamavu", "East",
    "Kalkere Main Rd", 13.0310, 77.6680, "low", src="S1")
add("BLR053", "Tripura Mondoli Durga Puja", "Tripura Mondoli", "Ramamurthy Nagar", "East",
    "Sainik Welfare Centre, Vijinapura", 13.0090, 77.6650, "low", src="S1")
add("BLR054", "Kaggadasapura Bengali Association", "Kaggadasapura", "Kaggadasapura / Malleshpalya", "East",
    "VK Convention Centre, 5th Main, Malleshpalya", 12.9880, 77.6780, "low", since="c.2007", edition="20th",
    known_for="Free basement parking; community lunch", highlights="Lopamudra Mitra 19 Oct", parking="Free",
    status="Confirmed 2026", src="S1,S4,S9")
add("BLR055", "KABYA", "KABYA Marathahalli", "Marathahalli", "East",
    "Ground opp. Marathahalli Police Station", 12.9560, 77.7000, "low", src="S1")
add("BLR056", "Bengaluru Cultural Association – BCA Munnekollal", "BCA Munnekolala", "Munnekolala", "East",
    "Government School, Munnekolala", 12.9490, 77.7140, "low", src="S1,S9")
add("BLR057", "Green Glen Layout Cultural Association (GGLCA)", "Green Glen Bellandur", "Bellandur", "East",
    "Sobha Lakeview Club House", 12.9240, 77.6750, "low", entry="Unclear (clubhouse venue)", src="S1,S8")

# ---------------- EAST: Sarjapur / Varthur ----------------
add("BLR058", "Sarjapur Outer Ring Road Bengali Association (SORRBA) Durgotsob", "SORRBA", "Sarjapur Rd / Sulikunte", "East",
    "Samskruti Pavilion, Sarjapur–Marathahalli Rd", 12.8900, 77.7350, "low", since="2009",
    known_for="Grand scale; live bands; dhunuchi; Bollywood nights", highlights="16–21 Oct",
    status="Confirmed 2026", src="S1,S2,S5,S6,S9,R1,R4")
add("BLR059", "Sukriti Cultural Association", "Sukriti", "Dommasandra", "East",
    "VMS Grandeur Convention Hall, Varthur–Sarjapur Rd", 12.8880, 77.7520, "low", src="S1,R3")
add("BLR060", "Sharbabharatiya Sylheti Forum", "Sylheti Forum", "Sulikunte / Sarjapur Rd", "East",
    "PSR Convention Centre", None, None, "none", known_for="Sylheti pujo", src="S1")
add("BLR061", "Bengaluru Sylheti Cultural Association (BSCA)", "BSCA", "Whitefield–Hoskote Rd (reel) / Dommasandra (2025 list)", "East",
    "Venue to confirm. Reel says Whitefield–Hoskote Rd; 2025 list says SR Akshatha Palace, Dommasandra", None, None, "none", known_for="Sylheti pujo", src="S1,R3")
add("BLR062", "Varthur Bengali Association", "Varthur", "Gunjur Palya", "East", "CSK Mall", None, None, "none", src="S1")
add("BLR063", "Swayamsiddha Socio Cultural Women's Trust", "Swayamsiddha", "Goravigere / Kannamangala", "East",
    "Sumadhura Banquet Hall", None, None, "none", known_for="Women-run trust", src="S1,R3")

# ---------------- Added from user-shared reels (Oct 2026) ----------------
add("BLR064", "Bongo Dol Bengaluru", "Bongo Dol", "Electronic City", "South",
    "Electronic City (exact venue to confirm)", None, None, "none", src="R1,R4")
add("BLR065", "VSCT Sarbajanin Durga Puja", "VSCT Sarjapur", "Sarjapur", "East",
    "Sarjapur (exact venue to confirm; may be the 'Sarjapur Durga Puja' in another reel)", None, None, "none", type="Sarbojanin", src="R2")
add("BLR066", "Namma Ashram Durga Puja", "Namma Ashram", "Nallurhalli / Whitefield", "East",
    "Nallurahalli Main Rd (exact venue to confirm)", None, None, "none", src="S1,R3")
add("BLR067", "Doddabanahalli Sarvajanik Sanskritik Samiti", "Doddabanahalli", "Doddabanahalli / Whitefield", "East",
    "Doddabanahalli (exact venue to confirm)", None, None, "none", type="Sarbojanin", src="R3")

# ---------------- Added from @theraahi.in reel (R4) ----------------
add("BLR068", "BDPC Durga Puja, Palace Ground", "BDPC (Palace Ground)", "Palace Grounds", "Central",
    "The Grand Castle, Gate 6, Palace Grounds (2025 venue). 2026 reel lists this AND BDPC Manpho; may be two pujos, verify",
    12.9985, 77.5890, "low", known_for="2025: 'Nari Shakti' theme, all-women priests and dhakis", parking="Paid (₹150 in 2025)",
    status="Listed 2026", src="S1,S3,S4,S8,R4")
add("BLR069", "Assam Association Bangalore", "Assam Association (HAL)", "HAL / Marathahalli", "East",
    "HAL Kalyana Mantapa (exact location to confirm)", None, None, "none", known_for="Assamese pujo", src="R4")
add("BLR070", "Utkal Welfare Trust Durga Puja", "Utkal (Odia) Whitefield", "Whitefield", "East",
    "Whitefield (exact venue to confirm)", None, None, "none", known_for="Odia pujo", src="R4")
add("BLR071", "Tridhaa Sarbojanin Durga Puja", "Tridhaa E-City", "Electronic City", "South",
    "Electronic City (exact venue to confirm)", None, None, "none", type="Sarbojanin", src="R4")
