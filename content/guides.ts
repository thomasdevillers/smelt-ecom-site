/**
 * Long-form SEO guides served at /articles and /articles/[slug].
 *
 * Everything here is written from our own bench time rather than rewritten from
 * other shops' copy, which is what Google's helpful-content guidance asks for.
 * Paragraph strings support one piece of inline markup, `[label](/href)`, which
 * app/articles/[slug]/page.tsx renders as a Next <Link>.
 */

export interface GuideFigure {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export interface GuideBlock {
  /** Rendered as an <h2> and used as the in-page contents label. */
  heading: string;
  body: string[];
  list?: string[];
  figure?: GuideFigure;
}

export interface Guide {
  slug: string;
  /** Short label for cards and breadcrumbs. */
  nav: string;
  /** Absolute <title> for the page. */
  title: string;
  h1: string;
  description: string;
  /** The search question this guide exists to answer. */
  question: string;
  /** Direct answer, shown as the lede and reused as the first FAQ answer. */
  answer: string;
  published: string;
  updated: string;
  readMinutes: number;
  hero: GuideFigure;
  takeaways: string[];
  blocks: GuideBlock[];
  faq: { q: string; a: string }[];
}

const GREEN_FRONT: GuideFigure = {
  src: "/images/hat-green-front.jpeg",
  alt: 'Smelt Forest Green wool felt sauna hat, front, with "Smelt" embroidered',
  caption: "Forest Green, front. The wordmark is stitched, not printed.",
  width: 1200,
  height: 1200,
};

const CREAM_FRONT: GuideFigure = {
  src: "/images/hat-cream-front.jpeg",
  alt: 'Smelt Natural Cream wool felt sauna hat, front, with "Smelt" embroidered',
  caption: "Natural Cream. Pale felt shows water marks far less than you'd expect.",
  width: 1200,
  height: 1200,
};

const GREEN_BACK: GuideFigure = {
  src: "/images/hat-green-back.jpeg",
  alt: 'Smelt Forest Green sauna hat, back, with "Warm regards" embroidered',
  caption: '"Warm regards" on the back. Embroidery survives heat that cracks a print.',
  width: 1200,
  height: 1200,
};

const CREAM_BACK: GuideFigure = {
  src: "/images/hat-cream-back.jpeg",
  alt: "Smelt Natural Cream wool felt sauna hat photographed from the back",
  caption: "Felt is matted rather than knitted, so there are no stitch holes for heat to get through.",
  width: 1200,
  height: 1200,
};

const ON_HEAD: GuideFigure = {
  src: "/images/MarcTomFront.jpg",
  alt: "Tom and Marc wearing Smelt wool felt sauna hats",
  caption: "Us, mid-session. Both hats sit low and loose. That's the fit you want.",
  width: 800,
  height: 1000,
};

const SIDE_FIT: GuideFigure = {
  src: "/images/TomSide.jpeg",
  alt: "Side profile of a Smelt wool felt sauna hat showing how it covers the ear",
  caption: "Side profile. Note where the felt lands: over the ear, not above it.",
  width: 800,
  height: 1000,
};

const SIDE_FIT_2: GuideFigure = {
  src: "/images/MarcSide.jpg",
  alt: "Side view of a Smelt sauna hat worn low over the ears",
  caption: "Same hat, different head. One relaxed shape settles onto both.",
  width: 800,
  height: 1000,
};

const IN_SAUNA: GuideFigure = {
  src: "/images/cream-hat-sauna-closeup.webp",
  alt: "Woman wearing a Natural Cream Smelt sauna hat in a wooden sauna",
  caption:
    "The same idea the banya has used for generations: put wool between the hottest air in the room and your scalp.",
  width: 1086,
  height: 1448,
};

const IN_SAUNA_SEATED: GuideFigure = {
  src: "/images/cream-hat-sauna-portrait.webp",
  alt: "Woman wearing a Natural Cream Smelt sauna hat while seated in a wooden sauna",
  caption: "Worn low, covering the ears. That is how it is worn in a bathhouse, and why.",
  width: 1086,
  height: 1448,
};

export const GUIDES: Guide[] = [
  {
    slug: "what-does-a-sauna-hat-do",
    nav: "What a sauna hat does",
    title: "What Does a Sauna Hat Do? | Smelt",
    h1: "What does a sauna hat do?",
    description:
      "A sauna hat insulates your scalp and ears so your head heats up slower than the rest of you, which is why you can sit longer. What the felt does, what it doesn't, and what we noticed first-hand at 90°C.",
    question: "What does a sauna hat do?",
    answer:
      "A sauna hat is a thick wool felt cap that insulates the top of your head and your ears from the hottest air in the room. Your head stops being the first thing to tap out, so you stay comfortable for longer sessions, and your hair comes out in much better shape.",
    published: "2026-10-04",
    updated: "2026-10-08",
    readMinutes: 6,
    hero: ON_HEAD,
    takeaways: [
      "The hottest air in a sauna sits at head height, and your scalp has very little to protect it.",
      "Dense wool felt traps air, so heat reaches your scalp gradually instead of all at once.",
      "It does not stop you sweating or cooling. Your torso does that work, and it stays uncovered.",
      "It is a comfort tool, not a safety device. You can still overheat wearing one.",
    ],
    blocks: [
      {
        heading: "The short answer",
        body: [
          "A sauna hat slows the rate at which heat reaches your scalp and ears. That is the whole job. It is a thick piece of wool felt that sits between the hottest part of the room and the most heat-sensitive part of you, and the result is that your head stops being the reason you leave the bench.",
          "Everything else people claim for sauna hats (longer sessions, fewer post-sauna headaches, hair that doesn't feel fried) is downstream of that one mechanism.",
        ],
      },
      {
        heading: "Why your head cooks first",
        body: [
          "Hot air rises, and a sauna is a small room with a hot stove in it. By the time you are sitting on the upper bench, the air around your head can be 15 to 20°C hotter than the air at your feet. If the thermometer on the wall says 90°C, that is roughly what your scalp is in, not what your shins are in.",
          "Your head is also badly equipped for it. The skin on your scalp is thin, it sits directly over bone with very little fat underneath, and your ears are thin flaps of cartilage with skin on both sides and not much blood flow to carry heat away. Ears are usually the first thing to actually hurt. Add hair that is either absent or wet and flattened, and there is very little insulation there at all.",
          "So the sequence in an unhatted session is predictable: ears sting, the scalp starts to feel tight and prickly, and you get up, while your legs and torso are still perfectly happy. You are not leaving because you have had enough heat. You are leaving because about 5% of your surface area has.",
        ],
        figure: SIDE_FIT,
      },
      {
        heading: "What the felt actually does",
        body: [
          "Wool felt is not a heat shield so much as a heat delay. Felting mats the fibres into a dense mass that is still mostly air by volume, and trapped air is a poor conductor. Heat has to work its way through that maze of fibre and pockets before it reaches your skin, which takes time, and a sauna session is short enough that the delay is the point.",
          "There is a second thing happening. Wool absorbs a serious amount of water vapour into the fibre itself before it feels wet to the touch, and evaporation off the outer surface of the felt pulls energy away from the hat rather than out of you. That is why a sauna hat can feel hot on the outside and cool against your scalp at the same time.",
          "The easiest way to feel it is to press the crown of your hat halfway through a session. The outside is genuinely hot. The inside is not. That gap is the hat doing its job.",
        ],
        figure: CREAM_BACK,
      },
      {
        heading: "What we noticed first-hand",
        body: [
          "We did not come at this academically. Two of us, a sauna in Cape Town, and a repeated problem: we would last about four minutes on the top bench before one of us bailed. We had read about the felt hats that are standard kit in the steam bathhouses of Eastern Europe, couldn't buy a decent one locally, and eventually made our own, which is the only reason [the Smelt hat](/product) exists at all.",
          "The first hatted session was the convincing one. Same room, same temperature, and the limiting factor moved from the scalp to the chest, which is where it is supposed to be. Tom now sits comfortably at 95°C, which he could not do before. Marc still prefers a civil 85°C and a slow exit, which tells you the hat changes your ceiling rather than your personality.",
          "Two smaller things we did not expect. First, the ear relief is more noticeable than the scalp relief: you stop doing that involuntary hunch to get your ears out of the heat. Second, hair. Repeated dry heat on wet hair is rough on it, and keeping it under felt instead made an obvious difference within a few weeks.",
        ],
      },
      {
        heading: "Doesn't covering your head make you hotter?",
        body: [
          "This is the first question everyone asks, and the answer is no, because of where your cooling actually comes from.",
          "You shed heat in a sauna mainly by sweating from your torso, back, arms and legs, all of which stay bare. The hat covers a small patch at the top. It is not reducing your cooling capacity in any meaningful way; it is reducing the heat load on the one area that has no defence of its own.",
          "What people are remembering is a woolly beanie in winter, where the goal is to keep your own body heat in. In a sauna the gradient runs the other way: the room is hotter than you are, so the same insulation that holds heat in outdoors holds heat out in here. Same material, opposite direction.",
          "If anything, most people report their head feels cooler with a hat on than without, which is counterintuitive right up until you try it.",
        ],
        figure: GREEN_FRONT,
      },
      {
        heading: "What a sauna hat does not do",
        body: [
          "We would rather undersell this than have you trust a hat to do something it can't. A sauna hat is comfort equipment, not safety equipment.",
          "It does not make a hot room safe, and it does not give you permission to sit through warning signs. Dizziness, nausea, a racing heart and a headache all mean get out, hat or no hat. It does not replace water, it does not shorten your cool-down, and it will not protect you if you lean against hot timber or touch the stove.",
        ],
        list: [
          "It does not stop you overheating. Your core still warms at the same rate.",
          "It does not reduce how much you need to hydrate.",
          "It will not rescue a session you have pushed too far; nothing worn on your head will.",
          "It does nothing for your face, so if your cheeks are the problem, that is a towel-and-lower-bench issue.",
        ],
      },
      {
        heading: "Who gets the most out of one",
        body: [
          "The people who notice the biggest change are the ones whose heads are the bottleneck: anyone who sits on the top bench, anyone doing proper löyly with water on the stones, and anyone with thin, short or no hair. Also anyone whose ears have stung for the last three minutes of every session and who assumed that was just the deal.",
          "If you go in at 70°C for ten minutes and never feel troubled, a hat is a nice-to-have rather than a fix. The hotter your room and the longer your session, the more it earns its place.",
          "If you want the practical version of all this, covering what to look for in material, how it should sit, and how not to ruin it, that's [how to choose a sauna hat](/articles/how-to-choose-a-sauna-hat).",
        ],
      },
    ],
    faq: [
      {
        q: "Does a sauna hat actually work, or is it just tradition?",
        a: "Both. It is traditional across the steam-bathing cultures of Eastern and Northern Europe, above all the Russian banya, because it works. Dense wool felt is a poor conductor of heat, so it delays how fast the hottest air in the room reaches your scalp and ears. The effect is obvious the first time you wear one on a top bench.",
      },
      {
        q: "Will a sauna hat make me sweat less?",
        a: "No. You sweat mainly from your torso, back, arms and legs, and all of those stay uncovered. The hat shields a small, heat-sensitive area and leaves your cooling surface alone.",
      },
      {
        q: "Should the hat be wet or dry?",
        a: "Either works. We often damp ours with cool water before going in, since it feels cooler on the scalp and insulates slightly better, but a dry hat is perfectly effective. Just don't soak it.",
      },
      {
        q: "Can I wear a sauna hat in a steam room?",
        a: "You can, but it matters less. A steam room runs far cooler than a dry sauna, so there is much less of a gradient between your head and the air. The felt will also absorb a lot of moisture and take longer to dry out afterwards.",
      },
      {
        q: "Is a sauna hat safe for children?",
        a: "The hat itself is just wool felt, but sauna use by children is a question for a parent and a doctor, not a hat company. Shorter sessions, lower benches and lower temperatures matter far more than headwear.",
      },
    ],
  },

  {
    slug: "why-is-wool-used-for-sauna-hats",
    nav: "Why wool",
    title: "Why Is Wool Used for Sauna Hats? | Smelt",
    h1: "Why is wool used for sauna hats?",
    description:
      "Wool insulates when damp, absorbs sweat without feeling wet, resists odour and will not melt near a stove. Why cotton and synthetics fail in a sauna, and why felt beats knit.",
    question: "Why is wool used for sauna hats?",
    answer:
      "Wool is used because it is the only common fibre that insulates well, absorbs a lot of sweat without feeling wet, resists odour, and will not melt or scorch near a hot stove. Cotton soaks through and conducts heat straight to your scalp; synthetics soften and hold smell. Felted wool also has no stitch holes, so there are no gaps in the insulation.",
    published: "2026-10-04",
    updated: "2026-10-08",
    readMinutes: 7,
    hero: CREAM_FRONT,
    takeaways: [
      "Wool's crimped fibres trap air, and trapped air is what actually does the insulating.",
      "Wool holds roughly a third of its weight in moisture before it feels wet. Cotton feels soaked almost immediately.",
      "Wool chars rather than melts, which matters in a room with an exposed stove.",
      "Felt, not knit: matting the fibres removes the stitch holes that let heat straight through.",
    ],
    blocks: [
      {
        heading: "The short answer",
        body: [
          "Because a sauna is the worst possible environment for almost every other fibre. It is hot, it is wet, there is an open stove in the corner, and whatever you wear is going to be soaked in sweat and then expected to be fine again by Thursday. Wool is the one material that handles all four of those at once.",
          "Tradition gets the credit, but the tradition exists because the material genuinely holds up. The bathhouse cultures of Eastern and Northern Europe settled on wool felt centuries before anyone had a phrase for thermal conductivity.",
        ],
      },
      {
        heading: "Property one: it insulates because of the air, not the fibre",
        body: [
          "Wool fibres are naturally crimped, kinking rather than lying flat, so a mass of wool is mostly trapped air by volume. Still air is a genuinely poor conductor of heat, and that trapped air is what slows heat moving from the room into your scalp. The wool is really just the scaffolding that holds the air in place.",
          "This is why thickness and density matter more than the brand on the label. Thin felt has fewer air pockets and gives you less delay. Over-dense felt loses the pockets to compression, gets heavy, and takes an age to dry. There is a sweet spot, and finding it was most of our sourcing work.",
        ],
      },
      {
        heading: "Property two: it handles sweat without going clammy",
        body: [
          "Wool can absorb around 30% of its own weight in moisture into the fibre itself before the surface feels wet to the touch. In a sauna that is the difference between a hat that stays comfortable and a hat that becomes a hot wet rag on your head twelve minutes in.",
          "There is a bonus: when wool takes on moisture it releases a small amount of heat, and when it gives that moisture back up through evaporation it absorbs energy from its surroundings. The evaporation happens at the outer surface of the felt, so that energy comes out of the hat rather than out of your scalp.",
          "Wool also keeps insulating while damp, because the air pockets don't collapse. That property alone disqualifies most of the alternatives.",
        ],
        figure: GREEN_BACK,
      },
      {
        heading: "Property three: it does not melt",
        body: [
          "This is the one people never think about until they picture the room properly. A sauna has an exposed stove with rocks on it at several hundred degrees. Things get knocked, water gets thrown, people reach across.",
          "Wool is unusually flame-resistant for a textile: it has a high ignition temperature, it tends to self-extinguish rather than sustain a flame, and critically it chars instead of melting. Synthetic fibres do the opposite: polyester and nylon soften and then melt, and melted synthetic sticks to skin. Wool near heat gives you a scorch mark and a bad smell. That is a very different kind of bad day.",
        ],
      },
      {
        heading: "Property four: it does not start to smell",
        body: [
          "A sauna hat lives its whole life wet with sweat. Wool is remarkably forgiving about this. Its surface structure and residual lanolin make it inhospitable to the bacteria that actually produce body odour, and it off-gasses as it dries rather than holding the smell in.",
          "In practice ours get aired out after every session and genuinely cleaned very rarely. A polyester equivalent would need washing constantly and would still carry that permanent gym-kit smell within a month. What cleaning actually looks like is on the [care page](/care).",
        ],
      },
      {
        heading: "Why not cotton",
        body: [
          "Cotton is the most common wrong answer, usually because someone has a cotton towel on their head and assumes a cotton cap would do the same job better.",
          "Cotton wets out instead of absorbing into the fibre. Once saturated, the air pockets fill with water, and water conducts heat roughly twenty-five times better than air does. Your insulator has just become a conductor sitting directly on your scalp. The experience is specific and unpleasant: fine for three minutes, then heavy, then like a hot compress.",
          "Cotton also takes a long time to dry, which is how towels and cotton caps left in a sauna bag end up mildewed.",
        ],
      },
      {
        heading: "Why not synthetics",
        body: [
          "Polyester fleece looks like a reasonable substitute on paper: cheap, insulating, fast-drying. In a sauna it fails on two counts. The melting point is in the wrong place for a room with a stove in it, and the odour problem is permanent in a way no amount of washing fixes.",
          "There is also a comfort issue that is harder to quantify. Synthetic fleece against a hot, sweating scalp feels slick and plasticky. Felt feels dry even when it isn't. That is not marketing; it is the moisture-absorption property doing something you can feel.",
        ],
        list: [
          "Melts rather than chars, which is the wrong failure mode near a stove.",
          "Holds odour-producing bacteria, so the smell becomes permanent.",
          "Feels wet and slick on the scalp as soon as it is damp.",
          "Often finished with coatings or printed graphics that degrade under repeated heat.",
        ],
      },
      {
        heading: "Why felt rather than knitted wool",
        body: [
          "Wool is necessary but not sufficient, because the construction matters as much as the fibre. A knitted wool beanie is wool, and it is still the wrong thing, because knitting is a structure made of holes. Heat and steam travel straight through the gaps between stitches, and the first spot to give up is wherever the knit has stretched thinnest over your crown.",
          "Felting mats the fibres together under heat, moisture and pressure into a single continuous sheet. No stitches, no holes, no seams running across the top of your head where you most need coverage. It also holds a shape: felt dries back into the form you reshaped it into, which is why a felt hat still looks like a hat after two years and a knitted one looks like a sock.",
        ],
        figure: SIDE_FIT_2,
      },
      {
        heading: "What we learned buying felt",
        body: [
          "We went through a frustrating number of samples. The useful lessons were all about density and honesty.",
          "Thin felt is the most common problem: it looks the part in photos and gives you almost no delay in the room. Blends are the second: anything with polyester in it to cut cost reintroduces every synthetic problem above, and 'wool blend' on a label can mean almost anything. We ended up specifying 100% wool with nothing else in it, which is why [our hat](/product) says exactly that and nothing vaguer.",
          "One more: decoration. Early on we looked at printed branding because it is cheaper and faster. Plastisol and vinyl prints crack and peel under repeated sauna heat, because they are plastic films sitting on wool, expanding and contracting at a different rate. Everything on our hats is embroidered thread, front and back, for exactly that reason.",
        ],
      },
    ],
    faq: [
      {
        q: "Is merino better than regular wool for a sauna hat?",
        a: "Not for this job. Merino's advantage is fineness and softness against skin, which matters for base layers. A sauna hat wants bulk, density and air pockets, and coarser wool felts into a thicker, more insulating sheet.",
      },
      {
        q: "Can I use a knitted wool beanie instead?",
        a: "It is better than nothing and much worse than felt. Knitting is a structure full of holes, so heat and steam pass between the stitches, and the knit thins out exactly where it stretches over your crown. Felt is a continuous sheet with no gaps.",
      },
      {
        q: "Does wool shrink in a sauna?",
        a: "No. Shrinkage needs agitation plus hot water plus detergent, which describes a washing machine, not a sauna. Heat and steam alone will not felt it further. Machine washing absolutely will, which is why we say never do it.",
      },
      {
        q: "Will a wool sauna hat smell after a while?",
        a: "Far less than you would expect. Wool resists the bacteria that cause body odour and off-gasses as it dries. Air it out properly after every session, don't seal it damp in a bag, and it stays fresh for a long time between actual cleans.",
      },
      {
        q: "Is wool itchy when it is hot and wet?",
        a: "Felt behaves differently from knitted wool here, because the fibre ends are matted into the sheet rather than standing up off the surface. Ours sit on the scalp without the prickle people associate with a cheap wool jumper.",
      },
    ],
  },

  {
    slug: "how-to-choose-a-sauna-hat",
    nav: "How to choose one",
    title: "How to Choose a Sauna Hat: Material, Fit & Care | Smelt",
    h1: "How to choose a sauna hat: material, fit, and care",
    description:
      "A practical buying guide to sauna hats: what material to insist on, how one should actually sit on your head, which construction details fail in heat, and what care commitment you're signing up for.",
    question: "How do I choose a sauna hat?",
    answer:
      "Insist on 100% wool felt thick enough that you cannot see light through it, choose a relaxed fit that covers your ears rather than gripping your skull, avoid printed graphics and any metal hardware, and be honest about care, because a sauna hat needs air-drying after every session and must never go in a machine.",
    published: "2026-10-04",
    updated: "2026-10-04",
    readMinutes: 8,
    hero: GREEN_FRONT,
    takeaways: [
      "Material first: 100% wool felt, thick enough to block light, no blends.",
      "Fit second: loose, low, covering the ears. Tight hats are hot hats.",
      "Check the decoration: printed graphics crack in sauna heat, embroidery doesn't.",
      "No metal: badges, eyelets and rivets all become burn hazards at 90°C.",
    ],
    blocks: [
      {
        heading: "The 60-second checklist",
        body: [
          "If you only read one section, read this one. Everything below is the reasoning behind it.",
        ],
        list: [
          "Material: 100% wool felt. Not a blend, not knit, not cotton, not fleece.",
          "Thickness: hold it up to a light. If the light comes through, it is too thin.",
          "Fit: it should sit low and loose over your ears, not grip your head.",
          "Decoration: embroidered thread only. Walk away from printed or vinyl graphics.",
          "Hardware: no metal badges, eyelets, rivets or snaps anywhere on it.",
          "Seams: as few as possible, and none across the crown.",
          "Care: air-dry only, hand spot-clean, never machine wash.",
        ],
      },
      {
        heading: "Material: what to insist on",
        body: [
          "The label should say 100% wool, and the construction should be felt. That combination does almost all of the work, and we've written up [why wool specifically](/articles/why-is-wool-used-for-sauna-hats) if you want the full reasoning.",
          "Be suspicious of 'wool blend'. It is a legal description that can cover a hat with a minority of wool in it, and whatever makes up the rest is usually polyester, which reintroduces the melting risk and the permanent-smell problem. If a listing won't tell you the exact composition, that is itself the answer.",
          "Thickness is the thing photos hide. A sauna hat works by putting a depth of trapped air between the room and your scalp, so there is no substitute for actual material. Our rough test: hold the felt up against a window or a lamp. Decent sauna felt is opaque. Thin craft felt glows.",
        ],
        list: [
          "Good: 100% wool felt, opaque, firm but still pliable, a few millimetres thick.",
          "Avoid: wool blends, knitted beanies, cotton caps, polyester fleece, anything with a coated or shiny surface.",
        ],
        figure: CREAM_FRONT,
      },
      {
        heading: "Fit: loose, low, over the ears",
        body: [
          "The instinct is to want a snug fit, and it is exactly backwards. A hat that grips your skull compresses the felt, and compressed felt has fewer air pockets, which amounts to a thinner hat. It also pulls the brim up off your ears, which are the part that hurts first.",
          "What you want is a relaxed shape that sits down over the tops of your ears and settles rather than clamps. Felt has natural give, so a well-made one-size shape genuinely does land on a wide range of heads. The photo below is the same hat on two very differently sized heads.",
          "Three things to check once you have one on. Does it cover your ears, or stop above them? Can you get a finger between the felt and your forehead without it feeling tight? Does it stay put when you tip your head forward, without you reaching up to adjust it? If all three are yes, that's the fit.",
        ],
        figure: ON_HEAD,
      },
      {
        heading: "Fit edge cases",
        body: [
          "A few situations come up often enough to be worth naming.",
          "Long hair: tie it up and put it under the hat rather than letting it hang out the back. Hair outside the hat takes the full heat, which is most of the reason people's hair suffers in a sauna. A bun under felt is the move.",
          "Very large or very small heads: a one-size felt shape has more range than a sized fabric cap, but it is not infinite. If you are at an extreme, the honest check is whether the brim still reaches your ears without strain.",
          "Shaved or thinning heads: you will feel the benefit more than most, and you can go slightly looser, because there is no hair bulk taking up room under the felt.",
        ],
      },
      {
        heading: "Construction details that actually matter",
        body: [
          "Most sauna hat failures are not material failures, they are detail failures.",
          "Decoration is the big one. Printed and vinyl graphics are plastic films sitting on wool, and they expand at a different rate to the felt under repeated heat cycles. They crack, then they lift, then they peel off in the room. Embroidery is thread through felt, and it moves with the material, which is why everything on [our hat](/product) is stitched, front and back, and nothing is printed.",
          "Metal is the one people miss. A metal badge, eyelet, rivet or snap sitting on a hat in a 90°C room becomes a small hot object pressed against your head. There is no good reason for any metal on a sauna hat.",
          "Seams and linings: fewer seams is better, and no seam should run across the crown, because a seam is a thin line in your insulation exactly where the heat is worst. Separate linings tend to be a bad sign too: they are often synthetic, and they trap moisture between layers so the hat takes much longer to dry.",
        ],
        figure: GREEN_BACK,
      },
      {
        heading: "Care: be honest about what you're signing up for",
        body: [
          "A wool felt hat is low-maintenance but not no-maintenance, and the two rules that matter are both about heat and water.",
          "Rule one: air-dry, always. Press the excess moisture out rather than wringing it, reshape it with your hands while it is still damp, and leave it somewhere airy. No radiators, no hairdryers, no tumble dryers. Fast drying is what hardens and shrinks felt.",
          "Rule two: never machine wash it. Agitation plus hot water plus detergent is the recipe for felting, and your hat will come out smaller, stiffer and permanently the wrong shape. When it genuinely needs cleaning, spot-clean by hand with cool water and a little wool-safe detergent, dabbing rather than scrubbing.",
          "Honestly, most sessions need nothing beyond airing it out. For the full routine, plus the fixes for smell, sweat marks and a hat that got stored damp, see the [care guide](/care).",
        ],
      },
      {
        heading: "What you're paying for",
        body: [
          "Sauna hats span a wide price range, and the cheap end is cheap for identifiable reasons: thinner felt, blended fibre, printed branding, and a shape that doesn't hold.",
          "The things that cost money are the things that make it work. Denser, thicker 100% wool felt. Embroidery rather than print. A shape cut and finished to sit over ears rather than perch on a crown. Those are also the things you can't assess from a product photo, which is why composition and thickness are worth asking about directly before you buy.",
          "The flip side is that a good one is close to a one-time purchase. Looked after, it outlasts years of sessions, which is a different calculation from a cheap hat you replace every season.",
        ],
      },
      {
        heading: "What we chose, and why",
        body: [
          "We built [the Smelt hat](/product) after failing to buy a decent one in South Africa, so every decision above is one we had to make ourselves rather than one we're describing from the outside.",
          "We make one hat, in two colourways: Forest Green and Natural Cream. It is 100% wool felt with no blend. It is a single relaxed one-size shape, because we'd rather one hat genuinely sit right on most heads than offer sizes that are a guess at checkout. Everything on it is embroidered: 'Smelt' on the front, 'Warm regards' on the back. There is no metal on it anywhere.",
          "We're not going to pretend that's the only correct set of answers. But if you run the checklist at the top over any hat you're considering, including ours, you'll avoid the ones that don't work.",
        ],
        figure: SIDE_FIT,
      },
    ],
    faq: [
      {
        q: "What size sauna hat should I get?",
        a: "Most quality sauna hats are a single relaxed size, and that is deliberate: felt has natural give and the fit is meant to be loose rather than fitted. The check that matters is whether the brim reaches down over your ears comfortably, not a head measurement in centimetres.",
      },
      {
        q: "Should a sauna hat be tight or loose?",
        a: "Loose. A tight hat compresses the felt, which removes the trapped air that does the insulating, and it pulls the brim up off your ears. You want it sitting low and settled, with room to get a finger between the felt and your forehead.",
      },
      {
        q: "How thick should sauna hat felt be?",
        a: "Thick enough to be opaque. Hold it up to a lamp or a window. Proper sauna felt blocks the light, and thin craft felt glows through. A few millimetres of dense wool felt is the target; anything you can see through won't give you much delay in the room.",
      },
      {
        q: "Are printed sauna hats a problem?",
        a: "Yes. Printed and vinyl graphics are plastic films on top of wool, and they expand and contract at a different rate to the felt under repeated heat cycles. They crack and peel. Embroidered thread moves with the material and survives.",
      },
      {
        q: "How long does a good sauna hat last?",
        a: "Years, if you air-dry it and keep it out of the washing machine. Felt is a durable structure and embroidery does not crack or peel. The two things that actually kill sauna hats are machine washing and being stored damp in a sealed bag.",
      },
      {
        q: "How many sauna hats do I need?",
        a: "One is fine for most people. The reason to own a second is drying time: if you sauna daily, a hat that hasn't fully air-dried is a hat that will start to smell. Two on rotation solves that without any other effort.",
      },
    ],
  },

  {
    slug: "where-do-sauna-hats-come-from",
    nav: "Where they come from",
    title: "Where Do Sauna Hats Come From? Banya, Not Finland | Smelt",
    h1: "Where do sauna hats actually come from?",
    description:
      "Almost every shop calls it a Finnish sauna hat. The felt bathing hat belongs to the sweat-bathing cultures of Eastern and Northern Europe, above all the Russian banya and the Baltic bathhouse. Here's why the Finnish label stuck anyway.",
    question: "Where do sauna hats come from?",
    answer:
      "The felt bathing hat comes from the sweat-bathing cultures of Eastern and Northern Europe, and it is most strongly and continuously associated with the Russian banya and the Baltic steam-bathing traditions. It is widely sold as a Finnish invention, which it is not. Finland gets the credit largely because English borrowed the word sauna from Finnish, so Finland became the default label for everything sauna-adjacent.",
    published: "2026-10-08",
    updated: "2026-10-08",
    readMinutes: 8,
    hero: IN_SAUNA,
    takeaways: [
      "Hot steam bathing is a regional tradition across Northern and Eastern Europe, not one country's invention.",
      "The felt hat is most at home in the Russian banya and the Baltic bathhouse, where it is standard kit rather than an accessory.",
      "Finland gets the credit mostly because English took the word sauna from Finnish.",
      "Nobody can give you a trustworthy date for the first felt bathing hat. Anyone who does is guessing.",
    ],
    blocks: [
      {
        heading: "The short answer",
        body: [
          "Search for a sauna hat and you will be told, over and over, that you are buying a Finnish tradition. We said a version of it ourselves on this site until recently.",
          "It is not really true. Hot steam bathing is a shared tradition across a broad belt of Northern and Eastern Europe, and the felt hat specifically is most strongly and continuously associated with the Russian banya and the steam-bathing cultures of the Baltic. Finland has a deep and genuine sauna tradition of its own, and nobody is disputing that. The narrower claim, that the hat is a Finnish invention, is the part that does not hold up.",
        ],
      },
      {
        heading: "Sweat bathing was regional, not national",
        body: [
          "The framing is the first problem. Asking which country invented sauna bathing is a bit like asking which country invented bread. Across a wide region with cold winters, abundant timber and a wool-working tradition, people independently and continuously arrived at the same idea: a small sealed room, a pile of stones heated by fire, water thrown on the stones, and a hard cleansing sweat.",
          "That tradition has a different name almost everywhere it exists. Sauna in Finland. Saun in Estonia. Pirts in Latvia, pirtis in Lithuania. Banya across Russia. Variations run through Ukraine, Belarus and well into Scandinavia. These are not copies of one original; they are regional expressions of a shared practice, with shared equipment, because the climate and the available materials were shared too.",
          "Wool was part of that shared toolkit everywhere. So the interesting question is not who invented bathing, but where the felt hat became normal equipment rather than an afterthought.",
        ],
      },
      {
        heading: "Why the hat is most at home in the banya",
        body: [
          "The strongest evidence here is not a document, it is the practice itself, and it is still observable today.",
          "Walk into a traditional banya and the felt hat is ordinary. It is sold at the door next to the birch whisks, it is in every changing room, and bathers put one on without discussion in the same way they pick up a towel. It is equipment, not a novelty. That cultural status is the thing that is genuinely distinctive, and it is far weaker in Finnish sauna culture, where plenty of people have never worn one.",
          "There is also a reason it would be. Banya practice leans hard on heavy wet steam, and the venik, a bundle of birch or oak branches, is used to beat and brush the skin while the steam is at its peak. The bather is often sitting up high, in thick steam, being worked over with branches, next to a stove radiating serious heat. Under those conditions an unprotected scalp and a pair of unprotected ears stop being a minor discomfort fairly quickly. The hat is not decoration in that room; it is what lets the session happen.",
        ],
        figure: IN_SAUNA_SEATED,
      },
      {
        heading: "The Baltic thread",
        body: [
          "The Baltic bathhouse traditions deserve more credit than they get, and they are routinely folded into the Finnish story by people who do not look closely.",
          "Latvian pirts culture in particular has a living, structured ritual practice, including the role of a bath master who directs the whole session, the heat, the steam, the whisking and the cooling. Estonian and Lithuanian traditions run along similar lines. These are continuous folk practices, not revivals, and wool felt headwear sits inside them as normal equipment rather than as an import.",
          "It is worth being honest about the limits of what anyone can tell you here. Folk textile history is poorly documented almost by definition, because working clothes get worn out and thrown away rather than archived. What we can say with confidence is that the hat is embedded in living practice across this region. What nobody can honestly tell you is which village made the first one.",
        ],
      },
      {
        heading: "Felt is far older than any of these countries",
        body: [
          "There is a layer underneath all of this that makes the question of national origin look even stranger.",
          "Felting is one of the oldest textile techniques there is, and it predates weaving. It needs no loom and no spinning: just wool, moisture, heat and agitation, which is why it was available to anyone keeping sheep. The oldest surviving felt objects come out of frozen burial mounds in the Altai region of Central Asia, preserved in ice for well over two thousand years, and felt headwear has a long association with the wool-working cultures of the steppe.",
          "We are not claiming a neat line from a Scythian burial to a bathhouse shelf, because there isn't one and anyone who draws it is decorating. The honest version is simpler: felt was an ancient, widely distributed technology that arrived in these regions long before the bathhouse hat existed. The bathhouse did not invent felt. It found an extremely good use for it.",
        ],
        figure: GREEN_BACK,
      },
      {
        heading: "So why does everyone say Finland?",
        body: [
          "This is the part we find genuinely interesting, because the misattribution is not random. There are a few threads, and they reinforce each other.",
          "The language is the big one. Sauna is the only word from this entire tradition that English borrowed wholesale, and it came from Finnish. Banya, pirts and saun never made the crossing. When one language hands you the only word you have for a thing, that language gets the credit for the thing, and every product built around it inherits the association. We call it a sauna hat in English for the same reason we call it a sauna.",
          "Then there is promotion. Finland spent the twentieth century successfully presenting sauna to the world as part of its national identity, and that effort continues. Finnish sauna culture was added to the UNESCO list of intangible cultural heritage in 2020, which is a real and deserved recognition of Finnish sauna culture. It is not a statement about who invented felt hats, though it gets cited as though it were.",
          "Geography and politics did the rest. For most of the decades in which sauna was being marketed to Western consumers, the banya and Baltic traditions sat behind the Iron Curtain and were not exporting anything to anybody. Russian and Baltic bathing culture never got a global brand during the window when the category was being defined in English.",
          "After that it is just copying. Western sauna shops write their product descriptions by reading other Western sauna shops' product descriptions, so traditional Finnish sauna hat propagated as a phrase for decades without anyone stopping to check it. We know, because we did it too.",
        ],
      },
      {
        heading: "What we got wrong ourselves",
        body: [
          "We should own this, since it is the reason the article exists.",
          "When we first went looking for a felt hat, we went looking for the Finnish one, because that is what the English-language internet told us to look for. Our own founder story still says we went hunting for the hats the Finns swear by, which is an accurate account of what we believed at the time and an inaccurate account of where the hat comes from.",
          "The further into it we got, mostly through reading about banya practice and talking to people who grew up with it, the clearer it became that we had absorbed a marketing phrase and repeated it as history. We have corrected the wording in our other guides. We would rather be publicly wrong once than keep a tidy claim we no longer believe.",
        ],
      },
      {
        heading: "Does any of this change how you use one?",
        body: [
          "A bit, actually, which is the main reason this is worth more than a trivia answer. If the hat's real home is the banya, then banya habits are the ones worth copying.",
          "Wet the hat. Dampening it with cool water before you go in is standard practice in a steam bathhouse, and it both feels better and insulates slightly better. Wear it low, properly over the ears, rather than perched on the crown, because ears are the part that genuinely suffers. Treat it as kit you always bring rather than something you remember occasionally. And follow the bathhouse rhythm: hotter, shorter rounds with real cool-downs in between beat one long grim endurance sit.",
          "None of that is exotic. It is just what people do in rooms where the hat has been normal for generations. If you want the mechanism behind it, that's [what a sauna hat does](/articles/what-does-a-sauna-hat-do), and the practical buying version is [how to choose a sauna hat](/articles/how-to-choose-a-sauna-hat).",
        ],
        figure: ON_HEAD,
      },
      {
        heading: "What we can and cannot say with confidence",
        body: [
          "Since this is a history question and the internet is full of confident nonsense about it, here is our own split between the solid and the shaky.",
        ],
        list: [
          "Solid: hot steam bathing is a regional tradition across Northern and Eastern Europe with many independent local names and forms.",
          "Solid: felting predates weaving and the oldest surviving felt comes from Central Asian burials, long before any European bathhouse hat.",
          "Solid: the felt hat is near-universal standard kit in banya culture today, and considerably less entrenched in Finnish sauna culture.",
          "Solid: English borrowed only the Finnish word, and Finnish sauna culture was listed by UNESCO in 2020.",
          "Shaky, and we will not pretend otherwise: exactly when, where and by whom the first felt bathing hat was made. There is no reliable date, and the sources that give you one are repeating each other.",
        ],
      },
    ],
    faq: [
      {
        q: "Are sauna hats Finnish?",
        a: "Not originally, despite how they are usually marketed. The felt bathing hat belongs to the wider sweat-bathing cultures of Eastern and Northern Europe, and it is most strongly associated with the Russian banya and the Baltic bathhouse traditions. Finland has a genuine and ancient sauna tradition, but the hat is not a Finnish invention.",
      },
      {
        q: "What is a banya hat?",
        a: "The same object under a more accurate name. Banya is the Russian steam bathhouse, and a banya hat is the felt cap worn in it, where it is standard equipment sold alongside the birch whisks. In English the identical product is almost always sold as a sauna hat, because sauna is the word English adopted.",
      },
      {
        q: "Do Finns wear sauna hats?",
        a: "Some do, and you will certainly see them. The difference is cultural weight rather than existence: in banya culture the hat is near-universal and unremarkable, whereas plenty of Finnish sauna-goers have never worn one. That gap is a good part of the reason to doubt the Finnish-origin story.",
      },
      {
        q: "Is there any difference between a banya hat and a sauna hat?",
        a: "Functionally no. Both are thick wool felt caps doing the same job. The variation is in shape and decoration rather than purpose, and some of the more theatrical shapes you see, the tall cones and the elaborate folk designs, come out of banya tradition rather than Finnish restraint.",
      },
      {
        q: "How old are sauna hats?",
        a: "Nobody can tell you honestly. Felt itself is thousands of years old and well evidenced archaeologically, and bathhouse traditions in the region are very old too, but working clothes were used until they fell apart rather than preserved. Any specific founding date you read for the felt bathing hat is an invention.",
      },
      {
        q: "Does the origin affect which hat I should buy?",
        a: "Not the origin itself, but the banya's habits are worth copying: wet the hat before a session, wear it low over the ears, and treat it as standard kit rather than an occasional accessory. What matters when buying is still material, thickness and fit.",
      },
    ],
  },
];

export const ARTICLES_INDEX = {
  eyebrow: "Guides",
  title: "Everything we've learned about sauna hats.",
  intro:
    "We made a sauna hat because we couldn't buy a good one locally, which meant learning all of this the slow way. These are the questions we get asked most, answered properly, with our own hats, our own photos, our own bench time.",
  signoff: "See you at 90°C.",
};

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
