"""
Seed "must-catch moments" for 2026. pandal_id "*" = citywide ritual calendar.
time_confirmed = FALSE means the date is sourced but the clock time is a
placeholder evening window - the committee (or anyone) should correct it.
Dates: Panchami 15 Oct, Shashthi 16, Saptami 18 (some pujos treat 17 as
Saptami - Bisuddha vs Gupta Press panjika), Ashtami 19, Navami 20, Dashami 21.
Sandhi Puja timing is Belur Math's (10:28–11:16 IST); local pujos may vary.
"""
E = []
def ev(pid, date, start, end, title, kind, confirmed=True, src=""):
    E.append(dict(pandal_id=pid, date=date, start=start, end=end, title=title, kind=kind,
                  time_confirmed="TRUE" if confirmed else "FALSE", source=src))

# Citywide ritual calendar
ev("*", "2026-10-15", "17:00", "22:00", "Panchami: Anandamela at many pujos", "festival", False)
ev("*", "2026-10-16", "18:00", "20:00", "Shashthi: Bodhan (Belur Math 6:15 pm)", "ritual", True, "belurmath.org")
ev("*", "2026-10-18", "07:00", "11:00", "Saptami: Nabapatrika snan & morning puja", "ritual", False)
ev("*", "2026-10-19", "08:00", "10:30", "Ashtami: Pushpanjali (most pujos)", "anjali", False)
ev("*", "2026-10-19", "10:28", "11:16", "Sandhi Puja (Belur Math timing)", "sandhi", True, "belurmath.org")
ev("*", "2026-10-20", "19:00", "22:00", "Navami: dhunuchi naach evenings", "cultural", False)
ev("*", "2026-10-21", "10:00", "15:00", "Bijoya Dashami: Sindoor Khela", "sindoor", False)

# Pandal-specific (dates sourced; times flagged)
ev("BLR001", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR005", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR007", "2026-10-15", "17:00", "22:00", "Anandamela & dhaki competition", "festival", False, "S1")
ev("BLR003", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR017", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR027", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR037", "2026-10-15", "17:00", "22:00", "Anandamela", "festival", False, "S1")
ev("BLR049", "2026-10-15", "18:30", "20:30", "Anandamela", "festival", True, "S1")
ev("BLR050", "2026-10-15", "19:00", "21:30", "Anandamela", "festival", False, "S1")
ev("BLR038", "2026-10-18", "19:00", "22:00", "Lopamudra Mitra live", "cultural", False, "S1")
ev("BLR036", "2026-10-19", "19:00", "22:00", "Rahul Dutta live", "cultural", False, "S1,S2")
ev("BLR054", "2026-10-19", "19:00", "22:00", "Lopamudra Mitra live", "cultural", False, "S1")
ev("BLR010", "2026-10-19", "19:00", "21:00", "Chhau dance", "cultural", True, "S1")
ev("BLR036", "2026-10-20", "19:00", "22:00", "Lopamudra Mitra live", "cultural", False, "S1,S2")
ev("BLR042", "2026-10-20", "19:00", "22:30", "Dhunuchi & dandiya night", "cultural", False, "S11")
