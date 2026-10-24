// Plant database.
//
// All timing is relative to your local frost dates, which is how extension services
// publish planting calendars. Weeks are negative before the frost date, positive after.
//
//   hardy     'hardy' (takes hard frost) | 'half' (takes light frost) | 'tender' (killed by frost)
//   germ      [min, max] days to germinate (null for crowns / slips)
//   indoor    [from, to] weeks relative to LAST spring frost to start seeds indoors
//   seedling  weeks seedlings grow indoors before transplant
//   tp        weeks relative to LAST spring frost to transplant outside
//   direct    [from, to] weeks relative to LAST spring frost to sow / plant outside
//   fall      { m: 'd' (direct) | 'i' (indoor), w: [from, to] } weeks BEFORE FIRST fall frost
//             (negative = after first frost, e.g. garlic)
//   mat       days from going in the ground (sowing or transplant) to first harvest
//   matFrom   'lastfrost' = harvest is mat days after the NEXT last spring frost (overwintered crops)
//   years     extra years to wait before first harvest (perennials)
//   hw        harvest window, days of harvest once it starts
//   succ      re-sow every N days for a continuous harvest (0 = no succession)
//   fert      fertilizer preset name (see FERT) or a custom list of [anchor, days, text]
//   comp      good companions (plant ids)    avoid   bad companions (plant ids)
(function () {
  const FERT = {
    fruiting: [
      ['ground', 0, 'Work compost and a balanced fertilizer (e.g. 10-10-10, or organic 5-5-5) into the planting hole'],
      ['ground', 35, 'Side-dress with a balanced or low-nitrogen fertilizer as the first fruits set'],
      ['ground', 63, 'Side-dress again to keep fruit coming'],
    ],
    brassica: [
      ['ground', 0, 'Work compost and a balanced fertilizer into the bed'],
      ['ground', 21, 'Side-dress with nitrogen (blood meal, fish emulsion or 21-0-0)'],
      ['ground', 42, 'Second nitrogen side-dress'],
    ],
    leafy: [
      ['ground', 0, 'Mix compost into the bed before planting'],
      ['ground', 21, 'Water in fish emulsion or side-dress with a nitrogen fertilizer'],
    ],
    root: [
      ['ground', 0, 'Work compost and a low-nitrogen fertilizer (e.g. 5-10-10) into the bed; avoid fresh manure'],
      ['ground', 30, 'Light side-dress of low-nitrogen fertilizer'],
    ],
    legume: [
      ['ground', 0, 'Coat seed with inoculant and work in compost. Skip nitrogen: legumes make their own'],
      ['ground', 35, 'Optional light compost side-dress at first flowers'],
    ],
    vine: [
      ['ground', 0, 'Work compost and a balanced fertilizer into each hill'],
      ['ground', 21, 'Side-dress with a balanced fertilizer when vines start to run'],
      ['ground', 42, 'Side-dress again at first flowers'],
    ],
    corn: [
      ['ground', 0, 'Work compost and a balanced fertilizer into the bed'],
      ['ground', 30, 'Side-dress with nitrogen when plants are knee-high'],
      ['ground', 50, 'Side-dress with nitrogen again as tassels appear'],
    ],
    allium: [
      ['ground', 0, 'Work compost and a balanced fertilizer into the bed'],
      ['ground', 21, 'Side-dress with nitrogen'],
      ['ground', 42, 'Side-dress with nitrogen; stop once bulbs begin to swell'],
    ],
    herb: [
      ['ground', 0, 'Light compost at planting; most herbs taste best grown lean'],
      ['ground', 42, 'Optional light feeding with diluted fish emulsion'],
    ],
    flower: [
      ['ground', 0, 'Mix compost into the bed'],
      ['ground', 30, 'Light balanced feeding to encourage blooms'],
    ],
    tuber: [
      ['ground', 0, 'Work compost and a balanced fertilizer into the trench'],
      ['ground', 28, 'Hill soil up around stems and side-dress with balanced fertilizer'],
      ['ground', 50, 'Hill again; last feeding of the season'],
    ],
  };

  const ONIONS = ['onion', 'garlic', 'leek', 'chives'];

  const P = [
    // ---------------- Vegetables ----------------
    { id: 'arugula', name: 'Arugula', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun to part shade', space: '4–6 in', depth: '¼ in',
      germ: [5, 7], direct: [-4, 0], fall: { m: 'd', w: [8, 3] }, mat: 40, hw: 21, succ: 14, fert: 'leafy',
      comp: ['lettuce', 'spinach', 'carrot', 'beet', 'onion'], avoid: ['strawberry'], note: 'Bolts in heat; pick young leaves for the mildest flavor.' },
    { id: 'asparagus', name: 'Asparagus (crowns)', cat: 'Vegetable', fam: 'Asparagus family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '12–18 in', depth: '6 in trench',
      germ: null, direct: [-4, -2], mat: 0, matFrom: 'lastfrost', years: 1, hw: 21, succ: 0,
      fert: [['ground', 0, 'Spread compost and a phosphorus-rich fertilizer in the trench under the crowns'], ['ground', 60, 'Side-dress with balanced fertilizer as ferns grow']],
      comp: ['tomato', 'parsley', 'basil'], avoid: ['onion', 'garlic', 'potato'], note: 'Perennial. No harvest the first year. Light 2–3 week harvest the second spring, full 6–8 weeks after that.' },
    { id: 'beanbush', name: 'Bean, bush', cat: 'Vegetable', fam: 'Legume', hardy: 'tender', sun: 'Full sun', space: '3–4 in', depth: '1 in',
      germ: [7, 10], direct: [1, 10], mat: 55, hw: 21, succ: 14, fert: 'legume',
      comp: ['corn', 'cucumber', 'potato', 'carrot', 'beet', 'cabbage', 'squash', 'strawberry'], avoid: [...ONIONS, 'fennel', 'pepper'], note: 'Wait for soil above 60°F. Pick often to keep plants producing.' },
    { id: 'beanpole', name: 'Bean, pole', cat: 'Vegetable', fam: 'Legume', hardy: 'tender', sun: 'Full sun', space: '6 in', depth: '1 in',
      germ: [7, 10], direct: [1, 6], mat: 65, hw: 45, succ: 0, fert: 'legume',
      comp: ['corn', 'squash', 'radish', 'cucumber', 'carrot'], avoid: [...ONIONS, 'beet', 'sunflower', 'fennel'], note: 'Needs a trellis or poles 6–8 ft tall.' },
    { id: 'beet', name: 'Beet', cat: 'Vegetable', fam: 'Amaranth family', hardy: 'hardy', sun: 'Full sun', space: '3–4 in', depth: '½ in',
      germ: [5, 8], direct: [-4, 2], fall: { m: 'd', w: [10, 8] }, mat: 55, hw: 21, succ: 21, fert: 'root',
      comp: ['lettuce', 'onion', 'cabbage', 'broccoli', 'kohlrabi', 'beanbush'], avoid: ['beanpole'], note: 'Each "seed" is a cluster; thin seedlings to one per spot. Greens are edible too.' },
    { id: 'bokchoy', name: 'Bok choy', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun to part shade', space: '6–10 in', depth: '¼ in',
      germ: [4, 7], direct: [-4, -1], fall: { m: 'd', w: [8, 4] }, mat: 45, hw: 14, succ: 14, fert: 'leafy',
      comp: ['onion', 'celery', 'beet', 'dill'], avoid: ['strawberry', 'tomato'], note: 'Bolts quickly in long hot days; fall crops are often best.' },
    { id: 'broccoli', name: 'Broccoli', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'half', sun: 'Full sun', space: '18 in', depth: '¼ in',
      germ: [4, 10], indoor: [-9, -7], seedling: 6, tp: -2, fall: { m: 'i', w: [16, 12] }, mat: 65, hw: 28, succ: 0, fert: 'brassica',
      comp: ['onion', 'dill', 'chamomile', 'beet', 'celery', 'lettuce', 'rosemary', 'nasturtium', 'thyme'], avoid: ['tomato', 'strawberry', 'beanpole'], note: 'Cut the main head while buds are tight; side shoots keep coming for weeks.' },
    { id: 'brussels', name: 'Brussels sprouts', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '24 in', depth: '¼ in',
      germ: [5, 10], indoor: [-10, -8], seedling: 6, tp: -2, fall: { m: 'i', w: [20, 16] }, mat: 95, hw: 45, succ: 0, fert: 'brassica',
      comp: ['onion', 'dill', 'sage', 'thyme', 'nasturtium', 'beet'], avoid: ['tomato', 'strawberry'], note: 'Flavor sweetens after a few light frosts. Harvest from the bottom up.' },
    { id: 'cabbage', name: 'Cabbage', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '12–18 in', depth: '¼ in',
      germ: [4, 10], indoor: [-10, -8], seedling: 6, tp: -3, fall: { m: 'i', w: [16, 12] }, mat: 70, hw: 21, succ: 0, fert: 'brassica',
      comp: ['dill', 'onion', 'celery', 'chamomile', 'thyme', 'sage', 'nasturtium', 'beanbush'], avoid: ['strawberry', 'tomato'], note: 'Harvest when heads feel firm. Split heads mean you waited too long.' },
    { id: 'carrot', name: 'Carrot', cat: 'Vegetable', fam: 'Carrot family', hardy: 'hardy', sun: 'Full sun', space: '2–3 in', depth: '¼ in',
      germ: [10, 21], direct: [-3, 2], fall: { m: 'd', w: [12, 10] }, mat: 70, hw: 30, succ: 21, fert: 'root',
      comp: ['tomato', 'onion', 'leek', 'lettuce', 'rosemary', 'sage', 'chives', 'pea', 'radish'], avoid: ['dill', 'parsnip'], note: 'Keep the seedbed moist until sprouts appear; slow to germinate. Needs loose soil.' },
    { id: 'cauliflower', name: 'Cauliflower', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'half', sun: 'Full sun', space: '18–24 in', depth: '¼ in',
      germ: [5, 10], indoor: [-9, -7], seedling: 6, tp: -2, fall: { m: 'i', w: [16, 12] }, mat: 60, hw: 10, succ: 0, fert: 'brassica',
      comp: ['onion', 'dill', 'celery', 'beanbush', 'thyme'], avoid: ['tomato', 'strawberry'], note: 'Tie leaves over heads ("blanching") when they are egg-sized to keep them white.' },
    { id: 'celery', name: 'Celery', cat: 'Vegetable', fam: 'Carrot family', hardy: 'half', sun: 'Full sun', space: '8–10 in', depth: 'Surface (needs light)',
      germ: [14, 21], indoor: [-12, -10], seedling: 10, tp: 1, mat: 100, hw: 30, succ: 0, fert: 'leafy',
      comp: ['leek', 'tomato', 'cabbage', 'broccoli', 'beanbush'], avoid: ['corn'], note: 'Thirsty plant: keep evenly moist all season.' },
    { id: 'chard', name: 'Chard, Swiss', cat: 'Vegetable', fam: 'Amaranth family', hardy: 'half', sun: 'Full sun to part shade', space: '8–12 in', depth: '½ in',
      germ: [5, 7], indoor: [-6, -4], seedling: 4, tp: -1, direct: [-2, 2], fall: { m: 'd', w: [10, 6] }, mat: 55, hw: 120, succ: 0, fert: 'leafy',
      comp: ['beanbush', 'cabbage', 'onion', 'lettuce'], avoid: [], note: 'Cut outer leaves and it keeps producing all season.' },
    { id: 'collards', name: 'Collards', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '18 in', depth: '¼ in',
      germ: [5, 10], indoor: [-8, -6], seedling: 5, tp: -3, direct: [-4, 0], fall: { m: 'd', w: [12, 8] }, mat: 60, hw: 90, succ: 0, fert: 'brassica',
      comp: ['onion', 'dill', 'celery', 'thyme', 'tomato'], avoid: ['strawberry'], note: 'Very cold and heat tolerant. Pick lower leaves first.' },
    { id: 'corn', name: 'Corn, sweet', cat: 'Vegetable', fam: 'Grass family', hardy: 'tender', sun: 'Full sun', space: '8–12 in, in blocks', depth: '1–1½ in',
      germ: [7, 10], direct: [1, 6], mat: 75, hw: 10, succ: 14, fert: 'corn',
      comp: ['beanbush', 'beanpole', 'squash', 'pumpkin', 'cucumber', 'pea', 'sunflower', 'melon'], avoid: ['tomato', 'celery'], note: 'Plant in blocks of at least 4 rows, not one long row, so it pollinates.' },
    { id: 'cucumber', name: 'Cucumber', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '12 in (trellis) / 36 in (hills)', depth: '1 in',
      germ: [3, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [1, 6], mat: 55, hw: 35, succ: 21, fert: 'vine',
      comp: ['beanbush', 'corn', 'pea', 'radish', 'dill', 'sunflower', 'nasturtium', 'lettuce'], avoid: ['potato', 'sage'], note: 'Roots dislike disturbance; start indoors in pots you can plant whole.' },
    { id: 'eggplant', name: 'Eggplant', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'tender', sun: 'Full sun', space: '18–24 in', depth: '¼ in',
      germ: [7, 14], indoor: [-10, -8], seedling: 8, tp: 3, mat: 75, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['beanbush', 'pepper', 'marigold', 'thyme', 'okra'], avoid: ['fennel'], note: 'Needs warm soil and warm nights. Wait the extra week to transplant.' },
    { id: 'garlic', name: 'Garlic', cat: 'Vegetable', fam: 'Onion family', hardy: 'hardy', sun: 'Full sun', space: '6 in', depth: '2 in (pointy end up)',
      germ: [14, 28], fall: { m: 'd', w: [2, -4] }, mat: 80, matFrom: 'lastfrost', hw: 14, succ: 0,
      fert: [['ground', 0, 'Work compost and bone meal or balanced fertilizer into the bed; mulch after planting'], ['lastfrost', -28, 'Side-dress with nitrogen as green shoots grow in spring'], ['lastfrost', 14, 'Second nitrogen side-dress; stop once bulbs begin to form']],
      comp: ['tomato', 'pepper', 'cabbage', 'broccoli', 'carrot', 'beet', 'strawberry', 'lettuce'], avoid: ['beanbush', 'beanpole', 'pea'], note: 'Plant individual cloves in fall. Harvest the next summer when the lower third of the leaves turn brown.' },
    { id: 'kale', name: 'Kale', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun to part shade', space: '12–18 in', depth: '¼ in',
      germ: [5, 8], indoor: [-8, -6], seedling: 5, tp: -3, direct: [-4, -2], fall: { m: 'd', w: [10, 6] }, mat: 55, hw: 90, succ: 0, fert: 'brassica',
      comp: ['beet', 'celery', 'onion', 'potato', 'dill', 'nasturtium'], avoid: ['strawberry', 'tomato'], note: 'Frost makes it sweeter. Pick outer leaves and it regrows.' },
    { id: 'kohlrabi', name: 'Kohlrabi', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '6 in', depth: '¼ in',
      germ: [5, 10], indoor: [-8, -6], seedling: 5, tp: -3, direct: [-4, -1], fall: { m: 'd', w: [10, 8] }, mat: 50, hw: 14, succ: 14, fert: 'brassica',
      comp: ['beet', 'onion', 'cucumber', 'lettuce'], avoid: ['tomato', 'pepper', 'strawberry', 'fennel'], note: 'Harvest bulbs at 2–3 inches across, before they turn woody.' },
    { id: 'leek', name: 'Leek', cat: 'Vegetable', fam: 'Onion family', hardy: 'hardy', sun: 'Full sun', space: '6 in', depth: '¼ in',
      germ: [7, 14], indoor: [-12, -10], seedling: 10, tp: -2, mat: 100, hw: 60, succ: 0, fert: 'allium',
      comp: ['carrot', 'celery', 'onion', 'lettuce'], avoid: ['beanbush', 'beanpole', 'pea'], note: 'Plant deep or hill soil up the stems for long white shanks.' },
    { id: 'lettuce', name: 'Lettuce', cat: 'Vegetable', fam: 'Daisy family', hardy: 'half', sun: 'Full sun to part shade', space: '6–12 in', depth: '⅛ in (needs light)',
      germ: [7, 10], indoor: [-8, -6], seedling: 4, tp: -2, direct: [-4, 1], fall: { m: 'd', w: [8, 4] }, mat: 50, hw: 21, succ: 14, fert: 'leafy',
      comp: ['carrot', 'radish', 'onion', 'chives', 'strawberry', 'beet', 'cucumber'], avoid: [], note: 'Turns bitter and bolts in heat; give afternoon shade in summer.' },
    { id: 'melon', name: 'Melon (cantaloupe)', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '36 in', depth: '1 in',
      germ: [5, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [2, 4], mat: 80, hw: 21, succ: 0, fert: 'vine',
      comp: ['corn', 'radish', 'nasturtium', 'marigold', 'okra'], avoid: ['potato'], note: 'Ripe when the melon slips off the vine with a gentle tug.' },
    { id: 'mustard', name: 'Mustard greens', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun to part shade', space: '6 in', depth: '¼ in',
      germ: [4, 7], direct: [-4, 0], fall: { m: 'd', w: [8, 4] }, mat: 40, hw: 21, succ: 14, fert: 'leafy',
      comp: ['beanbush', 'onion', 'beet'], avoid: ['strawberry'], note: 'Spicy when grown in heat; mild in cool weather.' },
    { id: 'okra', name: 'Okra', cat: 'Vegetable', fam: 'Mallow family', hardy: 'tender', sun: 'Full sun', space: '12–18 in', depth: '½–1 in',
      germ: [7, 14], indoor: [-5, -3], seedling: 4, tp: 3, direct: [2, 6], mat: 60, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['pepper', 'eggplant', 'melon', 'cucumber'], avoid: [], note: 'Soak seed overnight before sowing. Pick pods at 3–4 inches, every 2 days.' },
    { id: 'onion', name: 'Onion (from seed)', cat: 'Vegetable', fam: 'Onion family', hardy: 'hardy', sun: 'Full sun', space: '4 in', depth: '¼ in',
      germ: [7, 10], indoor: [-12, -8], seedling: 9, tp: -3, mat: 100, hw: 21, succ: 0, fert: 'allium',
      comp: ['beet', 'carrot', 'lettuce', 'tomato', 'pepper', 'cabbage', 'broccoli', 'strawberry', 'chamomile'], avoid: ['beanbush', 'beanpole', 'pea', 'asparagus'], note: 'Choose long-day varieties in the north, short-day in the south. Harvest when the tops fall over.' },
    { id: 'parsnip', name: 'Parsnip', cat: 'Vegetable', fam: 'Carrot family', hardy: 'hardy', sun: 'Full sun', space: '3–4 in', depth: '½ in',
      germ: [14, 21], direct: [-2, 2], mat: 120, hw: 60, succ: 0, fert: 'root',
      comp: ['onion', 'radish', 'pea'], avoid: ['carrot', 'celery'], note: 'Always use fresh seed. Sweetest after frost; can stay in the ground over winter.' },
    { id: 'pea', name: 'Pea', cat: 'Vegetable', fam: 'Legume', hardy: 'hardy', sun: 'Full sun', space: '2 in', depth: '1 in',
      germ: [7, 14], direct: [-6, -2], fall: { m: 'd', w: [12, 9] }, mat: 60, hw: 21, succ: 0, fert: 'legume',
      comp: ['carrot', 'radish', 'turnip', 'cucumber', 'corn', 'spinach', 'lettuce'], avoid: [...ONIONS], note: 'One of the first crops of spring. Give climbing types a trellis.' },
    { id: 'pepperhot', name: 'Pepper, hot', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'tender', sun: 'Full sun', space: '18 in', depth: '¼ in',
      germ: [7, 14], indoor: [-10, -8], seedling: 8, tp: 2, mat: 80, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['basil', 'onion', 'carrot', 'tomato', 'okra', 'eggplant'], avoid: ['fennel', 'beanbush', 'kohlrabi'], note: 'Seeds germinate faster on a heat mat (80°F).' },
    { id: 'pepper', name: 'Pepper, sweet', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'tender', sun: 'Full sun', space: '18 in', depth: '¼ in',
      germ: [7, 14], indoor: [-10, -8], seedling: 8, tp: 2, mat: 70, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['basil', 'onion', 'carrot', 'tomato', 'okra', 'eggplant'], avoid: ['fennel', 'beanbush', 'kohlrabi'], note: 'Green peppers are unripe; leave them on 2–3 more weeks for red/yellow.' },
    { id: 'potato', name: 'Potato', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'half', sun: 'Full sun', space: '12 in', depth: '4 in (seed pieces)',
      germ: [14, 28], direct: [-3, 1], mat: 90, hw: 30, succ: 0, fert: 'tuber',
      comp: ['beanbush', 'corn', 'cabbage', 'marigold', 'kale'], avoid: ['tomato', 'cucumber', 'squash', 'pumpkin', 'sunflower', 'melon'], note: 'Plant certified seed potatoes cut to 1–2 eyes each. "New" potatoes can be dug 2–3 weeks early.' },
    { id: 'pumpkin', name: 'Pumpkin', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '4–6 ft', depth: '1 in',
      germ: [5, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [1, 4], mat: 105, hw: 21, succ: 0, fert: 'vine',
      comp: ['corn', 'beanpole', 'nasturtium', 'marigold', 'radish'], avoid: ['potato'], note: 'Harvest when the rind resists a fingernail and the stem is dry. Cure in sun 10 days.' },
    { id: 'radish', name: 'Radish', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '1–2 in', depth: '½ in',
      germ: [3, 7], direct: [-5, 2], fall: { m: 'd', w: [6, 2] }, mat: 25, hw: 10, succ: 10, fert: 'root',
      comp: ['lettuce', 'pea', 'carrot', 'spinach', 'cucumber', 'nasturtium', 'squash'], avoid: [], note: 'Fastest crop in the garden. Pull promptly or they turn pithy.' },
    { id: 'spinach', name: 'Spinach', cat: 'Vegetable', fam: 'Amaranth family', hardy: 'hardy', sun: 'Full sun to part shade', space: '4–6 in', depth: '½ in',
      germ: [7, 14], direct: [-6, -2], fall: { m: 'd', w: [8, 4] }, mat: 45, hw: 21, succ: 14, fert: 'leafy',
      comp: ['strawberry', 'pea', 'radish', 'cabbage', 'lettuce'], avoid: [], note: 'Bolts as days lengthen. Fall-sown spinach can overwinter under mulch.' },
    { id: 'squash', name: 'Squash, summer / zucchini', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '24–36 in', depth: '1 in',
      germ: [5, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [1, 6], mat: 50, hw: 60, succ: 0, fert: 'vine',
      comp: ['corn', 'beanbush', 'nasturtium', 'radish', 'marigold', 'dill'], avoid: ['potato'], note: 'Pick at 6–8 inches. Two plants are plenty for most families.' },
    { id: 'squashwinter', name: 'Squash, winter', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '3–5 ft', depth: '1 in',
      germ: [5, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [1, 4], mat: 95, hw: 21, succ: 0, fert: 'vine',
      comp: ['corn', 'beanpole', 'nasturtium', 'marigold', 'radish'], avoid: ['potato'], note: 'Butternut, acorn, spaghetti. Harvest before hard frost and cure 1–2 weeks.' },
    { id: 'sweetpotato', name: 'Sweet potato (slips)', cat: 'Vegetable', fam: 'Morning glory family', hardy: 'tender', sun: 'Full sun', space: '12–18 in', depth: 'Bury slips to top leaves',
      germ: null, direct: [3, 6], mat: 100, hw: 14, succ: 0,
      fert: [['ground', 0, 'Low-nitrogen fertilizer only (e.g. 5-10-10); too much nitrogen makes vines, not roots'], ['ground', 30, 'Light side-dress of potassium (wood ash or sulfate of potash)']],
      comp: ['thyme', 'beanbush'], avoid: ['squash', 'pumpkin'], note: 'Plant rooted slips once soil is warm. Dig before soil cools below 50°F; cure 10 days warm.' },
    { id: 'tomatillo', name: 'Tomatillo', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'tender', sun: 'Full sun', space: '24–36 in', depth: '¼ in',
      germ: [5, 10], indoor: [-8, -6], seedling: 7, tp: 2, mat: 75, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['onion', 'marigold', 'basil'], avoid: ['fennel'], note: 'Plant at least two; they need a partner to set fruit. Ripe when husks split.' },
    { id: 'tomato', name: 'Tomato', cat: 'Vegetable', fam: 'Nightshade family', hardy: 'tender', sun: 'Full sun', space: '24–36 in', depth: '¼ in',
      germ: [5, 10], indoor: [-8, -6], seedling: 7, tp: 2, mat: 70, hw: 60, succ: 0, fert: 'fruiting',
      comp: ['basil', 'carrot', 'marigold', 'onion', 'parsley', 'nasturtium', 'garlic', 'chives', 'asparagus'], avoid: ['cabbage', 'broccoli', 'cauliflower', 'kale', 'brussels', 'kohlrabi', 'corn', 'fennel', 'potato', 'dill'], note: 'Plant deep: bury the stem up to the top leaves. Stake or cage at transplant.' },
    { id: 'turnip', name: 'Turnip', cat: 'Vegetable', fam: 'Cabbage family', hardy: 'hardy', sun: 'Full sun', space: '4 in', depth: '½ in',
      germ: [3, 7], direct: [-3, 0], fall: { m: 'd', w: [10, 6] }, mat: 50, hw: 21, succ: 21, fert: 'root',
      comp: ['pea', 'onion', 'lettuce'], avoid: ['potato'], note: 'Fall turnips are sweeter. Greens are edible.' },
    { id: 'watermelon', name: 'Watermelon', cat: 'Vegetable', fam: 'Squash family', hardy: 'tender', sun: 'Full sun', space: '4–6 ft', depth: '1 in',
      germ: [5, 10], indoor: [-4, -3], seedling: 3, tp: 2, direct: [2, 4], mat: 85, hw: 21, succ: 0, fert: 'vine',
      comp: ['corn', 'radish', 'nasturtium', 'marigold'], avoid: ['potato'], note: 'Ripe when the belly spot turns creamy yellow and the nearest tendril dries.' },

    // ---------------- Fruit ----------------
    { id: 'rhubarb', name: 'Rhubarb (crowns)', cat: 'Fruit', fam: 'Buckwheat family', hardy: 'hardy', perennial: true, sun: 'Full sun to part shade', space: '36 in', depth: 'Buds 2 in below soil',
      germ: null, direct: [-4, -2], mat: 21, matFrom: 'lastfrost', years: 1, hw: 28, succ: 0,
      fert: [['ground', 0, 'Dig plenty of compost or aged manure into the planting hole'], ['ground', 60, 'Side-dress with balanced fertilizer']],
      comp: ['cabbage', 'broccoli', 'garlic', 'onion'], avoid: [], note: 'Perennial. Leaves are poisonous; eat stalks only. Light harvest the second year.' },
    { id: 'strawberry', name: 'Strawberry (crowns)', cat: 'Fruit', fam: 'Rose family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '12–18 in', depth: 'Crown at soil level',
      germ: null, direct: [-4, -2], mat: 45, matFrom: 'lastfrost', years: 1, hw: 21, succ: 0,
      fert: [['ground', 0, 'Work compost and a balanced fertilizer into the bed'], ['ground', 60, 'Side-dress with balanced fertilizer as runners form']],
      comp: ['spinach', 'lettuce', 'onion', 'garlic', 'thyme', 'beanbush'], avoid: ['cabbage', 'broccoli', 'cauliflower', 'brussels', 'kale', 'collards', 'kohlrabi'], note: 'June-bearers: pinch off first-year flowers for a much bigger crop next spring. Everbearers fruit the first summer.' },

    // ---------------- Herbs ----------------
    { id: 'basil', name: 'Basil', cat: 'Herb', fam: 'Mint family', hardy: 'tender', sun: 'Full sun', space: '12 in', depth: '¼ in',
      germ: [5, 10], indoor: [-6, -4], seedling: 5, tp: 1, direct: [1, 6], mat: 40, hw: 90, succ: 21, fert: 'herb',
      comp: ['tomato', 'pepper', 'pepperhot', 'oregano', 'asparagus', 'tomatillo'], avoid: ['sage'], note: 'Pinch the tops often and remove flower buds for bushy, leafy plants.' },
    { id: 'chamomile', name: 'Chamomile (German)', cat: 'Herb', fam: 'Daisy family', hardy: 'half', sun: 'Full sun', space: '8 in', depth: 'Surface (needs light)',
      germ: [7, 14], indoor: [-8, -6], seedling: 6, tp: -1, direct: [-2, 1], mat: 60, hw: 45, succ: 0, fert: 'herb',
      comp: ['cabbage', 'broccoli', 'onion', 'cucumber'], avoid: [], note: 'Harvest flowers when fully open; dry for tea.' },
    { id: 'chives', name: 'Chives', cat: 'Herb', fam: 'Onion family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '8–12 in', depth: '¼ in',
      germ: [7, 14], indoor: [-8, -6], seedling: 8, tp: -2, direct: [-4, 0], mat: 80, hw: 120, succ: 0, fert: 'herb',
      comp: ['carrot', 'tomato', 'lettuce', 'strawberry'], avoid: ['beanbush', 'beanpole', 'pea'], note: 'Perennial. Cut to 2 inches and it regrows; flowers are edible.' },
    { id: 'cilantro', name: 'Cilantro', cat: 'Herb', fam: 'Carrot family', hardy: 'half', sun: 'Full sun to part shade', space: '6 in', depth: '¼ in',
      germ: [7, 10], direct: [-2, 2], fall: { m: 'd', w: [8, 4] }, mat: 50, hw: 21, succ: 21, fert: 'herb',
      comp: ['spinach', 'beanbush', 'pea', 'tomato'], avoid: ['fennel'], note: 'Bolts in heat. Let some go to seed for coriander.' },
    { id: 'dill', name: 'Dill', cat: 'Herb', fam: 'Carrot family', hardy: 'half', sun: 'Full sun', space: '12 in', depth: '¼ in',
      germ: [7, 21], direct: [-1, 4], mat: 45, hw: 30, succ: 21, fert: 'herb',
      comp: ['cabbage', 'broccoli', 'cucumber', 'lettuce', 'onion', 'corn'], avoid: ['carrot', 'tomato', 'fennel'], note: 'Attracts beneficial insects. Hosts swallowtail caterpillars; plant extra.' },
    { id: 'fennel', name: 'Fennel (bulb)', cat: 'Herb', fam: 'Carrot family', hardy: 'half', sun: 'Full sun', space: '12 in', depth: '¼ in',
      germ: [7, 14], direct: [0, 4], fall: { m: 'd', w: [12, 10] }, mat: 80, hw: 21, succ: 0, fert: 'herb',
      comp: [], avoid: ['tomato', 'beanbush', 'beanpole', 'pepper', 'pepperhot', 'kohlrabi', 'dill', 'cilantro', 'eggplant'], note: 'A poor neighbor to most plants; give it a bed or container of its own.' },
    { id: 'mint', name: 'Mint', cat: 'Herb', fam: 'Mint family', hardy: 'hardy', perennial: true, sun: 'Full sun to part shade', space: '18 in', depth: 'Surface',
      germ: [10, 16], indoor: [-10, -8], seedling: 8, tp: 0, mat: 90, hw: 120, succ: 0, fert: 'herb',
      comp: ['cabbage', 'broccoli', 'kale', 'tomato'], avoid: ['parsley'], note: 'Perennial and invasive; grow in a container or sunken pot.' },
    { id: 'oregano', name: 'Oregano', cat: 'Herb', fam: 'Mint family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '12 in', depth: 'Surface',
      germ: [7, 14], indoor: [-8, -6], seedling: 8, tp: 1, mat: 80, hw: 120, succ: 0, fert: 'herb',
      comp: ['basil', 'pepper', 'tomato', 'cabbage'], avoid: [], note: 'Perennial. Flavor is strongest just before flowering.' },
    { id: 'parsley', name: 'Parsley', cat: 'Herb', fam: 'Carrot family', hardy: 'half', sun: 'Full sun to part shade', space: '8 in', depth: '¼ in',
      germ: [14, 28], indoor: [-10, -8], seedling: 8, tp: -2, direct: [-3, 1], mat: 75, hw: 120, succ: 0, fert: 'herb',
      comp: ['tomato', 'asparagus', 'corn', 'pepper'], avoid: ['mint'], note: 'Soak seed overnight; slow to germinate. Biennial: harvests well into winter.' },
    { id: 'rosemary', name: 'Rosemary', cat: 'Herb', fam: 'Mint family', hardy: 'half', perennial: true, sun: 'Full sun', space: '24 in', depth: 'Surface',
      germ: [14, 21], indoor: [-12, -10], seedling: 10, tp: 1, mat: 90, hw: 120, succ: 0, fert: 'herb',
      comp: ['beanbush', 'cabbage', 'carrot', 'sage', 'broccoli'], avoid: [], note: 'Slow and spotty from seed; cuttings or nursery plants are easier. Overwinter indoors below zone 7.' },
    { id: 'sage', name: 'Sage', cat: 'Herb', fam: 'Mint family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '18–24 in', depth: '⅛ in',
      germ: [10, 21], indoor: [-8, -6], seedling: 7, tp: 0, mat: 75, hw: 120, succ: 0, fert: 'herb',
      comp: ['cabbage', 'broccoli', 'carrot', 'rosemary', 'brussels'], avoid: ['cucumber', 'basil'], note: 'Perennial. Avoid heavy harvests the first year.' },
    { id: 'thyme', name: 'Thyme', cat: 'Herb', fam: 'Mint family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '12 in', depth: 'Surface',
      germ: [7, 21], indoor: [-10, -8], seedling: 9, tp: 1, mat: 85, hw: 120, succ: 0, fert: 'herb',
      comp: ['cabbage', 'broccoli', 'tomato', 'eggplant', 'strawberry', 'brussels'], avoid: [], note: 'Perennial. Needs good drainage; dislikes wet feet.' },

    // ---------------- Flowers ----------------
    { id: 'alyssum', name: 'Sweet alyssum', cat: 'Flower', fam: 'Cabbage family', hardy: 'half', sun: 'Full sun to part shade', space: '6–9 in', depth: 'Surface (needs light)',
      germ: [5, 15], indoor: [-8, -6], seedling: 6, tp: -1, direct: [-2, 1], mat: 50, hw: 120, succ: 0, fert: 'flower', bloom: true,
      comp: ['lettuce', 'broccoli', 'cabbage', 'potato'], avoid: [], note: 'Low border that draws hoverflies, which eat aphids.' },
    { id: 'calendula', name: 'Calendula', cat: 'Flower', fam: 'Daisy family', hardy: 'half', sun: 'Full sun', space: '12 in', depth: '¼ in',
      germ: [7, 10], indoor: [-8, -6], seedling: 6, tp: -1, direct: [-2, 2], fall: { m: 'd', w: [8, 6] }, mat: 55, hw: 90, succ: 0, fert: 'flower', bloom: true,
      comp: ['tomato', 'asparagus', 'carrot', 'beanbush'], avoid: [], note: 'Edible petals. Deadhead to keep blooming.' },
    { id: 'cosmos', name: 'Cosmos', cat: 'Flower', fam: 'Daisy family', hardy: 'tender', sun: 'Full sun', space: '12–18 in', depth: '¼ in',
      germ: [7, 10], direct: [1, 6], mat: 75, hw: 90, succ: 0, fert: [['ground', 0, 'No fertilizer needed; cosmos blooms best in poor soil']], bloom: true,
      comp: ['corn', 'squash', 'tomato'], avoid: [], note: 'Great cut flower; attracts pollinators and beneficial wasps.' },
    { id: 'lavender', name: 'Lavender', cat: 'Flower', fam: 'Mint family', hardy: 'hardy', perennial: true, sun: 'Full sun', space: '18–24 in', depth: 'Surface (needs light)',
      germ: [14, 28], indoor: [-12, -10], seedling: 10, tp: 1, mat: 100, hw: 60, succ: 0, fert: [['ground', 0, 'Mix in gravel or sand for drainage; skip fertilizer']], bloom: true,
      comp: ['rosemary', 'thyme', 'sage', 'cabbage'], avoid: ['mint'], note: 'Perennial. Seed benefits from 3–4 weeks of cold-moist chilling in the fridge first.' },
    { id: 'marigold', name: 'Marigold', cat: 'Flower', fam: 'Daisy family', hardy: 'tender', sun: 'Full sun', space: '8–12 in', depth: '¼ in',
      germ: [4, 14], indoor: [-8, -6], seedling: 6, tp: 1, direct: [1, 4], mat: 50, hw: 100, succ: 0, fert: 'flower', bloom: true,
      comp: ['tomato', 'pepper', 'eggplant', 'squash', 'potato', 'melon', 'cucumber'], avoid: [], note: 'French marigolds help suppress root-knot nematodes.' },
    { id: 'nasturtium', name: 'Nasturtium', cat: 'Flower', fam: 'Nasturtium family', hardy: 'tender', sun: 'Full sun to part shade', space: '10–12 in', depth: '½ in',
      germ: [7, 10], direct: [1, 4], mat: 50, hw: 90, succ: 0, fert: [['ground', 0, 'No fertilizer: rich soil gives leaves instead of flowers']], bloom: true,
      comp: ['tomato', 'cucumber', 'squash', 'cabbage', 'broccoli', 'radish', 'melon'], avoid: [], note: 'Trap crop for aphids. Leaves and flowers are edible and peppery.' },
    { id: 'sunflower', name: 'Sunflower', cat: 'Flower', fam: 'Daisy family', hardy: 'tender', sun: 'Full sun', space: '12–24 in', depth: '1 in',
      germ: [7, 10], direct: [0, 6], mat: 80, hw: 21, succ: 14, fert: 'flower', bloom: true,
      comp: ['corn', 'cucumber', 'squash'], avoid: ['potato', 'beanpole'], note: 'Seeds are ready when the back of the head turns brown.' },
    { id: 'zinnia', name: 'Zinnia', cat: 'Flower', fam: 'Daisy family', hardy: 'tender', sun: 'Full sun', space: '9–12 in', depth: '¼ in',
      germ: [4, 7], indoor: [-6, -4], seedling: 4, tp: 1, direct: [1, 6], mat: 60, hw: 90, succ: 21, fert: 'flower', bloom: true,
      comp: ['tomato', 'squash', 'cucumber'], avoid: [], note: 'Cut-and-come-again: the more you cut, the more they bloom.' },
  ];

  // Companion relationships are listed one way in places; make them symmetric.
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  for (const p of P) {
    p.comp = p.comp.filter(id => byId[id]);
    p.avoid = p.avoid.filter(id => byId[id]);
  }
  for (const p of P) {
    for (const id of p.comp) if (!byId[id].comp.includes(p.id) && !byId[id].avoid.includes(p.id)) byId[id].comp.push(p.id);
    for (const id of p.avoid) {
      if (!byId[id].avoid.includes(p.id)) byId[id].avoid.push(p.id);
      byId[id].comp = byId[id].comp.filter(c => c !== p.id);
    }
    p.comp = p.comp.filter(c => !p.avoid.includes(c));
    if (typeof p.fert === 'string') p.fert = FERT[p.fert];
    if (!p.fert) p.fert = [];
  }

  window.PLANTS = P;
  window.PLANTS_BY_ID = byId;
})();
