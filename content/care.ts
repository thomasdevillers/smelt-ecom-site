export const CARE = {
  eyebrow: "Look after it",
  title: "Care for your Smelt, and it'll outlast the sauna.",
  intro:
    "Wool felt is tougher than it looks, but it does have opinions. Treat it well and one hat will see you through years of heat. Here's everything you need to know.",
  steps: [
    {
      title: "Before the sauna",
      body: "Give it a light dampen with cool water if you like, a slightly damp hat insulates a touch better and feels cooler on the scalp. A dry hat works perfectly well too. Pop it on before you go in, not after you're already cooking.",
    },
    {
      title: "In the room",
      body: "Wear it low and relaxed. The felt sits between your scalp and the heat, so let it do its job. No need to fuss with it. If it feels warm to the touch, that's the wool absorbing heat instead of your head.",
    },
    {
      title: "After your session",
      body: "Give it a gentle squeeze to release excess moisture, never wring or twist it. Reshape it with your hands while it's still damp so it keeps its form, then leave it somewhere airy to dry fully.",
    },
    {
      title: "Drying",
      body: "Air-dry only, flat or on a rounded surface that holds its shape. Keep it away from direct heat: no radiators, no hairdryers, no tumble dryer. Felt shrinks and hardens when it's dried too fast.",
    },
    {
      title: "Cleaning",
      body: "It rarely needs more than airing out. When it does, spot-clean by hand with cool water and a tiny bit of wool-safe detergent. Dab, don't scrub. Rinse gently, reshape, and air-dry.",
    },
    {
      title: "Storing it",
      body: "Keep it somewhere dry and breathable between sessions. Don't seal a damp hat in a bag, wool needs air. Stuff it lightly with a towel if you want it to hold its shape on the shelf.",
    },
  ],
  donts: [
    "Never machine wash it. Felt holds a grudge and will shrink into a coaster.",
    "Never tumble dry or use direct heat to speed things up.",
    "Never wring or twist it, press the water out instead.",
    "Never store it damp in a sealed bag.",
  ],
  note:
    "The embroidery is stitched, not printed, so it won't crack or peel. Follow the above and it'll stay sharp for the life of the hat.",
  signoff: "Warm regards, and a well-kept hat.",

  /**
   * Cleaning Q&A. These are the questions people actually email us, answered at
   * enough length to be the last page they need to read. Rendered as an
   * accordion plus FAQPage structured data on /care.
   */
  cleaning: {
    eyebrow: "Cleaning questions",
    title: "How to clean a wool felt sauna hat",
    intro:
      "Short version: most of the time you don't. A wool sauna hat that gets properly aired after every session needs an actual wash maybe once or twice a year. Here's what to do when it does, and how to fix the things that go wrong.",
    items: [
      {
        q: "How often should I wash my sauna hat?",
        a: "Far less often than you'd think. Once or twice a year is normal, and some people never get there. Wool resists the bacteria that cause odour and releases absorbed moisture as it dries, so a hat that is aired out properly after every session stays fresh on its own. Washing it more than it needs is how felt ends up stiff and misshapen. Air it after every use; wash it only when airing has stopped being enough.",
      },
      {
        q: "Can I machine wash a wool sauna hat?",
        a: "No, and this is the one rule we'd tattoo on the inside. Felting happens when wool fibres are agitated in hot water with detergent, which is a precise description of a washing cycle. Your hat will come out smaller, harder and permanently the wrong shape, and there is no way to reverse it. Not on a wool cycle, not in a mesh bag, not on cold. Hand spot-cleaning is the only safe method.",
      },
      {
        q: "How do I spot-clean it properly?",
        a: "Work cool, work gently, and work on a dry hat. Mix a few drops of wool-safe detergent into cool water, dip a clean cloth, squeeze most of the water out, and dab at the mark. Don't scrub, because scrubbing is agitation and agitation is felting. Rinse the cloth in plain cool water and dab over the same area to lift the detergent out. Press the moisture out with a dry towel, reshape with your hands, and leave it somewhere airy. Do the whole thing in one sitting rather than letting the damp patch sit for hours.",
      },
      {
        q: "What detergent is safe to use?",
        a: "A wool-specific or pH-neutral detergent, and very little of it. Avoid anything containing enzymes, bleach, oxygen brighteners or fabric softener. Enzymes are designed to digest protein, and wool is a protein fibre, so enzyme detergents will weaken it over time. Softener coats the fibres and kills the breathability and water absorption that make the hat work in the first place.",
      },
      {
        q: "My hat has started to smell. What now?",
        a: "Nine times out of ten the hat isn't dirty, it just hasn't been drying fully between sessions, and that's especially common if you sauna several times a week. Start by giving it 48 hours somewhere genuinely airy, not a gym bag and not a bathroom, and see where you are. If it still smells, spot-clean it as above. For a stubborn case, a very dilute white vinegar solution (one part vinegar to four parts cool water) dabbed on and then dabbed off with plain water neutralises odour without stripping the wool. Never use bleach.",
      },
      {
        q: "How do I get sweat stains or white marks out?",
        a: "Those pale rings are salt left behind as sweat evaporates, not a stain in the fibre. Cool water lifts them, which is why it's worth doing before they build up over a season: dab the ring with a cloth and plain cool water, feather outwards past the edge of the mark rather than stopping at it, then dry flat. Working outwards is what stops you trading a ring for a bigger, sharper-edged ring. Hot water sets salt and can felt the area, so keep it cool.",
      },
      {
        q: "There's mildew on it. Is it ruined?",
        a: "Probably not, if you catch it early. Mildew means it was stored damp with no airflow. Get it completely dry first, outdoors in shade if you can. Mildew needs moisture, so drying it out stops the spread. Then brush the surface gently with a soft dry brush to remove the spores, and spot-clean the area with the dilute vinegar solution above. If the smell survives a full dry and a clean, the felt has been colonised through its thickness and it's time for a new hat. Prevention is the whole game here: never seal a damp hat in a bag.",
      },
      {
        q: "How long should it take to dry, and can I speed it up?",
        a: "Somewhere between a few hours and overnight, depending on how humid your room is and how wet the hat got. You can speed it up safely by pressing more water out with a dry towel first, and by giving it moving air: an open window or a fan on a low setting across the room is fine. What you can't do is add heat. Radiators, hairdryers, tumble dryers, a hot car and the sauna's own stove will all harden and shrink the felt. Heat plus moisture is literally how felt is made.",
      },
      {
        q: "My hat shrank. Can I fix it?",
        a: "Partially, sometimes. Felting isn't fully reversible, but you can often recover some size: soak the hat in cool water with a generous splash of hair conditioner for about half an hour, which relaxes the fibres, then gently stretch it back towards shape with your hands, stuff it with a dry towel to hold the form, and air-dry it slowly. Expect to get some of the size back, not all of it. Worth trying before you give up on the hat.",
      },
      {
        q: "Can I use a sauna hat straight after cleaning it?",
        a: "Wait until it's bone dry. A hat that's still damp in the crown will reach steam temperature from the inside, which is uncomfortable and does the felt no favours. It also means any detergent you didn't fully rinse out gets heated against your scalp. Dry first, then use.",
      },
      {
        q: "Do I need to clean the embroidery differently?",
        a: "No. Everything on our hats is stitched thread, not printed film, so there's nothing on the surface to crack, lift or dissolve. Clean over it exactly as you would the rest of the felt, just dabbing rather than scrubbing, so you're not working the stitches loose.",
      },
      {
        q: "Should I own two hats?",
        a: "If you sauna most days, yes, and it's a drying issue rather than a hygiene one. One hat used daily never gets a full dry cycle, and a hat that's permanently slightly damp is the one that starts to smell. Two on rotation fixes that with no extra effort from you.",
      },
    ],
  },
};
