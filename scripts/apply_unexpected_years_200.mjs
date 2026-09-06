import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';

const databasePath='data/song-database.json';
const cataloguePath='data/catalogue.json';
const auditPath='verification/unexpected-years-200-selection.json';
const targetTotal=200;
const selected=[
  {
    "songId": "song_c7ffdbd63eb83a8500b0",
    "signal": "ahead",
    "reason": "Often cited as proto-rock; sounds later than 1951."
  },
  {
    "songId": "song_1126480839a4b64d5b46",
    "signal": "ahead",
    "reason": "The beat and guitar language sound foundational to much later rock."
  },
  {
    "songId": "song_00babb63f6224753877f",
    "signal": "ahead",
    "reason": "Early rock recording that can be placed later than 1955."
  },
  {
    "songId": "song_22910f5065d96395ad09",
    "signal": "ahead",
    "reason": "Rock-era sound arrived earlier than many players expect."
  },
  {
    "songId": "song_12f51c9c80377757994e",
    "signal": "ahead",
    "reason": "Canonical rockabilly sound is easy to place in the later 1950s."
  },
  {
    "songId": "song_a208ca6226b6cd341636",
    "signal": "timeless",
    "reason": "Still sounds like the archetypal rock-and-roll era rather than a specific year."
  },
  {
    "songId": "song_e7630f093837ab1b9df0",
    "signal": "timeless",
    "reason": "Johnny Cash's signature sound can be mentally dated later."
  },
  {
    "songId": "song_451cabf70075c1c04a26",
    "signal": "timeless",
    "reason": "A durable rock-and-roll standard often remembered as generically late-1950s."
  },
  {
    "songId": "song_9f1aecd68fb0990782b4",
    "signal": "revival",
    "reason": "Later cover and film associations blur the original recording's year."
  },
  {
    "songId": "song_0b3fbe1381c795d69509",
    "signal": "timeless",
    "reason": "Instrumental has stayed culturally current well beyond 1958."
  },
  {
    "songId": "song_d2d00689e570655216a7",
    "signal": "sounds_older",
    "reason": "Folk style can make its recorded release chronology counter-intuitive."
  },
  {
    "songId": "song_f081e1eadbdf96fa616b",
    "signal": "ahead",
    "reason": "Production points toward the 1960s despite a 1959 release."
  },
  {
    "songId": "song_e2812bde48480217fc1a",
    "signal": "ahead",
    "reason": "Instrumental guitar sound is easily placed later in the surf era."
  },
  {
    "songId": "song_3b029bb0d64115dcf537",
    "signal": "timeless",
    "reason": "Dance-craze familiarity obscures its exact early-1960 release."
  },
  {
    "songId": "song_9f0d12fdab9d639615e4",
    "signal": "ahead",
    "reason": "Motown sound can feel a few years later than 1960."
  },
  {
    "songId": "song_4f2c83c1347e52b041d8",
    "signal": "ahead",
    "reason": "Classic Motown production often reads mid-1960s."
  },
  {
    "songId": "song_143fc16ffce4ad6b3ccc",
    "signal": "timeless",
    "reason": "Blues-rock afterlife makes the original year easy to overestimate."
  },
  {
    "songId": "song_76fb008a3837f92e8cba",
    "signal": "timeless",
    "reason": "Decades of covers make the original chronology less obvious."
  },
  {
    "songId": "song_2ec90ca3eb8dbce008f5",
    "signal": "cover_confusion",
    "reason": "The Beatles association can pull guesses toward 1963-64."
  },
  {
    "songId": "song_1225853feb7f377c8bcd",
    "signal": "timeless",
    "reason": "Wall-of-sound production has remained unusually modern."
  },
  {
    "songId": "song_8afa00dd6d05b96b8960",
    "signal": "timeless",
    "reason": "US breakthrough association can pull guesses into 1964."
  },
  {
    "songId": "song_c7d326233f2ad81aa6c2",
    "signal": "ahead",
    "reason": "Production and songwriting sophistication can sound later."
  },
  {
    "songId": "song_7429386bf1d0a371cccb",
    "signal": "timeless",
    "reason": "Garage-rock template sounds detached from a single year."
  },
  {
    "songId": "song_221a2dad0945643f1276",
    "signal": "timeless",
    "reason": "Polished pop sound and later cultural use blur its year."
  },
  {
    "songId": "song_24b7f735c2cae85174a5",
    "signal": "timeless",
    "reason": "Rock-standard status makes the exact year less obvious."
  },
  {
    "songId": "song_ae2b449fc4de1afc8d79",
    "signal": "timeless",
    "reason": "Bright folk-rock sound can be mentally placed later."
  },
  {
    "songId": "song_0daf59beb5df454a95f2",
    "signal": "revival",
    "reason": "Later punk covers can pull guesses toward the 1970s."
  },
  {
    "songId": "song_4bb9b3f6a5b26e45203e",
    "signal": "timeless",
    "reason": "Ubiquity obscures the exact mid-1960s date."
  },
  {
    "songId": "song_71f6d3e104744a04a7a3",
    "signal": "timeless",
    "reason": "Soul standard has remained culturally evergreen."
  },
  {
    "songId": "song_a9c30a180c249a3d8b07",
    "signal": "ahead",
    "reason": "Long form and electric production still feel unusually modern for 1965."
  },
  {
    "songId": "song_80d28f973790c8098a2a",
    "signal": "ahead",
    "reason": "Organ-driven garage sound anticipates later punk/new-wave textures."
  },
  {
    "songId": "song_4b5a1ba9aaeb64516223",
    "signal": "ahead",
    "reason": "Psychedelic sound arrives earlier than many players expect."
  },
  {
    "songId": "song_4ee50b8dc75e0d9bfc59",
    "signal": "ahead",
    "reason": "Studio production sounds strikingly advanced for 1966."
  },
  {
    "songId": "song_8d8c76f6ac3b29215455",
    "signal": "timeless",
    "reason": "Classic-rock afterlife blurs its exact 1967 origin."
  },
  {
    "songId": "song_88b4d8d0da528d0eafaa",
    "signal": "timeless",
    "reason": "Long-lived classic-rock presence obscures exact year."
  },
  {
    "songId": "song_54e7e4580f16b7e85875",
    "signal": "revival",
    "reason": "Later global dance revivals make the 1967 recording easy to place later."
  },
  {
    "songId": "song_1330f87f5fe3522674cf",
    "signal": "timeless",
    "reason": "Hendrix recording is commonly remembered without a precise year."
  },
  {
    "songId": "song_e39c647dc63b9f92a773",
    "signal": "timeless",
    "reason": "Biker-film associations and classic-rock longevity blur chronology."
  },
  {
    "songId": "song_e5695089759e080a171e",
    "signal": "ahead",
    "reason": "Heavy psychedelic production can sound early-1970s."
  },
  {
    "songId": "song_1cc79993b503ab28517a",
    "signal": "ahead",
    "reason": "Funk groove feels like a template for much later music."
  },
  {
    "songId": "song_0c8e881f62fd630c290b",
    "signal": "timeless",
    "reason": "Persistent film/game usage keeps it detached from its original year."
  },
  {
    "songId": "song_f6c1a468b0eca846dbd3",
    "signal": "later_breakthrough",
    "reason": "Its major chart breakthrough came years after the recording's release era."
  },
  {
    "songId": "song_ef7b86a2f514639de9a8",
    "signal": "timeless",
    "reason": "Later covers make the original Leon Russell year less obvious."
  },
  {
    "songId": "song_f0a97c3478679ef9d3fe",
    "signal": "cover_confusion",
    "reason": "Santana's version is often conflated with earlier/later versions and eras."
  },
  {
    "songId": "song_085ac98224a6a2223759",
    "signal": "revival",
    "reason": "Annual recurrence makes a 1970 release surprisingly early."
  },
  {
    "songId": "song_a35d2b4f68f5e4839a06",
    "signal": "timeless",
    "reason": "Bowie's later fame can pull guesses later than 1971."
  },
  {
    "songId": "song_57c69d8c3335e6354a13",
    "signal": "timeless",
    "reason": "Classic-rock longevity makes its exact early-1970s date fuzzy."
  },
  {
    "songId": "song_fc61890780c6227af8df",
    "signal": "revival",
    "reason": "Later film and streaming revival strengthened its cultural presence decades later."
  },
  {
    "songId": "song_0fbabde6b115690b6f6a",
    "signal": "ahead",
    "reason": "Groove and production remain unusually fresh."
  },
  {
    "songId": "song_31edeb20952da6a65fec",
    "signal": "ahead",
    "reason": "Cinematic production can sound later than 1972."
  },
  {
    "songId": "song_e650121972bb37ad7a72",
    "signal": "timeless",
    "reason": "Riff ubiquity detaches it from its exact year."
  },
  {
    "songId": "song_b04c72adb5a66275bfb1",
    "signal": "ahead",
    "reason": "Production and subject matter can read later than 1972."
  },
  {
    "songId": "song_8f3b290119e809f79318",
    "signal": "sounds_later",
    "reason": "Aerosmith's later peak can make this debut-era song seem younger."
  },
  {
    "songId": "song_c3eee70750ee5be6fd3f",
    "signal": "timeless",
    "reason": "Classic-rock status makes the exact year non-obvious."
  },
  {
    "songId": "song_9c74ae61fbe892076766",
    "signal": "ahead",
    "reason": "Disco-era sound arrives before the genre's commercial peak."
  },
  {
    "songId": "song_0b9706606b8f3114580a",
    "signal": "cover_confusion",
    "reason": "Whitney Houston's 1990s version dominates cultural memory."
  },
  {
    "songId": "song_c487037af5e8f8f06405",
    "signal": "timeless",
    "reason": "Novelty hit is usually remembered as generic disco-era rather than 1974."
  },
  {
    "songId": "song_c4a533112ca5aae03d07",
    "signal": "ahead",
    "reason": "Disco sound appears strikingly early in the decade."
  },
  {
    "songId": "song_ebe56ea5ec62ce255057",
    "signal": "timeless",
    "reason": "Long-running cultural presence obscures the exact release year."
  },
  {
    "songId": "song_3c59b3d6fa14e980dac9",
    "signal": "revival",
    "reason": "Run-D.M.C.'s 1986 remake can pull guesses a decade later."
  },
  {
    "songId": "song_8b6b72e5b0360e370c1a",
    "signal": "timeless",
    "reason": "ABBA revival cycles make the precise year less obvious."
  },
  {
    "songId": "song_7db448335980dfc84d5c",
    "signal": "sounds_later",
    "reason": "Polished arena-rock production can sound closer to the 1980s."
  },
  {
    "songId": "song_b0e69780e6e9f45aff64",
    "signal": "timeless",
    "reason": "Genre-standard status makes exact year difficult."
  },
  {
    "songId": "song_46a4455a31050c2726f6",
    "signal": "timeless",
    "reason": "Long sales life and theatrical sound blur the original year."
  },
  {
    "songId": "song_bc611b6e3442dc772b08",
    "signal": "revival",
    "reason": "Major social-media revival decades later makes the original year easy to miss."
  },
  {
    "songId": "song_cae1621b426c432431a0",
    "signal": "ahead",
    "reason": "Synth-funk production points toward later electronic music."
  },
  {
    "songId": "song_5789f221c273cdaae0dd",
    "signal": "timeless",
    "reason": "Disco standard is often dated generically to the late 1970s."
  },
  {
    "songId": "song_a0c25b1221ddd9b1bd0c",
    "signal": "timeless",
    "reason": "Saturday Night Fever association often shifts guesses to the film/album cycle."
  },
  {
    "songId": "song_ed2db4bcb1d6b7a79cf6",
    "signal": "ahead",
    "reason": "New-wave/disco blend can sound early-1980s."
  },
  {
    "songId": "song_95f374e7a4b8958fdf07",
    "signal": "ahead",
    "reason": "Production stayed influential well into later dance music."
  },
  {
    "songId": "song_e5db56082791d672cb45",
    "signal": "sounds_later",
    "reason": "The Police's 1980s peak can pull guesses later."
  },
  {
    "songId": "song_78b409a9c34b6d1d030c",
    "signal": "sounds_later",
    "reason": "Yacht-rock associations often read as early 1980s."
  },
  {
    "songId": "song_d3476e5c55012091ec2c",
    "signal": "retro_confusion",
    "reason": "Deliberately 1950s-style rockabilly can pull guesses far earlier."
  },
  {
    "songId": "song_b6dfd0f3550738a8dc89",
    "signal": "sounds_later",
    "reason": "Power-pop sound is easily placed in the early 1980s."
  },
  {
    "songId": "song_0691b41c4c52e181abd8",
    "signal": "ahead",
    "reason": "Mainstream hip-hop landmark arrives earlier than many expect."
  },
  {
    "songId": "song_4bbeca521ee7daec21da",
    "signal": "timeless",
    "reason": "Disco standard has stayed culturally evergreen."
  },
  {
    "songId": "song_209463a375023db29a97",
    "signal": "timeless",
    "reason": "Event-play ubiquity makes the original year easy to overlook."
  },
  {
    "songId": "song_fd3e6d7449487b449a08",
    "signal": "timeless",
    "reason": "Film/TV associations blur the recording's exact year."
  },
  {
    "songId": "song_1bac1d8ff74c4750d93f",
    "signal": "ahead",
    "reason": "Production has a durable modern feel for 1980."
  },
  {
    "songId": "song_43f838b57455f29192da",
    "signal": "timeless",
    "reason": "Distinctive production can be placed anywhere in the early 1980s."
  },
  {
    "songId": "song_ddf494b0b12f28cbd570",
    "signal": "revival",
    "reason": "Huge 2000s TV/streaming revival can make it feel much newer."
  },
  {
    "songId": "song_40e1478a2bf623616a79",
    "signal": "timeless",
    "reason": "Rock-standard status obscures its exact release year."
  },
  {
    "songId": "song_51c758de6d7bdaa175a0",
    "signal": "title_misdirection",
    "reason": "The title itself strongly tempts a 1999 guess."
  },
  {
    "songId": "song_135d4bc10adbc158d432",
    "signal": "revival",
    "reason": "Internet-era revival gives the track a much later cultural life."
  },
  {
    "songId": "song_db737420ffde8c915426",
    "signal": "timeless",
    "reason": "Often remembered simply as an 80s hit without a precise year."
  },
  {
    "songId": "song_2305a63b8f720bd2d23a",
    "signal": "ahead",
    "reason": "Synth-pop production feels like a defining later-80s sound."
  },
  {
    "songId": "song_dfcbd8f3d0301655986e",
    "signal": "timeless",
    "reason": "Cross-market release history can shift remembered year."
  },
  {
    "songId": "song_1cb08a1925247ce1dc84",
    "signal": "timeless",
    "reason": "1980s-icon status obscures precise year."
  },
  {
    "songId": "song_28fb9a4553542eb96374",
    "signal": "later_breakthrough",
    "reason": "Its later US chart peak can pull guesses toward 1988."
  },
  {
    "songId": "song_c52b96038bf06df6cf6e",
    "signal": "revival",
    "reason": "Later covers, especially 1990s onward, dominate cultural memory."
  },
  {
    "songId": "song_10064369b4be9a8232a0",
    "signal": "timeless",
    "reason": "Production bridges mid- and late-1980s aesthetics."
  },
  {
    "songId": "song_9f105720ad6147bd176d",
    "signal": "timeless",
    "reason": "Iconic video-era association obscures exact year."
  },
  {
    "songId": "song_dc01abdcad19ac705cdd",
    "signal": "revival",
    "reason": "Repeated soundtrack and social-media reuse keeps it culturally current."
  },
  {
    "songId": "song_84961d899efc680565d2",
    "signal": "ahead",
    "reason": "Production and video legacy can make it feel later."
  },
  {
    "songId": "song_fa2bebb56fdfdec71e03",
    "signal": "revival",
    "reason": "Later sampling and reinterpretation blur the original year."
  },
  {
    "songId": "song_2aa3410fdc18322056c6",
    "signal": "revival",
    "reason": "Recent advertising/social revival makes the track feel newer."
  },
  {
    "songId": "song_d9f06353da86dd3fbda2",
    "signal": "timeless",
    "reason": "Era-defining status makes the exact year less obvious."
  },
  {
    "songId": "song_bc86813776d674c8f655",
    "signal": "timeless",
    "reason": "Persistent popularity obscures precise year."
  },
  {
    "songId": "song_98275822caadba3e7ad8",
    "signal": "ahead",
    "reason": "Sparse production can sound more modern than 1987."
  },
  {
    "songId": "song_41ba25ac2033efbd4805",
    "signal": "ahead",
    "reason": "Hip-hop/pop production points toward the early 1990s."
  },
  {
    "songId": "song_a71637b4069bb19a4e0b",
    "signal": "sounds_later",
    "reason": "Nirvana's 1990s breakthrough pulls guesses later."
  },
  {
    "songId": "song_e2d62255a32538318d2f",
    "signal": "timeless",
    "reason": "Global-dance association makes exact year difficult."
  },
  {
    "songId": "song_e89a9ff7ef98eb287ff2",
    "signal": "timeless",
    "reason": "Long-running pop prominence blurs its exact late-80s year."
  },
  {
    "songId": "song_e65e1ab8c3935c8c0707",
    "signal": "ahead",
    "reason": "Club production is easy to place in the early 1990s."
  },
  {
    "songId": "song_97e73ca4fda13a2f8b93",
    "signal": "ahead",
    "reason": "Electronic production has aged unusually well."
  },
  {
    "songId": "song_a93d6d3846b27f71b1ad",
    "signal": "timeless",
    "reason": "Early mainstream rap hit is often remembered as generically early-90s."
  },
  {
    "songId": "song_5f2e76d413472d186124",
    "signal": "ahead",
    "reason": "Eurodance sound anticipates the mid-1990s."
  },
  {
    "songId": "song_8b67630ded5413ca93ed",
    "signal": "sounds_older",
    "reason": "Classic hard-rock sound can easily be placed in the 1980s."
  },
  {
    "songId": "song_8ae121fac3a9d13d0157",
    "signal": "ahead",
    "reason": "House-influenced pop production points forward into the decade."
  },
  {
    "songId": "song_196a99b848803ea52422",
    "signal": "ahead",
    "reason": "Alternative-funk sound remains unusually contemporary."
  },
  {
    "songId": "song_287476e6e56fe3e77db6",
    "signal": "timeless",
    "reason": "Persistent airplay detaches it from its exact year."
  },
  {
    "songId": "song_befe80544a068d1c9fb8",
    "signal": "timeless",
    "reason": "Grunge-era landmark often gets placed slightly later."
  },
  {
    "songId": "song_8372e80d6ef992aa4d15",
    "signal": "revival",
    "reason": "2020s film/social revival strongly renewed the song."
  },
  {
    "songId": "song_072e76b7d8f9e86211a4",
    "signal": "sounds_later",
    "reason": "Its long 1990s radio life can shift guesses later."
  },
  {
    "songId": "song_54b1c852e420e452c9b5",
    "signal": "ahead",
    "reason": "Euro-pop production points toward mid-1990s pop."
  },
  {
    "songId": "song_15185bb20a9e07de2d70",
    "signal": "sounds_later",
    "reason": "Aggressive alt-metal sound can be placed later in the 1990s."
  },
  {
    "songId": "song_ec96beaae5327524baca",
    "signal": "ahead",
    "reason": "Eurodance sound became even more characteristic later in the decade."
  },
  {
    "songId": "song_4bccd3d282dd476f234e",
    "signal": "timeless",
    "reason": "Nirvana's legacy makes precise release chronology non-obvious."
  },
  {
    "songId": "song_2d80c186c70d1b45acb2",
    "signal": "sounds_later",
    "reason": "Often mentally grouped with later-1990s alternative rock."
  },
  {
    "songId": "song_e7f7d5e0d1a383eb9e3b",
    "signal": "revival",
    "reason": "Continued streaming and social revival can make it feel later."
  },
  {
    "songId": "song_5086d8cd63b075e5b3ba",
    "signal": "sounds_later",
    "reason": "Many listeners associate its peak with 1994."
  },
  {
    "songId": "song_66d46918f675a9bf6c8a",
    "signal": "timeless",
    "reason": "Sports-arena afterlife obscures its original year."
  },
  {
    "songId": "song_5c67d8ce93ce2d3dd678",
    "signal": "revival",
    "reason": "Annual chart returns make the mid-1990s origin surprising."
  },
  {
    "songId": "song_02679ef47f0c616f1736",
    "signal": "timeless",
    "reason": "Pop-punk longevity makes the exact year fuzzy."
  },
  {
    "songId": "song_9d86c293f72802d8b564",
    "signal": "ahead",
    "reason": "Trip-hop production still sounds strikingly modern."
  },
  {
    "songId": "song_12ffb9dc1e901f20a92b",
    "signal": "timeless",
    "reason": "Long cultural afterlife obscures precise year."
  },
  {
    "songId": "song_c9dcfcddadaf52b322ca",
    "signal": "revival",
    "reason": "Later club and meme revival renewed its popularity."
  },
  {
    "songId": "song_c03265ca4e233da8bee6",
    "signal": "timeless",
    "reason": "Ubiquity makes exact mid-90s dating difficult."
  },
  {
    "songId": "song_0316a88ab391b18d0094",
    "signal": "ahead",
    "reason": "Production can read as late-1990s/early-2000s."
  },
  {
    "songId": "song_ac9a83675c3db8a0cadb",
    "signal": "cover_confusion",
    "reason": "Natalie Imbruglia's version and later ubiquity make its chronology less obvious."
  },
  {
    "songId": "song_cddf0327c4c567a5fded",
    "signal": "timeless",
    "reason": "U2's long career can make this feel either 1990s or 2000s."
  },
  {
    "songId": "song_93c400cee06735fc034f",
    "signal": "sounds_later",
    "reason": "Coldplay's later dominance can pull guesses later."
  },
  {
    "songId": "song_861ece635d144ea42277",
    "signal": "ahead",
    "reason": "Genre-blending production still sounds modern."
  },
  {
    "songId": "song_4b5326447a6898698d29",
    "signal": "sounds_later",
    "reason": "Pop-punk peak association can pull guesses toward 2002-04."
  },
  {
    "songId": "song_16ab047b2ac9021a4b3f",
    "signal": "sounds_later",
    "reason": "Its international peak is often associated with 2002."
  },
  {
    "songId": "song_f5d6de3b93625921a9d9",
    "signal": "timeless",
    "reason": "Meme/film afterlife keeps it culturally current."
  },
  {
    "songId": "song_961887ecb18450261996",
    "signal": "sounds_later",
    "reason": "Commercial breakthrough is strongly associated with 2003."
  },
  {
    "songId": "song_b91ddb96e9013c3c47b2",
    "signal": "timeless",
    "reason": "Continued cultural use obscures exact year."
  },
  {
    "songId": "song_f2bd4d15cb08d676bc97",
    "signal": "ahead",
    "reason": "Production remains unusually contemporary."
  },
  {
    "songId": "song_a2178ab2d1564f166469",
    "signal": "timeless",
    "reason": "Retro styling and longevity make exact year harder."
  },
  {
    "songId": "song_fc534cb3268c8bc35cb3",
    "signal": "revival",
    "reason": "Long chart life, especially in the UK/Australia, makes the 2003 origin surprising."
  },
  {
    "songId": "song_9457cfc37ead5b7278fb",
    "signal": "timeless",
    "reason": "Streaming-era longevity keeps it detached from its exact year."
  },
  {
    "songId": "song_ab127749b40c3ce9ad4f",
    "signal": "timeless",
    "reason": "Stadium-chant afterlife obscures its origin year."
  },
  {
    "songId": "song_7cbee0353b647cf2d29c",
    "signal": "sounds_later",
    "reason": "Often associated with the 2004 indie-rock wave."
  },
  {
    "songId": "song_7a6cba12773a844de497",
    "signal": "ahead",
    "reason": "Production still sounds modern and is often dated to 2004."
  },
  {
    "songId": "song_a63387ff4599f267970e",
    "signal": "revival",
    "reason": "Major 2020s revival gives it a much newer cultural footprint."
  },
  {
    "songId": "song_7220767bfa537f0ef992",
    "signal": "sounds_later",
    "reason": "Amy Winehouse's 2007 global breakthrough can pull guesses later."
  },
  {
    "songId": "song_d251c59a517dcaaa4865",
    "signal": "timeless",
    "reason": "Internet nostalgia gives the track an era-blurred identity."
  },
  {
    "songId": "song_158d73d8bb3d7d6e77f7",
    "signal": "sounds_later",
    "reason": "Its commercial peak came in 2011."
  },
  {
    "songId": "song_1201a3de0fc5cbf4cab4",
    "signal": "sounds_later",
    "reason": "International breakout is commonly remembered as 2012."
  },
  {
    "songId": "song_c16dd374dda90f08948f",
    "signal": "timeless",
    "reason": "Lana Del Rey's long later career can pull guesses later."
  },
  {
    "songId": "song_1e53acc392f1e77265c4",
    "signal": "timeless",
    "reason": "Internet landmark is often remembered by era more than exact year."
  },
  {
    "songId": "song_7cef6a9a2cf69bacd46c",
    "signal": "sounds_later",
    "reason": "Global chart success extended strongly into 2013-14."
  },
  {
    "songId": "song_a6c681ac1dc43f135e0e",
    "signal": "sounds_later",
    "reason": "Peak chart association is commonly 2013."
  },
  {
    "songId": "song_ae060b16f2a933561349",
    "signal": "sounds_later",
    "reason": "Long streaming life can pull guesses later."
  },
  {
    "songId": "song_d4f0fb6219eb00068bc0",
    "signal": "timeless",
    "reason": "EDM-pop crossover remains culturally durable."
  },
  {
    "songId": "song_4a2ce612552a4e66814d",
    "signal": "later_breakthrough",
    "reason": "Originally released years before its 2019 chart breakthrough."
  },
  {
    "songId": "song_96ab42cd9ddaf795c96b",
    "signal": "retro_confusion",
    "reason": "Deliberate 1970s-style psychedelic soul can pull guesses decades earlier."
  },
  {
    "songId": "song_9ae6f0c273315cddb4be",
    "signal": "later_breakthrough",
    "reason": "Its biggest global chart run arrived in 2021-22."
  },
  {
    "songId": "song_8d760a9edb56e68beeb9",
    "signal": "sounds_later",
    "reason": "Its major chart breakthrough came in 2022."
  }
];

if(selected.length!==160)throw new Error(`Expected 160 selected additions, found ${selected.length}`);
const ids=new Set(selected.map(x=>x.songId));
if(ids.size!==selected.length)throw new Error('Duplicate songId in Unexpected Years selection');

const db=JSON.parse(fs.readFileSync(databasePath,'utf8'));
const current=db.memberships.filter(m=>m.mode==='unexpected');
const currentIds=new Set(current.map(m=>m.songId));

const resolved=selected.map(choice=>{
  const song=db.songs[choice.songId];
  if(!song)throw new Error(`Selected song missing from canonical database: ${choice.songId}`);
  const answerYear=Number(song.release?.answerYear);
  if(!Number.isInteger(answerYear))throw new Error(`Selected song has no integer answer year: ${song.title}`);
  if(song.release?.state!=='externally_observed')throw new Error(`Selected song release is not externally observed: ${song.title} (${song.release?.state})`);
  if(Number(song.release?.year)!==answerYear)throw new Error(`Selected song accepted release year conflicts with answer year: ${song.title}`);
  const acceptedClaim=(song.release?.claims||[]).find(c=>c.state==='externally_observed'&&Number(c.year)===answerYear)||null;
  if(!acceptedClaim)throw new Error(`Selected song lacks externally observed claim for answer year: ${song.title}`);
  return {...choice,title:song.title,artist:song.artist,answerYear,releaseState:song.release.state,
    releaseEvidence:{sourceUrl:acceptedClaim.sourceUrl??null,evidence:acceptedClaim.evidence??null}};
});

const missing=resolved.filter(x=>!currentIds.has(x.songId));
if(current.length===targetTotal&&missing.length===0){
  console.log('Unexpected Years already at target 200; no database change required.');
}else{
  if(current.length!==40)throw new Error(`Expected 40 pre-expansion Unexpected memberships, found ${current.length}`);
  if(missing.length!==160)throw new Error(`Expected all 160 selected additions to be new, found ${missing.length}`);
  for(const row of resolved){
    db.memberships.push({songId:row.songId,mode:'unexpected',year:row.answerYear,metadata:{},fieldOrder:['title','artist','year']});
  }
  const compiled=compileDatabase(db);
  const post=db.memberships.filter(m=>m.mode==='unexpected');
  if(post.length!==targetTotal)throw new Error(`Post-expansion Unexpected count is ${post.length}, expected ${targetTotal}`);
  fs.writeFileSync(databasePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(cataloguePath,JSON.stringify(compiled)+'\n');
  console.log(`Added ${missing.length} existing canonical masters to Unexpected Years; total=${post.length}.`);
}

const finalDb=JSON.parse(fs.readFileSync(databasePath,'utf8'));
const finalUnexpected=finalDb.memberships.filter(m=>m.mode==='unexpected');
const audit={
  schemaVersion:1,
  targetTotal,
  previousTotal:40,
  additions:160,
  selectionPolicy:[
    'Prefer songs whose release year is easy to misplace because the recording sounds ahead of or behind its era.',
    'Prefer later-breakthrough, revival, cover-confusion, title-misdirection, or retro-styled cases with a defensible year trap.',
    'Reuse canonical masters already in the library and require accepted externally observed release evidence.',
    'Do not mutate canonical song identity or release truth merely to fit the mode.'
  ],
  sourceIntegrity:{
    canonicalMasters:Object.keys(finalDb.songs).length,
    totalMemberships:finalDb.memberships.length,
    unexpectedMemberships:finalUnexpected.length,
    newMasterSongs:0
  },
  selected:resolved.sort((a,b)=>a.answerYear-b.answerYear||a.title.localeCompare(b.title))
};
fs.writeFileSync(auditPath,JSON.stringify(audit,null,2)+'\n');

if(finalUnexpected.length!==targetTotal)throw new Error(`Unexpected Years target not achieved: ${finalUnexpected.length}`);
compileDatabase(finalDb);
